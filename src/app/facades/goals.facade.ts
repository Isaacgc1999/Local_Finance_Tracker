import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError, validationError } from '../core/errors/app-error';
import { type ContributionFrequency, type Goal, type GoalDraft, type GoalPatch } from '../core/types/goal';
import { type IsoDate, addMonthsClamped, endOfMonth, startOfMonth, todayIso } from '../core/types/iso-date';
import { type Money, ZERO, money } from '../core/types/money';
import { type Result, err, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { outflowOf, totalsByType } from '../domain/analytics/aggregation';
import { type GoalPlan, computeGoalPlan, toMonthly } from '../domain/goals/goal-plan';
import { AppStatusFacade } from './app-status.facade';
import { SavingsFacade } from './savings.facade';

export interface GoalView {
  readonly goal: Goal;
  readonly plan: GoalPlan;
  readonly potId: string | null;
  /** Aporte mensual equivalente para llegar a tiempo (para sumar objetivos). */
  readonly monthlyNeed: Money;
}

/** Meses completos con los que se mide la capacidad de ahorro. */
const CAPACITY_MONTHS = 3;

/**
 * Sección Objetivos: cada objetivo con su plan (tiempo que queda, aporte por
 * día, semana, mes y año, y si vas por delante o por detrás) y si la suma de
 * todos cabe en lo que te sobra cada mes.
 */
@Injectable({ providedIn: 'root' })
export class GoalsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly savings = inject(SavingsFacade);

  private readonly goalsSig = signal<readonly Goal[]>([]);
  private readonly capacitySig = signal<Money | null>(null);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);

  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly today = signal<IsoDate>(todayIso());
  /** Ahorro medio mensual (ingresos − gastos) de los últimos meses completos; `null` sin datos. */
  readonly capacity = this.capacitySig.asReadonly();
  readonly capacityMonths = CAPACITY_MONTHS;

  readonly views = computed<readonly GoalView[]>(() => {
    const balances = this.savings.balances();
    const pots = this.savings.pots();
    const today = this.today();
    return this.goalsSig().map((goal) => {
      const pot = pots.find((p) => p.goalId === goal.id) ?? null;
      const saved = pot ? (balances.get(pot.id) ?? ZERO) : ZERO;
      const plan = computeGoalPlan(goal, saved, today);
      return { goal, plan, potId: pot?.id ?? null, monthlyNeed: plan.health === 'achieved' ? ZERO : toMonthly(plan.per[goal.frequency], goal.frequency) };
    });
  });

  readonly active = computed(() => this.views().filter((v) => v.goal.status === 'active'));
  readonly closed = computed(() => this.views().filter((v) => v.goal.status !== 'active'));

  readonly totals = computed(() => {
    const list = this.active();
    return {
      target: money(list.reduce((s, v) => s + v.goal.targetCents, 0)),
      saved: money(list.reduce((s, v) => s + Math.min(v.plan.saved, v.goal.targetCents), 0)),
      monthlyNeed: money(list.reduce((s, v) => s + v.monthlyNeed, 0)),
    };
  });

  /** ¿Caben los aportes mensuales de todos los objetivos en tu capacidad de ahorro? */
  readonly fit = computed<'fits' | 'tight' | 'over' | 'unknown'>(() => {
    const cap = this.capacitySig();
    const need = this.totals().monthlyNeed;
    if (cap === null) return 'unknown';
    if (need <= 0) return 'fits';
    if (need > cap) return 'over';
    return need * 10 > cap * 8 ? 'tight' : 'fits';
  });

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load());
    });
  }

  async create(draft: GoalDraft, alreadySaved: Money): Promise<Result<Goal>> {
    const invalid = validateGoal(draft);
    if (invalid) return this.report(err(invalid));
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const created = await repos.value.goals.insert(draft, alreadySaved, todayIso());
    if (!created.ok) return this.report(created);
    this.status.touch();
    this.status.notify(`Objetivo «${created.value.goal.name}» creado con su hucha en Ahorros.`, 'income');
    return ok(created.value.goal);
  }

  async update(id: string, patch: GoalPatch): Promise<Result<Goal>> {
    const current = this.goalsSig().find((g) => g.id === id);
    if (current) {
      const invalid = validateGoal({ ...current, ...patch });
      if (invalid) return this.report(err(invalid));
    }
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const updated = await repos.value.goals.update(id, patch);
    if (!updated.ok) return this.report(updated);
    this.status.touch();
    return updated;
  }

  async setStatus(id: string, status: Goal['status']): Promise<Result<Goal>> {
    const result = await this.update(id, { status });
    if (result.ok) {
      this.status.notify(status === 'achieved' ? '¡Objetivo conseguido! 🎉' : status === 'archived' ? 'Objetivo archivado.' : 'Objetivo reactivado.', 'income');
    }
    return result;
  }

  async remove(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const deleted = await repos.value.goals.delete(id);
    if (!deleted.ok) return this.report(deleted);
    this.status.touch();
    this.status.notify('Objetivo y su hucha eliminados.');
    return deleted;
  }

  /** Aportación (o retirada, con importe negativo) a la hucha del objetivo. */
  async contribute(goalId: string, amount: Money, date: IsoDate, note: string | null): Promise<Result<unknown>> {
    const pot = this.savings.potOfGoal(goalId);
    if (!pot) return this.report(err(validationError('goal', 'Este objetivo no tiene hucha.')));
    const result = await this.savings.addEntry(pot.id, amount, date, note);
    if (result.ok) {
      const view = this.views().find((v) => v.goal.id === goalId);
      if (view && view.goal.status === 'active' && view.plan.saved + amount >= view.goal.targetCents) {
        this.status.notify(`¡Has llegado a «${view.goal.name}»! Márcalo como conseguido cuando quieras.`, 'income');
      }
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
    const today = todayIso();
    const from = startOfMonth(addMonthsClamped(today, -CAPACITY_MONTHS, 1));
    const to = endOfMonth(addMonthsClamped(today, -1, 1));
    const [goals, events] = await Promise.all([repos.goals.findAll(), repos.events.findInRange({ from, to })]);
    this.loadingSig.set(false);
    if (!goals.ok) {
      this.errorSig.set(goals.error);
      return;
    }
    this.errorSig.set(null);
    this.goalsSig.set(goals.value);
    if (events.ok && events.value.length > 0) {
      const t = totalsByType(events.value);
      this.capacitySig.set(money(Math.round((t.income - outflowOf(t)) / CAPACITY_MONTHS)));
    } else {
      this.capacitySig.set(null);
    }
  }
}

function validateGoal(g: Pick<GoalDraft, 'name' | 'targetCents' | 'startDate' | 'targetDate'>) {
  if (!g.name.trim()) return validationError('name', 'Ponle un nombre al objetivo.');
  if (!(g.targetCents > 0)) return validationError('target', 'El importe tiene que ser mayor que cero.');
  if (g.targetDate <= g.startDate) return validationError('targetDate', 'La fecha objetivo tiene que ser posterior a la de inicio.');
  return null;
}

export type { ContributionFrequency };
