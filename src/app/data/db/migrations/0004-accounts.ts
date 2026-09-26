import type { Migration } from '../migrator';

const ISO_DATE_GLOB = `'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;
const HEX_COLOR_GLOB = `'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`;

/**
 * Cuentas (banco, efectivo, tarjeta, ahorro), traspasos entre ellas y
 * conciliaciones con el saldo del banco.
 *
 * - `events.account_id` y `recurrences.account_id` son opcionales: los
 *   movimientos que ya existen se quedan sin cuenta. Asignarlos a una cuenta
 *   inventada falsearía su saldo.
 * - Los traspasos viven en su propia tabla y no en `events`: mover dinero
 *   entre cuentas propias no es ni ingreso ni gasto, y así la analítica y los
 *   presupuestos no cambian.
 * - Un traspaso impide borrar sus cuentas (RESTRICT); la app ofrece archivar.
 * - `adjustment_cents` de una conciliación es la diferencia que el usuario
 *   decidió asumir para cuadrar con el banco; suma al saldo de la cuenta.
 */
export const MIGRATION_0004_ACCOUNTS: Migration = {
  version: 4,
  name: 'accounts',
  statements: [
    `CREATE TABLE accounts (
      id                     TEXT    PRIMARY KEY,
      name                   TEXT    NOT NULL,
      kind                   TEXT    NOT NULL CHECK (kind IN ('bank','cash','card','savings')),
      color                  TEXT    NOT NULL CHECK (color GLOB ${HEX_COLOR_GLOB}),
      opening_balance_cents  INTEGER NOT NULL DEFAULT 0,
      opening_date           TEXT    NOT NULL CHECK (opening_date GLOB ${ISO_DATE_GLOB}),
      archived               INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
      sort_order             INTEGER NOT NULL DEFAULT 0,
      created_at             TEXT    NOT NULL,
      updated_at             TEXT    NOT NULL
    )`,
    `CREATE UNIQUE INDEX ux_accounts_name ON accounts(name COLLATE NOCASE)`,

    `ALTER TABLE events ADD COLUMN account_id TEXT NULL REFERENCES accounts(id) ON DELETE SET NULL`,
    `CREATE INDEX ix_events_account_date ON events(account_id, date)`,
    `ALTER TABLE recurrences ADD COLUMN account_id TEXT NULL REFERENCES accounts(id) ON DELETE SET NULL`,

    `CREATE TABLE transfers (
      id               TEXT    PRIMARY KEY,
      from_account_id  TEXT    NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      to_account_id    TEXT    NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
      date             TEXT    NOT NULL CHECK (date GLOB ${ISO_DATE_GLOB}),
      concept          TEXT    NULL,
      created_at       TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL,
      CHECK (from_account_id <> to_account_id)
    )`,
    `CREATE INDEX ix_transfers_date ON transfers(date)`,
    `CREATE INDEX ix_transfers_from_date ON transfers(from_account_id, date)`,
    `CREATE INDEX ix_transfers_to_date ON transfers(to_account_id, date)`,

    `CREATE TABLE reconciliations (
      id                       TEXT    PRIMARY KEY,
      account_id               TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date                     TEXT    NOT NULL CHECK (date GLOB ${ISO_DATE_GLOB}),
      statement_balance_cents  INTEGER NOT NULL,
      adjustment_cents         INTEGER NOT NULL DEFAULT 0,
      created_at               TEXT    NOT NULL
    )`,
    `CREATE INDEX ix_reconciliations_account_date ON reconciliations(account_id, date)`,
  ],
};
