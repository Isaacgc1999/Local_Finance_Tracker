import type { IsoDate } from './iso-date';
import type { Money } from './money';

export const GOAL_KINDS = ['saving', 'purchase', 'investment', 'travel', 'debt', 'other'] as const;

export type GoalKind = (typeof GOAL_KINDS)[number];

export function isGoalKind(value: unknown): value is GoalKind {
  return typeof value === 'string' && (GOAL_KINDS as readonly string[]).includes(value);
}

export const GOAL_KIND_LABEL: Readonly<Record<GoalKind, string>> = {
  saving: 'Ahorrar',
  purchase: 'Comprar algo',
  investment: 'Invertir',
  travel: 'Viaje',
  debt: 'Pagar una deuda',
  other: 'Otro',
};

/** Ejemplo del campo nombre según el tipo. */
export const GOAL_KIND_PLACEHOLDER: Readonly<Record<GoalKind, string>> = {
  saving: 'Colchón para la entrada del piso',
  purchase: 'iPhone 17 Pro sin financiar',
  investment: 'Aportar al indexado',
  travel: 'Japón en primavera',
  debt: 'Liquidar el préstamo del coche',
  other: 'Mi objetivo',
};

export const GOAL_KIND_COLOR: Readonly<Record<GoalKind, string>> = {
  saving: '#FBBF24',
  purchase: '#A78BFA',
  investment: '#38BDF8',
  travel: '#2DD4BF',
  debt: '#F45B5B',
  other: '#6E56F8',
};

export const CONTRIBUTION_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

export type ContributionFrequency = (typeof CONTRIBUTION_FREQUENCIES)[number];

export function isContributionFrequency(value: unknown): value is ContributionFrequency {
  return typeof value === 'string' && (CONTRIBUTION_FREQUENCIES as readonly string[]).includes(value);
}

export const FREQUENCY_LABEL: Readonly<Record<ContributionFrequency, string>> = {
  daily: 'Diario',
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

/** «al día», «a la semana»… */
export const FREQUENCY_PER: Readonly<Record<ContributionFrequency, string>> = {
  daily: 'al día',
  weekly: 'a la semana',
  monthly: 'al mes',
  yearly: 'al año',
};

export type GoalStatus = 'active' | 'achieved' | 'archived';

export interface Goal {
  readonly id: string;
  readonly name: string;
  readonly kind: GoalKind;
  readonly targetCents: Money;
  /** Desde cuándo se ahorra para él (para saber si vas por delante o por detrás). */
  readonly startDate: IsoDate;
  readonly targetDate: IsoDate;
  /** Frecuencia de aporte de referencia; por defecto mensual. */
  readonly frequency: ContributionFrequency;
  readonly status: GoalStatus;
  readonly color: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type GoalDraft = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>;

export type GoalPatch = Partial<GoalDraft>;
