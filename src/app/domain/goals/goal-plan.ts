import type { ContributionFrequency, Goal } from '../../core/types/goal';
import { type IsoDate, daysBetween } from '../../core/types/iso-date';
import { type Money, ZERO, money } from '../../core/types/money';

/** Días medios de cada periodo, para repartir lo que falta. */
const DAYS_PER: Readonly<Record<ContributionFrequency, number>> = {
  daily: 1,
  weekly: 7,
  monthly: 365.25 / 12,
  yearly: 365.25,
};

export type GoalHealth = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'overdue';

export interface TimeLeft {
  readonly days: number;
  readonly weeks: number;
  /** Meses con un decimal (14,8). */
  readonly months: number;
  /** Años con un decimal (1,2). */
  readonly years: number;
  /** Desglose «1 año, 2 meses y 24 días». */
  readonly parts: { readonly years: number; readonly months: number; readonly days: number };
}

export interface GoalPlan {
  readonly saved: Money;
  readonly remaining: Money;
  /** Avance en puntos básicos (10000 = 100 %), recortado a [0, 10000]. */
  readonly progressBp: number;
  readonly timeLeft: TimeLeft;
  /** Aporte necesario por periodo para llegar a tiempo con lo que falta. */
  readonly per: Readonly<Record<ContributionFrequency, Money>>;
  /** Lo que tocaría llevar hoy con un ritmo lineal desde el inicio. */
  readonly expectedNow: Money;
  /** saved − expectedNow: positivo = vas por delante. */
  readonly vsPlan: Money;
  readonly health: GoalHealth;
}

/** Margen (en ‰ del objetivo) dentro del cual se considera «en el plan». */
const ON_TRACK_TOLERANCE_PERMILLE = 20;

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Desglose de días en años, meses y días de calendario medios. */
export function timeLeft(from: IsoDate, to: IsoDate): TimeLeft {
  const days = Math.max(0, daysBetween(from, to));
  const years = Math.floor(days / 365.25);
  const restAfterYears = days - Math.round(years * 365.25);
  const months = Math.floor(restAfterYears / DAYS_PER.monthly);
  const rest = Math.max(0, restAfterYears - Math.round(months * DAYS_PER.monthly));
  return {
    days,
    weeks: roundTo(days / 7, 1),
    months: roundTo(days / DAYS_PER.monthly, 1),
    years: roundTo(days / DAYS_PER.yearly, 1),
    parts: { years, months, days: rest },
  };
}

/**
 * Cuánto hay que aportar en cada periodo para cubrir `remaining` en
 * `daysLeft` días. Siempre redondeado hacia arriba al céntimo: más vale
 * llegar un céntimo sobrado que quedarse corto. Si queda menos de un
 * periodo, el aporte es todo lo que falta.
 */
export function contributionPer(remaining: Money, daysLeft: number): Readonly<Record<ContributionFrequency, Money>> {
  const out = {} as Record<ContributionFrequency, Money>;
  for (const f of Object.keys(DAYS_PER) as ContributionFrequency[]) {
    if (remaining <= 0) {
      out[f] = ZERO;
      continue;
    }
    const periods = daysLeft / DAYS_PER[f];
    out[f] = periods <= 1 ? remaining : money(Math.ceil(remaining / periods));
  }
  return out;
}

export function computeGoalPlan(goal: Pick<Goal, 'targetCents' | 'startDate' | 'targetDate' | 'status'>, saved: Money, today: IsoDate): GoalPlan {
  const target = goal.targetCents;
  const remaining = money(Math.max(0, target - saved));
  const progressBp = target > 0 ? Math.max(0, Math.min(10000, Math.floor((saved * 10000) / target))) : 0;
  const left = timeLeft(today, goal.targetDate);
  const total = Math.max(1, daysBetween(goal.startDate, goal.targetDate));
  const elapsed = Math.min(total, Math.max(0, daysBetween(goal.startDate, today)));
  const expectedNow = money(Math.round((target * elapsed) / total));
  const vsPlan = money(saved - expectedNow);

  let health: GoalHealth;
  if (saved >= target || goal.status === 'achieved') health = 'achieved';
  else if (today > goal.targetDate) health = 'overdue';
  else if (Math.abs(vsPlan) * 1000 <= target * ON_TRACK_TOLERANCE_PERMILLE) health = 'on_track';
  else health = vsPlan > 0 ? 'ahead' : 'behind';

  return {
    saved,
    remaining,
    progressBp,
    timeLeft: left,
    per: contributionPer(remaining, left.days),
    expectedNow,
    vsPlan,
    health,
  };
}

/** Fecha en la que se llegaría aportando `amount` cada periodo (para «¿y si aporto X?»). */
export function projectedDays(remaining: Money, amount: Money, frequency: ContributionFrequency): number | null {
  if (remaining <= 0) return 0;
  if (amount <= 0) return null;
  return Math.ceil((remaining / amount) * DAYS_PER[frequency]);
}

/** Pasa un aporte de una frecuencia a mensual (para sumar objetivos con frecuencias distintas). */
export function toMonthly(amount: Money, frequency: ContributionFrequency): Money {
  return money(Math.round((amount * DAYS_PER.monthly) / DAYS_PER[frequency]));
}
