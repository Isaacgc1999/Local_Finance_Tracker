import type { IsoDate } from './iso-date';
import type { Money } from './money';

export const POT_KINDS = ['emergency', 'general', 'goal'] as const;

export type PotKind = (typeof POT_KINDS)[number];

export function isPotKind(value: unknown): value is PotKind {
  return typeof value === 'string' && (POT_KINDS as readonly string[]).includes(value);
}

export const POT_KIND_LABEL: Readonly<Record<PotKind, string>> = {
  emergency: 'Fondo de emergencia',
  general: 'Ahorro general',
  goal: 'Ahorro específico',
};

export const POT_KIND_HINT: Readonly<Record<PotKind, string>> = {
  emergency: 'Para imprevistos: lo recomendable son de 3 a 6 meses de gastos.',
  general: 'Lo ahorrado sin un fin concreto. Los ahorros sin hucha van aquí.',
  goal: 'Ligado a un objetivo: el coche, el móvil, el viaje…',
};

/** Hucha de ahorro. Su saldo sale de sus apuntes y de los movimientos de ahorro que la señalan. */
export interface SavingsPot {
  readonly id: string;
  readonly name: string;
  readonly kind: PotKind;
  readonly color: string;
  /** Meta opcional de la hucha (p. ej. 6 meses de gastos en el fondo de emergencia). */
  readonly targetCents: Money | null;
  /** Objetivo al que pertenece (solo `goal`). */
  readonly goalId: string | null;
  readonly archived: boolean;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SavingsPotDraft = Omit<SavingsPot, 'id' | 'createdAt' | 'updatedAt'>;

export type SavingsPotPatch = Partial<Omit<SavingsPotDraft, 'kind' | 'goalId'>>;

/** Aportación (+) o retirada (−) a mano en una hucha. */
export interface PotEntry {
  readonly id: string;
  readonly potId: string;
  readonly date: IsoDate;
  /** Con signo, nunca 0. */
  readonly amountCents: Money;
  readonly note: string | null;
  readonly createdAt: string;
}

export type PotEntryDraft = Omit<PotEntry, 'id' | 'createdAt'>;
