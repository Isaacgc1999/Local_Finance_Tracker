import { SYSTEM_CATEGORY } from '../src/app/core/types/category';
import type { Event, EventDraft, EventType, Nature } from '../src/app/core/types/event';
import { type IsoDate, addDays, daysBetween, isoDate } from '../src/app/core/types/iso-date';
import { money } from '../src/app/core/types/money';
import { placeholders, stmt, type DatabaseHandle } from '../src/app/data/db/database';
import { EVENT_COLUMNS, eventInsertParams } from '../src/app/data/mappers/event.mapper';

/** Generador pseudoaleatorio determinista (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = [
  SYSTEM_CATEGORY.alimentacion,
  SYSTEM_CATEGORY.hogar,
  SYSTEM_CATEGORY.transporte,
  SYSTEM_CATEGORY.ocio,
  SYSTEM_CATEGORY.salud,
  SYSTEM_CATEGORY.formacion,
  SYSTEM_CATEGORY.viajes,
  SYSTEM_CATEGORY.otros,
];

const TYPE_WEIGHTS: readonly [EventType, number][] = [
  ['expense', 70],
  ['income', 6],
  ['subscription', 8],
  ['direct_debit', 8],
  ['saving', 4],
  ['investment', 4],
];

function pickType(r: number): EventType {
  let acc = 0;
  for (const [type, w] of TYPE_WEIGHTS) {
    acc += w;
    if (r * 100 < acc) return type;
  }
  return 'expense';
}

/** `n` movimientos aleatorios pero reproducibles repartidos en el rango. */
export function generateRandomEvents(n: number, seed = 1, from: IsoDate = isoDate(2024, 1, 1), to: IsoDate = isoDate(2026, 9, 30)): Event[] {
  const random = rng(seed);
  const span = daysBetween(from, to);
  const out: Event[] = [];
  for (let i = 0; i < n; i++) {
    const type = pickType(random());
    const date = addDays(from, Math.floor(random() * (span + 1)));
    const cents =
      type === 'income'
        ? 150_000 + Math.floor(random() * 150_000)
        : type === 'direct_debit'
          ? 2_000 + Math.floor(random() * 80_000)
          : type === 'subscription'
            ? 500 + Math.floor(random() * 4_000)
            : 200 + Math.floor(random() * 25_000);
    const nature: Nature | null = type === 'expense' ? (random() < 0.3 ? 'fixed' : 'variable') : null;
    const categoryId = type === 'expense' || type === 'subscription' || type === 'direct_debit' ? (CATEGORIES[Math.floor(random() * CATEGORIES.length)] ?? null) : null;
    out.push({
      id: `bench-${i.toString().padStart(6, '0')}`,
      type,
      amountCents: money(cents),
      date,
      concept: `Movimiento ${i}`,
      categoryId,
      nature,
      paymentMethod: null,
      notes: null,
      attachmentPath: null,
      recurrenceId: null,
      meta: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Inserta los movimientos en lotes de 500 por transacción. */
export async function seedEvents(db: DatabaseHandle, events: readonly Event[]): Promise<number> {
  const sql = `INSERT INTO events (${EVENT_COLUMNS}) VALUES (${placeholders(14)})`;
  let inserted = 0;
  for (let i = 0; i < events.length; i += 500) {
    const batch = events.slice(i, i + 500);
    const result = await db.transaction(
      batch.map((e) => {
        const draft: EventDraft = e;
        return stmt(sql, ...eventInsertParams(e.id, draft, e.createdAt));
      }),
    );
    if (!result.ok) throw new Error(`siembra: ${JSON.stringify(result.error)}`);
    inserted += result.value.rowsAffected;
  }
  return inserted;
}
