import type { Migration } from '../migrator';

/**
 * Presupuestos por ámbito (gasto total, fijos, ocio, ahorro, inversión o una
 * categoría), que sustituyen al «presupuesto mensual objetivo» único.
 *
 * El presupuesto antiguo pasa a ser «Gasto total» solo si el usuario lo había
 * cambiado: 1.750 € era el valor de ejemplo del handoff que la 0002 sembraba
 * a todo el mundo, y convertirlo en un presupuesto real sería inventarse un
 * dato que nadie ha introducido.
 */
export const MIGRATION_0003_BUDGETS: Migration = {
  version: 3,
  name: 'budgets',
  statements: [
    `CREATE TABLE budgets (
      id            TEXT    PRIMARY KEY,
      scope         TEXT    NOT NULL UNIQUE,
      amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    )`,
    `INSERT INTO budgets (id, scope, amount_cents, created_at, updated_at)
     SELECT 'budget-total', 'total', CAST(value AS INTEGER), '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
     FROM settings
     WHERE key = 'budget_target_cents' AND value <> '175000' AND CAST(value AS INTEGER) > 0`,
    `DELETE FROM settings WHERE key = 'budget_target_cents'`,
  ],
};
