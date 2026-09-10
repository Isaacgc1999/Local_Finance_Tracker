import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError, notReady, validationError } from '../core/errors/app-error';
import type { AiReport } from '../core/types/ai-report';
import {
  type IsoDate,
  addWeeks,
  endOfIsoWeek,
  startOfIsoWeek,
  todayIso,
} from '../core/types/iso-date';
import { type Money, money } from '../core/types/money';
import type { Recurrence } from '../core/types/recurrence';
import { DEFAULT_SETTINGS, type Settings } from '../core/types/settings';
import { type Result, err, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { AI_REQUEST_OPTIONS, AI_TIMEOUT_MS, appliedSavings, generateWeeklyReport, pendingSavings } from '../domain/ai/ai.service';
import { type WeeklySummary, buildWeeklySummary } from '../domain/ai/weekly-summary.builder';
import { OllamaClient } from '../infra/ollama/ollama.client';
import { AppStatusFacade } from './app-status.facade';

export type ModelStatus = 'unknown' | 'checking' | 'connected' | 'not_detected' | 'model_missing' | 'generating' | 'error';

export interface GeneratingState {
  readonly weekStart: IsoDate;
  readonly weekLabel: string;
  readonly elapsedMs: number;
  readonly chunks: number;
  readonly eventCount: number;
  /** 0–10000 (puntos básicos); se estima con la duración del último informe. */
  readonly progressBp: number;
  readonly indeterminate: boolean;
}

export interface SavingsSource {
  readonly label: string;
  readonly amount: Money;
  readonly applied: boolean;
}

/** Semanas previas que se comparan en el resumen (regla: las 4 anteriores). */
const HISTORY_WEEKS = 4;
const PROGRESS_CAP_BP = 9000;

/** Informes semanales de IA: estado del modelo, generación y caché en `ai_reports`. */
@Injectable({ providedIn: 'root' })
export class AiFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly client = new OllamaClient();

  private readonly reportsSig = signal<readonly AiReport[]>([]);
  private readonly settingsSig = signal<Settings>(DEFAULT_SETTINGS);
  private readonly modelStatusSig = signal<ModelStatus>('unknown');
  private readonly latencySig = signal<number | null>(null);
  private readonly statusErrorSig = signal<string>('');
  private readonly generatingSig = signal<GeneratingState | null>(null);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);
  private readonly expandedSig = signal<string | null>(null);
  private readonly fallbackSig = signal<WeeklySummary | null>(null);

  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly reports = this.reportsSig.asReadonly();
  readonly settings = this.settingsSig.asReadonly();
  readonly modelStatus = this.modelStatusSig.asReadonly();
  readonly latencyMs = this.latencySig.asReadonly();
  readonly statusError = this.statusErrorSig.asReadonly();
  readonly generating = this.generatingSig.asReadonly();
  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly expandedId = this.expandedSig.asReadonly();
  /** Métricas locales de la última semana: fallback cuando el informe falla. */
  readonly fallback = this.fallbackSig.asReadonly();

  readonly latest = computed<AiReport | null>(() => this.reportsSig()[0] ?? null);
  readonly lastCompleted = computed<AiReport | null>(() => this.reportsSig().find((r) => r.status === 'completed') ?? null);
  readonly empty = computed(() => !this.loadingSig() && this.reportsSig().length === 0 && this.generatingSig() === null);

  readonly connected = computed(() => this.modelStatusSig() === 'connected' || this.modelStatusSig() === 'generating');
  readonly endpointLabel = computed(() => this.settingsSig().ollamaEndpoint.replace(/^https?:\/\//, ''));

  readonly savings = computed(() => {
    const report = this.lastCompleted();
    const pending = money(pendingSavings(report));
    const applied = money(appliedSavings(report));
    const sources: SavingsSource[] = (report?.recommendations ?? [])
      .filter((r) => r.monthly_impact_cents > 0)
      .map((r) => ({ label: r.action, amount: money(r.monthly_impact_cents), applied: r.applied === true }))
      .sort((a, b) => b.amount - a.amount);
    return { monthly: pending, applied, yearly: money(pending * 12), sources };
  });

  /** Semana que toca analizar: la última completa (la anterior a la actual). */
  readonly targetWeek = computed<IsoDate>(() => startOfIsoWeek(addWeeks(todayIso(), -1)));

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load());
    });
  }

  toggle(id: string): void {
    this.expandedSig.update((current) => (current === id ? null : id));
  }

  expanded(report: AiReport): boolean {
    const current = this.expandedSig();
    return current === null ? report.id === this.latest()?.id : current === report.id;
  }

  /** Comprueba servicio y modelo; alimenta la pill de estado. */
  async checkStatus(): Promise<void> {
    const settings = this.settingsSig();
    this.modelStatusSig.set('checking');
    this.statusErrorSig.set('');
    const ping = await this.client.ping(settings.ollamaEndpoint);
    if (!ping.ok) {
      this.latencySig.set(null);
      this.modelStatusSig.set('not_detected');
      this.statusErrorSig.set(describeError(ping.error));
      return;
    }
    this.latencySig.set(ping.value.latencyMs);
    const models = await this.client.listModels(settings.ollamaEndpoint);
    // Una lista vacía también significa que el modelo no está descargado;
    // solo si la consulta falla se da el estado por bueno.
    if (models.ok && !models.value.some((m) => m === settings.ollamaModel || m.startsWith(settings.ollamaModel))) {
      this.modelStatusSig.set('model_missing');
      this.statusErrorSig.set(`El modelo «${settings.ollamaModel}» no está descargado. Ejecuta: ollama pull ${settings.ollamaModel}`);
      return;
    }
    this.modelStatusSig.set('connected');
    // Se precarga el modelo en cuanto se sabe que está: mientras la persona
    // lee la pantalla, Ollama ya lo tiene en memoria para el informe.
    void this.client.warmUp(settings.ollamaEndpoint, settings.ollamaModel, AI_REQUEST_OPTIONS.keep_alive);
  }

  /** Genera (o regenera) el informe de una semana. Sobrescribe el que hubiera. */
  async regenerate(weekStart: IsoDate = this.targetWeek()): Promise<Result<AiReport>> {
    if (this.generatingSig()) return err(notReady('Ya hay un informe generándose.'));
    const repos = this.db.require();
    if (!repos.ok) return repos;

    const summary = await this.buildSummary(weekStart);
    if (!summary.ok) return summary;
    this.fallbackSig.set(summary.value);

    // Una semana sin movimientos no se le manda al modelo: no hay nada que
    // analizar y pedírselo solo serviría para que se inventara cifras.
    if (summary.value.movements === 0) {
      const message = `No hay movimientos en la ${summary.value.week_label.toLowerCase()}. Registra alguno y vuelve a generar el análisis.`;
      this.statusErrorSig.set(message);
      this.status.notify(message);
      return err(validationError('week', message));
    }

    const settings = this.settingsSig();
    const started = Date.now();
    const reference = this.lastCompleted()?.durationMs ?? null;
    this.controller = new AbortController();
    this.modelStatusSig.set('generating');
    this.generatingSig.set({
      weekStart,
      weekLabel: summary.value.week_label,
      elapsedMs: 0,
      chunks: 0,
      eventCount: summary.value.movements,
      progressBp: 0,
      indeterminate: reference === null,
    });
    this.timer = setInterval(() => this.tick(started, reference), 250);

    const outcome = await generateWeeklyReport(this.client, {
      summary: summary.value,
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
      signal: this.controller.signal,
      onProgress: (_partial, chunks) => this.generatingSig.update((g) => (g ? { ...g, chunks } : g)),
    });

    this.stopTimer();
    this.generatingSig.set(null);
    this.controller = null;

    if (!outcome.ok) {
      this.modelStatusSig.set('error');
      return outcome;
    }

    const saved = await repos.value.aiReports.upsert(outcome.value.report);
    if (!saved.ok) {
      this.modelStatusSig.set('error');
      return saved;
    }
    await this.load();
    this.expandedSig.set(saved.value.id);

    if (saved.value.status === 'failed') {
      this.modelStatusSig.set(saved.value.error?.includes('no está descargado') ? 'model_missing' : saved.value.error?.includes('No se encuentra') ? 'not_detected' : 'error');
      this.statusErrorSig.set(saved.value.error ?? '');
      this.status.notify('No se pudo generar el informe. Se muestran tus métricas locales.', 'expense');
    } else {
      this.modelStatusSig.set('connected');
      this.status.notify(outcome.value.retried ? 'Informe generado (con un reintento).' : 'Informe generado.', 'income');
    }
    return ok(saved.value);
  }

  cancel(): void {
    this.controller?.abort();
    this.stopTimer();
    this.generatingSig.set(null);
    this.modelStatusSig.set('connected');
  }

  /** Marca o desmarca una recomendación como aplicada. */
  async applyRecommendation(reportId: string, index: number, applied = true): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const result = await repos.value.aiReports.setRecommendationApplied(reportId, index, applied);
    if (result.ok) {
      this.reportsSig.update((list) => list.map((r) => (r.id === reportId ? result.value : r)));
      this.status.notify(applied ? 'Recomendación marcada como aplicada.' : 'Recomendación reactivada.');
    } else {
      this.status.notify(describeError(result.error), 'expense');
    }
  }

  // ── internos ──────────────────────────────────────────────────────────

  private tick(started: number, reference: number | null): void {
    this.generatingSig.update((g) => {
      if (!g) return g;
      const elapsedMs = Date.now() - started;
      const progressBp = reference && reference > 0 ? Math.min(PROGRESS_CAP_BP, Math.round((elapsedMs / reference) * 10000)) : 0;
      return { ...g, elapsedMs, progressBp };
    });
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async load(): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(repos.error);
      this.loadingSig.set(false);
      return;
    }
    this.loadingSig.set(true);
    const [reports, settings] = await Promise.all([repos.value.aiReports.findAll(), repos.value.settings.getAll()]);
    this.loadingSig.set(false);
    if (!reports.ok) {
      this.errorSig.set(reports.error);
      return;
    }
    this.errorSig.set(null);
    this.reportsSig.set(reports.value);
    if (settings.ok) this.settingsSig.set(settings.value);
    if (this.modelStatusSig() === 'unknown') void this.checkStatus();
    if (this.fallbackSig() === null) {
      const summary = await this.buildSummary(this.targetWeek());
      if (summary.ok) this.fallbackSig.set(summary.value);
    }
  }

  /** Contexto compacto de la semana: nunca se envían los movimientos en crudo. */
  private async buildSummary(weekStart: IsoDate): Promise<Result<WeeklySummary>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const from = startOfIsoWeek(weekStart);
    const to = endOfIsoWeek(from);
    const historyFrom = addWeeks(from, -HISTORY_WEEKS);

    const [events, categories, rules, budgets] = await Promise.all([
      repos.value.events.findInRange({ from: historyFrom, to }),
      repos.value.categories.findAll(),
      repos.value.recurrences.findAll({ activeOnly: true }),
      repos.value.budgets.findAll(),
    ]);
    if (!events.ok) return events;
    if (!categories.ok) return categories;

    const week = events.value.filter((e) => e.date >= from && e.date <= to);
    const previousWeeks = Array.from({ length: HISTORY_WEEKS }, (_, i) => {
      const start = addWeeks(from, -(HISTORY_WEEKS - i));
      const end = endOfIsoWeek(start);
      return events.value.filter((e) => e.date >= start && e.date <= end);
    });

    return ok(
      buildWeeklySummary({
        weekStart: from,
        events: week,
        previousWeeks,
        activeSubscriptions: (rules.ok ? rules.value : []) as readonly Recurrence[],
        categories: new Map(categories.value.map((c) => [c.id, c])),
        budgetTargetCents: (budgets.ok ? budgets.value.find((b) => b.scope === 'total')?.amountCents : undefined) ?? null,
      }),
    );
  }

  readonly timeoutSeconds = Math.round(AI_TIMEOUT_MS / 1000);
}
