import type { Event } from '../../core/types/event';
import type { IsoDate } from '../../core/types/iso-date';
import { type Money, ZERO, money } from '../../core/types/money';
import type { PotEntry, SavingsPot } from '../../core/types/savings';

/** Un movimiento de dinero en una hucha: un apunte a mano o un movimiento de ahorro. */
export interface PotFlow {
  readonly potId: string;
  readonly date: IsoDate;
  /** Con signo: + aporta, − retira. */
  readonly amount: number;
  readonly source: 'entry' | 'event';
  readonly label: string;
  readonly refId: string;
}

/**
 * Hucha que recibe un movimiento de ahorro: la de `meta.potId` si existe y
 * no está borrada; si no, la de «Ahorro general» (o la primera general).
 */
export function potForSaving(e: Event, pots: readonly SavingsPot[], fallbackId: string | null): string | null {
  const wanted = e.meta?.type === 'saving' ? e.meta.potId : undefined;
  if (wanted && pots.some((p) => p.id === wanted)) return wanted;
  return fallbackId;
}

export function defaultPotId(pots: readonly SavingsPot[], preferredId: string): string | null {
  return pots.find((p) => p.id === preferredId)?.id ?? pots.find((p) => p.kind === 'general' && !p.archived)?.id ?? pots[0]?.id ?? null;
}

/** Todos los flujos de todas las huchas, en orden de fecha. */
export function potFlows(pots: readonly SavingsPot[], entries: readonly PotEntry[], savings: readonly Event[], fallbackId: string | null): PotFlow[] {
  const known = new Set(pots.map((p) => p.id));
  const out: PotFlow[] = [];
  for (const en of entries) {
    if (!known.has(en.potId)) continue;
    out.push({ potId: en.potId, date: en.date, amount: en.amountCents, source: 'entry', label: en.note ?? (en.amountCents > 0 ? 'Aportación' : 'Retirada'), refId: en.id });
  }
  for (const e of savings) {
    if (e.type !== 'saving') continue;
    const potId = potForSaving(e, pots, fallbackId);
    if (!potId) continue;
    out.push({ potId, date: e.date, amount: e.amountCents, source: 'event', label: e.concept, refId: e.id });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function balancesByPot(flows: readonly PotFlow[]): ReadonlyMap<string, Money> {
  const acc = new Map<string, number>();
  for (const f of flows) acc.set(f.potId, (acc.get(f.potId) ?? 0) + f.amount);
  return new Map([...acc.entries()].map(([k, v]) => [k, money(v)]));
}

export function balanceOfPot(balances: ReadonlyMap<string, Money>, potId: string): Money {
  return balances.get(potId) ?? ZERO;
}
