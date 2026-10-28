import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError, validationError } from '../core/errors/app-error';
import type { Investment, InvestmentDraft, InvestmentPatch, Valuation } from '../core/types/investment';
import { type IsoDate, todayIso } from '../core/types/iso-date';
import { type Money, ZERO } from '../core/types/money';
import { type Result, err, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { type EvolutionGranularity, type EvolutionPoint, carryForwardSeries, evolutionRange } from '../domain/analytics/evolution';
import { buildPortfolio } from '../domain/investments/portfolio';
import {
  PRICE_SKIP_LABEL,
  type PriceTarget,
  isAutoRefreshDue,
  pricePlanOf,
  priceTargets,
  valueFromPrice,
} from '../domain/investments/price-refresh';
import { PriceClient } from '../infra/prices/price.client';
import { AppStatusFacade } from './app-status.facade';

/** Resultado de la última actualización de precios, para el aviso de la pantalla. */
export interface PriceRefreshReport {
  readonly at: IsoDate;
  readonly auto: boolean;
  readonly updated: number;
  /** Las que se intentaron y fallaron: conservan su último valor. */
  readonly failed: readonly { readonly name: string; readonly message: string }[];
  /** Las que no se pueden actualizar solas y por qué. */
  readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

/**
 * Sección Inversiones: posiciones con su último valor, rentabilidad, peso y
 * la evolución del total por días, meses o años. Cada actualización guarda
 * una valoración con fecha.
 *
 * El valor se apunta a mano o sale de un precio de mercado (precio ×
 * participaciones) con «Actualizar precios», que además corre sola una vez
 * al día al abrir la app. Si una fuente falla, esa posición conserva su
 * último valor y se avisa.
 */
@Injectable({ providedIn: 'root' })
export class InvestmentsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly prices = new PriceClient();

  private readonly investmentsSig = signal<readonly Investment[]>([]);
  private readonly valuationsSig = signal<readonly Valuation[]>([]);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);
  private readonly refreshingSig = signal(false);
  private readonly refreshReportSig = signal<PriceRefreshReport | null>(null);
  /** La automática se intenta como mucho una vez por sesión, aunque falle. */
  private autoTried = false;

  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly refreshing = this.refreshingSig.asReadonly();
  readonly refreshReport = this.refreshReportSig.asReadonly();
  /** ¿Hay alguna posición que se pueda actualizar con precio de mercado? */
  readonly canRefreshPrices = computed(() => priceTargets(this.investmentsSig()).length > 0);
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

  /**
   * Pide el precio de cada posición con ticker o ISIN y participaciones y
   * guarda la valoración de hoy (precio × participaciones), manteniendo lo
   * aportado de la última. Lo que falla se queda con su valor anterior.
   */
  async refreshPrices(auto = false): Promise<Result<PriceRefreshReport>> {
    if (this.refreshingSig()) return err(validationError('prices', 'Ya se están actualizando los precios.'));
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const settings = await repos.value.settings.getAll();
    if (!settings.ok) return this.report(settings);

    const today = todayIso();
    const active = this.investmentsSig().filter((i) => !i.archived);
    const targets = priceTargets(active);
    const skipped = active.flatMap((i) => {
      const plan = pricePlanOf(i);
      return plan.ok ? [] : [{ name: i.name, reason: PRICE_SKIP_LABEL[plan.reason] }];
    });
    const portfolio = this.portfolio();
    const investedOf = (id: string): Money => portfolio.holdings.find((h) => h.investment.id === id)?.invested ?? ZERO;

    this.refreshingSig.set(true);
    let updated = 0;
    const failed: { name: string; message: string }[] = [];
    try {
      const currency = settings.value.currency;
      const quote = (t: PriceTarget) => (t.source === 'coingecko' ? this.prices.crypto(t.symbol, currency) : this.prices.market(t.symbol, currency));
      // Una a una: son pocas y así no se dispara el límite de peticiones gratuito.
      for (const t of targets) {
        const q = await quote(t);
        if (!q.ok) {
          failed.push({ name: t.investment.name, message: describeError(q.error) });
          continue;
        }
        const saved = await repos.value.investments.upsertValuation({
          investmentId: t.investment.id,
          date: today,
          marketValueCents: valueFromPrice(q.value.price, t.units),
          investedCents: investedOf(t.investment.id),
        });
        if (saved.ok) updated++;
        else failed.push({ name: t.investment.name, message: describeError(saved.error) });
      }
      if (updated > 0) await repos.value.settings.set('pricesRefreshedOn', today);
    } finally {
      this.refreshingSig.set(false);
    }

    const report: PriceRefreshReport = { at: today, auto, updated, failed, skipped };
    this.refreshReportSig.set(report);
    if (updated > 0) this.status.touch();
    this.announce(report, targets.length);
    return ok(report);
  }

  private announce(report: PriceRefreshReport, attempted: number): void {
    if (attempted === 0) {
      if (!report.auto) this.status.notify('Ninguna inversión tiene ticker o ISIN y participaciones para actualizar su precio.', 'expense');
      return;
    }
    if (report.failed.length === 0) {
      if (!report.auto) this.status.notify(report.updated === 1 ? 'Precio actualizado.' : `${report.updated} precios actualizados.`, 'income');
      return;
    }
    const n = report.failed.length;
    this.status.notify(
      `${n === 1 ? 'No se pudo actualizar 1 precio' : `No se pudieron actualizar ${n} precios`}; se mantiene el último valor.`,
      'expense',
    );
  }

  private async maybeAutoRefresh(): Promise<void> {
    if (this.autoTried || this.status.demo()) return;
    const repos = this.db.repos();
    if (!repos) return;
    const targets = priceTargets(this.investmentsSig()).length;
    if (targets === 0) return;
    this.autoTried = true;
    const settings = await repos.settings.getAll();
    if (!settings.ok || !isAutoRefreshDue(settings.value.pricesRefreshedOn, todayIso(), targets)) return;
    await this.refreshPrices(true);
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
    void this.maybeAutoRefresh();
  }
}
