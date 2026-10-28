import type { Migration } from '../migrator';

const ISO_DATE_GLOB = `'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;
const HEX_COLOR_GLOB = `'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/** Ids fijos de las dos huchas que crea esta migración. */
export const EMERGENCY_POT_ID = 'pot-emergency';
export const GENERAL_POT_ID = 'pot-general';

/**
 * Origen de los movimientos, objetivos, huchas de ahorro, inversiones y
 * registro de notificaciones enviadas.
 *
 * - `events.source` distingue lo apuntado a mano, lo importado de un
 *   extracto y lo generado por una regla recurrente. Los que ya existen se
 *   deducen: con regla → «recurrence»; con la nota «Importado de …» que pone
 *   el importador → «import»; el resto, «manual».
 * - `events.import_batch` agrupa las filas de una misma importación para
 *   poder deshacerla entera.
 * - El saldo de una hucha = sus apuntes (`pot_entries`, con signo) + los
 *   movimientos de tipo ahorro que la señalan en `meta.potId`. Los de ahorro
 *   sin hucha cuentan en «Ahorro general».
 * - Cada objetivo tiene su hucha (`savings_pots.goal_id`, única); borrar el
 *   objetivo borra la hucha y sus apuntes.
 * - Una inversión guarda su historia de valoraciones (una por día): el valor
 *   de mercado y lo aportado en esa fecha. El gráfico arrastra la última.
 */
export const MIGRATION_0007_GOALS_SAVINGS_INVESTMENTS: Migration = {
  version: 7,
  name: 'goals-savings-investments',
  statements: [
    `ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','recurrence'))`,
    `ALTER TABLE events ADD COLUMN import_batch TEXT NULL`,
    `UPDATE events SET source = 'recurrence' WHERE recurrence_id IS NOT NULL`,
    `UPDATE events SET source = 'import' WHERE recurrence_id IS NULL AND notes LIKE 'Importado de %'`,
    `CREATE INDEX ix_events_import_batch ON events(import_batch) WHERE import_batch IS NOT NULL`,

    `CREATE TABLE goals (
      id                 TEXT    PRIMARY KEY,
      name               TEXT    NOT NULL CHECK (length(trim(name)) > 0),
      kind               TEXT    NOT NULL CHECK (kind IN ('saving','purchase','investment','travel','debt','other')),
      target_cents       INTEGER NOT NULL CHECK (target_cents > 0),
      start_date         TEXT    NOT NULL CHECK (start_date GLOB ${ISO_DATE_GLOB}),
      target_date        TEXT    NOT NULL CHECK (target_date GLOB ${ISO_DATE_GLOB}),
      frequency          TEXT    NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily','weekly','monthly','yearly')),
      status             TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','archived')),
      color              TEXT    NOT NULL CHECK (color GLOB ${HEX_COLOR_GLOB}),
      notes              TEXT    NULL,
      created_at         TEXT    NOT NULL,
      updated_at         TEXT    NOT NULL,
      CHECK (target_date >= start_date)
    )`,

    `CREATE TABLE savings_pots (
      id            TEXT    PRIMARY KEY,
      name          TEXT    NOT NULL CHECK (length(trim(name)) > 0),
      kind          TEXT    NOT NULL CHECK (kind IN ('emergency','general','goal')),
      color         TEXT    NOT NULL CHECK (color GLOB ${HEX_COLOR_GLOB}),
      target_cents  INTEGER NULL CHECK (target_cents IS NULL OR target_cents > 0),
      goal_id       TEXT    NULL UNIQUE REFERENCES goals(id) ON DELETE CASCADE,
      archived      INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    )`,
    `CREATE TABLE pot_entries (
      id            TEXT    PRIMARY KEY,
      pot_id        TEXT    NOT NULL REFERENCES savings_pots(id) ON DELETE CASCADE,
      date          TEXT    NOT NULL CHECK (date GLOB ${ISO_DATE_GLOB}),
      amount_cents  INTEGER NOT NULL CHECK (amount_cents <> 0),
      note          TEXT    NULL,
      created_at    TEXT    NOT NULL
    )`,
    `CREATE INDEX ix_pot_entries_pot_date ON pot_entries(pot_id, date)`,
    `INSERT INTO savings_pots (id, name, kind, color, target_cents, goal_id, archived, sort_order, created_at, updated_at)
     VALUES ('${EMERGENCY_POT_ID}', 'Fondo de emergencia', 'emergency', '#F45B5B', NULL, NULL, 0, 0, ${NOW}, ${NOW}),
            ('${GENERAL_POT_ID}', 'Ahorro general', 'general', '#FBBF24', NULL, NULL, 0, 1, ${NOW}, ${NOW})`,

    `CREATE TABLE investments (
      id            TEXT    PRIMARY KEY,
      name          TEXT    NOT NULL CHECK (length(trim(name)) > 0),
      issuer        TEXT    NULL,
      asset_class   TEXT    NOT NULL CHECK (asset_class IN ('index_fund','etf','stock','crypto','pension','deposit','other')),
      ticker        TEXT    NULL,
      units         REAL    NULL CHECK (units IS NULL OR units >= 0),
      color         TEXT    NOT NULL CHECK (color GLOB ${HEX_COLOR_GLOB}),
      archived      INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    )`,
    `CREATE TABLE investment_valuations (
      id                  TEXT    PRIMARY KEY,
      investment_id       TEXT    NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
      date                TEXT    NOT NULL CHECK (date GLOB ${ISO_DATE_GLOB}),
      market_value_cents  INTEGER NOT NULL CHECK (market_value_cents >= 0),
      invested_cents      INTEGER NOT NULL CHECK (invested_cents >= 0),
      created_at          TEXT    NOT NULL
    )`,
    `CREATE UNIQUE INDEX ux_investment_valuations_day ON investment_valuations(investment_id, date)`,

    `CREATE TABLE notification_log (
      key      TEXT PRIMARY KEY,
      sent_at  TEXT NOT NULL
    )`,
  ],
};
