import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError, validationError } from '../core/errors/app-error';
import type { Investment, InvestmentDraft, InvestmentPatch, Valuation } from '../core/types/investment';
import { type IsoDate, todayIso } from '../core/types/iso-date';
import type { Money } from '../core/types/money';
import { type Result, err } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { type EvolutionGranularity, type EvolutionPoint, carryForwardSeries, evolutionRange } from '../domain/analytics/evolution';
import { buildPortfolio } from '../domain/investments/portfolio';
import { AppStatusFacade } from './app-status.facade';

/**
 * Sección Inversiones: posiciones con su último valor (actualizado a mano
 * cuando quieras), rentabilidad, peso y la evolución del total por días,
 * meses o años. Cada actualización guarda una valoración con fecha.
 */
@Injectable({ providedIn: 'root' })
export class InvestmentsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  private readonly investmentsSig = signal<readonly Investment[]>([]);
  private readonly valuationsSig = signal<readonly Valuation[]>([]);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);

  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly granularity = signal<EvolutionGranularity>('day');
  readonly today = signal<IsoDate>(todayIso());

  readonly investments = this.investmentsSig.asReadonly();
  readonly archived = computed(() => this.investmentsSig().filter((i) => i.archived));
  readonly portfolio = computed(() => buildPortfolio(this.investmentsSig(), this.valuationsSig()));

  readonly evolution = computed<readonly EvolutionPoint[]>(() => {
    const active = new Set(this.investmentsSig().filter((i) => !i.archived).map((i) => i.id));
    const points = this.valuationsSig()
      .filter((v) => active.has(v.investmentId))
      .map((v) => ({ key: v.investmentId, date: v.date, value: v.marketValueCents, secondary: v.investedCents }));
    const first = points.reduce<IsoDate | null>((min, p) => (min === null || p.date < min ? p.date : min), null);
    const g = this.granularity();
    return carryForwardSeries(points, evolutionRange(first, this.today(), g), g);
  });

  /** Historia de valoraciones de una inversión, la más reciente primero. */
  historyOf(id: string): readonly Valuation[] {
    return this.valuationsSig()
      .filter((v) => v.investmentId === id)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load());
    });
  }

  async create(draft: InvestmentDraft, marketValue: Money, invested: Money, date: IsoDate): Promise<Result<Investment>> {
    if (!draft.name.trim()) return this.report(err(validationError('name', 'Ponle un nombre a la inversión.')));
    if (marketValue < 0 || invested < 0) return this.report(err(validationError('amount', 'Los importes no pueden ser negativos.')));
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const created = await repos.value.investments.insert(draft, { date, marketValueCents: marketValue, investedCents: invested });
    return this.after(created, `Inversión «${draft.name.trim()}» añadida.`);
  }

  async update(id: string, patch: InvestmentPatch): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(await repos.value.investments.update(id, patch), patch.archived === true ? 'Inversión archivada.' : 'Inversión actualizada.');
  }

  /** Nuevo valor de mercado (y lo aportado) a una fecha; si ya había valor ese día, se sustituye. */
  async updateValue(id: string, marketValue: Money, invested: Money, date: IsoDate): Promise<Result<void>> {
    if (marketValue < 0 || invested < 0) return this.report(err(validationError('amount', 'Los importes no pueden ser negativos.')));
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(
      await repos.value.investments.upsertValuation({ investmentId: id, date, marketValueCents: marketValue, investedCents: invested }),
      'Valor actualizado.',
    );
  }

  async deleteValuation(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(await repos.value.investments.deleteValuation(id), 'Valoración eliminada.');
  }

  async remove(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    return this.after(await repos.value.investments.delete(id), 'Inversión eliminada con toda su historia.');
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

  private report<T>(result: Result<T>): Result<T> {
    if (!result.ok) this.status.notify(describeError(result.error), 'expense');
    return result;
  }

  private async load(): Promise<void> {
    const repos = this.db.repos();
    if (!repos) return;
    this.today.set(todayIso());
    const [investments, valuations] = await Promise.all([repos.investments.findAll(), repos.investments.findValuations()]);
    this.loadingSig.set(false);
    if (!investments.ok) {
      this.errorSig.set(investments.error);
      return;
    }
    if (!valuations.ok) {
      this.errorSig.set(valuations.error);
      return;
    }
    this.errorSig.set(null);
    this.investmentsSig.set(investments.value);
    this.valuationsSig.set(valuations.value);
  }
}
