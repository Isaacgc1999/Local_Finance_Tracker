import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError } from '../core/errors/app-error';
import type { Event } from '../core/types/event';
import type { Goal } from '../core/types/goal';
import { type IsoDate, addMonthsClamped, endOfMonth, startOfMonth, todayIso } from '../core/types/iso-date';
import { type Money, ZERO, money, ratioBasisPoints } from '../core/types/money';
import type { Result } from '../core/types/result';
import type { PotEntry, PotKind, SavingsPot, SavingsPotDraft, SavingsPotPatch } from '../core/types/savings';
import { DbConnection } from '../data/db/db-connection';
import { GENERAL_POT_ID } from '../data/db/migrations/0007-goals-savings-investments';
import { outflowOf, totalsByType } from '../domain/analytics/aggregation';
import { type EvolutionGranularity, type EvolutionPoint, cumulativeSeries, evolutionRange } from '../domain/analytics/evolution';
import { type PotFlow, balancesByPot, defaultPotId, potFlows } from '../domain/savings/pot-balances';
import { AppStatusFacade } from './app-status.facade';

export interface PotView {
  readonly pot: SavingsPot;
  readonly balance: Money;
  /** Avance hacia la meta de la hucha, si tiene. */
  readonly progressBp: number | null;
  readonly goal: Goal | null;
  /** Peso en el total ahorrado. */
  readonly shareBp: number | null;
  readonly flows: readonly PotFlow[];
}

export interface PotGroup {
  readonly kind: PotKind;
  readonly pots: readonly PotView[];
  readonly total: Money;
}

const KIND_ORDER: readonly PotKind[] = ['emergency', 'general', 'goal'];

/**
 * Sección Ahorros: huchas por tipo (fondo de emergencia, ahorro general y
 * ahorro específico de cada objetivo), su saldo, el total y su evolución.
 * El saldo de cada hucha = apuntes a mano + movimientos de tipo ahorro.
 */
@Injectable({ providedIn: 'root' })
export class SavingsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  private readonly potsSig = signal<readonly SavingsPot[]>([]);
  private readonly entriesSig = signal<readonly PotEntry[]>([]);
  private readonly savingsSig = signal<readonly Event[]>([]);
  private readonly goalsSig = signal<readonly Goal[]>([]);
  private readonly avgOutflowSig = signal<Money | null>(null);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);

  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly granularity = signal<EvolutionGranularity>('month');
  readonly today = signal<IsoDate>(todayIso());

  readonly pots = this.potsSig.asReadonly();
  /** Gasto medio mensual de los últimos 3 meses completos (para medir el fondo de emergencia). */
  readonly avgOutflow = this.avgOutflowSig.asReadonly();
  readonly activePots = computed(() => this.potsSig().filter((p) => !p.archived));
  private readonly fallbackPotId = computed(() => defaultPotId(this.potsSig(), GENERAL_POT_ID));

  readonly flows = computed(() => potFlows(this.potsSig(), this.entriesSig(), this.savingsSig(), this.fallbackPotId()));
  readonly balances = computed(() => balancesByPot(this.flows()));
  readonly total = computed(() => money(this.activePots().reduce((s, p) => s + (this.balances().get(p.id) ?? 0), 0)));

  readonly views = computed<readonly PotView[]>(() => {
    const balances = this.balances();
    const goals = new Map(this.goalsSig().map((g) => [g.id, g]));
    const total = this.total();
    const flows = this.flows();
    return this.activePots().map((pot) => {
      const balance = balances.get(pot.id) ?? ZERO;
      return {
        pot,
        balance,
        progressBp: pot.targetCents ? Math.max(0, Math.min(10000, Math.floor((balance * 10000) / pot.targetCents))) : null,
        goal: pot.goalId ? (goals.get(pot.goalId) ?? null) : null,
        shareBp: ratioBasisPoints(balance, total),
        flows: flows.filter((f) => f.potId === pot.id).slice(-5).reverse(),
      };
    });
  });

  readonly groups = computed<readonly PotGroup[]>(() =>
    KIND_ORDER.map((kind) => {
      const pots = this.views().filter((v) => v.pot.kind === kind);
      return { kind, pots, total: money(pots.reduce((s, v) => s + v.balance, 0)) };
    }),
  );

  readonly evolution = computed<readonly EvolutionPoint[]>(() => {
    const active = new Set(this.activePots().map((p) => p.id));
    const flows = this.flows().filter((f) => active.has(f.potId));
    const g = this.granularity();
    return cumulativeSeries(flows, evolutionRange(flows[0]?.date ?? null, this.today(), g), g);
  });

  /** Variación del total en los últimos 30 días. */
  readonly last30 = computed(() => {
    const from = this.today();
    const cut = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8)) - 30)).toISOString().slice(0, 10);
    const active = new Set(this.activePots().map((p) => p.id));
    return money(this.flows().filter((f) => active.has(f.potId) && f.date > cut).reduce((s, f) => s + f.amount, 0));
  });

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load());
    });
  }

  potOfGoal(goalId: string): SavingsPot | null {
    return this.potsSig().find((p) => p.goalId === goalId) ?? null;
  }

  async addEntry(potId: string, amountCents: Money, date: IsoDate, note: string | null): Promise<Result<PotEntry>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const created = await repos.value.savings.insertEntry({ potId, amountCents, date, note: note?.trim() || null });
    return this.after(created, amountCents > 0 ? 'Aportación guardada.' : 'Retirada guardada.');
  }

  /** «Ajustar saldo»: apunta la diferencia para que la hucha marque `balance`. */
  async setBalance(potId: string, balance: Money, date: IsoDate = todayIso()): Promise<Result<PotEntry | null>> {
    const current = this.balances().get(potId) ?? ZERO;
    const diff = balance - current;
    if (diff === 0) return { ok: true, value: null };
    return this.addEntry(potId, money(diff), date, 'Ajuste de saldo');
  }

  async deleteEntry(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(await repos.value.savings.deleteEntry(id), 'Apunte eliminado.');
  }

  async createPot(draft: SavingsPotDraft): Promise<Result<SavingsPot>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(await repos.value.savings.insertPot(draft), `Hucha «${draft.name.trim()}» creada.`);
  }

  async updatePot(id: string, patch: SavingsPotPatch): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(await repos.value.savings.updatePot(id, patch), 'Hucha actualizada.');
  }

  async deletePot(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(await repos.value.savings.deletePot(id), 'Hucha eliminada.');
  }

  private after<T>(result: Result<T>, okText: string): Result<T> {
    if (result.ok) {
      this.status.touch();
      this.status.notify(okText, 'income');
    } else {
      this.status.notify(describeError(result.error), 'expense');
    }
    return result;
  }

  private async load(): Promise<void> {
    const repos = this.db.repos();
    if (!repos) return;
    this.today.set(todayIso());
    const today = todayIso();
    const [pots, entries, savings, goals, recent] = await Promise.all([
      repos.savings.findPots(),
      repos.savings.findEntries(),
      repos.events.findSavings(),
      repos.goals.findAll(),
      repos.events.findInRange({ from: startOfMonth(addMonthsClamped(today, -3, 1)), to: endOfMonth(addMonthsClamped(today, -1, 1)) }),
    ]);
    if (recent.ok && recent.value.length > 0) this.avgOutflowSig.set(money(Math.round(outflowOf(totalsByType(recent.value)) / 3)));
    else this.avgOutflowSig.set(null);
    this.loadingSig.set(false);
    const failed = [pots, entries, savings, goals].find((r) => !r.ok);
    if (failed && !failed.ok) {
      this.errorSig.set(failed.error);
      return;
    }
    this.errorSig.set(null);
    if (pots.ok) this.potsSig.set(pots.value);
    if (entries.ok) this.entriesSig.set(entries.value);
    if (savings.ok) this.savingsSig.set(savings.value);
    if (goals.ok) this.goalsSig.set(goals.value);
  }
}
