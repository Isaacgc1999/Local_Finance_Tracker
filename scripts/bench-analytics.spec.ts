/**
 * Benchmark de la analítica con 10.000 movimientos (regla: recalcular por
 * debajo de 16 ms). Ejecutar con `npm run bench`.
 *
 * Siembra una BD SQLite en memoria, carga los movimientos por el repositorio
 * real y mide `computeSnapshot()` en las cuatro granularidades.
 */
import { performance } from 'node:perf_hooks';

import { isoDate } from '../src/app/core/types/iso-date';
import { money } from '../src/app/core/types/money';
import { MIGRATIONS } from '../src/app/data/db/migrations';
import { applyPendingMigrations } from '../src/app/data/db/migrator';
import { createRepositories } from '../src/app/data/repositories';
import { computeSnapshot } from '../src/app/domain/analytics/analytics.service';
import type { Granularity } from '../src/app/domain/analytics/periods';
import { NodeSqliteDatabase } from '../tools/node-sqlite-database';
import { generateRandomEvents, seedEvents } from '../tools/seed-random';

const N = 10_000;
const RUNS = 30;
const BUDGET_MS = 16;

function stats(samples: number[]): { median: number; p95: number; max: number } {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { median: at(0.5), p95: at(0.95), max: s[s.length - 1] ?? 0 };
}

describe(`AnalyticsService con ${N} movimientos`, () => {
  it(`calcula el snapshot por debajo de ${BUDGET_MS} ms (mediana)`, async () => {
    const db = NodeSqliteDatabase.open();
    const migrated = await applyPendingMigrations(db, MIGRATIONS);
    expect(migrated.ok).toBe(true);
    const repos = createRepositories(db);
    const categories = await repos.categories.findAll();
    if (!categories.ok) throw new Error('categorías');

    const t0 = performance.now();
    const generated = generateRandomEvents(N, 42);
    const inserted = await seedEvents(db, generated);
    const tSeed = performance.now() - t0;
    expect(inserted).toBe(N);

    const t1 = performance.now();
    const loaded = await repos.events.findInRange({ from: isoDate(2024, 1, 1), to: isoDate(2026, 12, 31) });
    const tLoad = performance.now() - t1;
    if (!loaded.ok) throw new Error('carga');
    expect(loaded.value.length).toBe(N);

    const catMap = new Map(categories.value.map((c) => [c.id, c]));
    const lines: string[] = [`siembra ${N}: ${tSeed.toFixed(0)} ms · carga por repositorio: ${tLoad.toFixed(1)} ms`];
    const results: Record<Granularity, ReturnType<typeof stats>> = { day: stats([0]), week: stats([0]), month: stats([0]), year: stats([0]) };

    for (const granularity of ['day', 'week', 'month', 'year'] as const) {
      const samples: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const t = performance.now();
        computeSnapshot({
          events: loaded.value,
          range: { from: isoDate(2025, 10, 1), to: isoDate(2026, 9, 30) },
          granularity,
          categories: catMap,
          budgetTargetCents: money(175_000),
          today: isoDate(2026, 9, 9),
          openingBalanceCents: money(0),
          savingsTargetBp: 3000,
        });
        samples.push(performance.now() - t);
      }
      results[granularity] = stats(samples);
      const r = results[granularity];
      lines.push(`${granularity.padEnd(5)} mediana ${r.median.toFixed(2)} ms · p95 ${r.p95.toFixed(2)} ms · máx ${r.max.toFixed(2)} ms`);
    }
    console.info(`\n[bench analítica]\n${lines.join('\n')}\n`);

    for (const g of ['day', 'week', 'month', 'year'] as const) {
      expect(results[g].median).toBeLessThan(BUDGET_MS);
    }
  });
});
