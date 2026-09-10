import type { Migration } from '../migrator';

const ISO_DATE_GLOB = `'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;
const HEX_COLOR_GLOB = `'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`;
const EVENT_TYPES = `('expense','income','subscription','direct_debit','saving','investment')`;

/** Esquema inicial (docs/FASE-0.md §e). Solo CREATE IF NOT EXISTS: idempotente y sin DROP. */
export const MIGRATION_0001_INITIAL: Migration = {
  version: 1,
  name: 'initial',
  statements: [
    `CREATE TABLE IF NOT EXISTS categories (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      icon        TEXT    NULL,
      color       TEXT    NOT NULL CHECK (color GLOB ${HEX_COLOR_GLOB}),
      kind        TEXT    NOT NULL CHECK (kind IN ('expense','income','both')),
      is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_name ON categories(name COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS ix_categories_kind_sort ON categories(kind, sort_order)`,

    `CREATE TABLE IF NOT EXISTS recurrences (
      id              TEXT    PRIMARY KEY,
      type            TEXT    NOT NULL CHECK (type IN ${EVENT_TYPES}),
      amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
      category_id     TEXT    NULL REFERENCES categories(id) ON DELETE SET NULL,
      concept         TEXT    NOT NULL,
      frequency       TEXT    NOT NULL CHECK (frequency IN ('weekly','monthly','yearly')),
      interval        INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
      day_of_month    INTEGER NULL CHECK (day_of_month BETWEEN 1 AND 31),
      weekday         INTEGER NULL CHECK (weekday BETWEEN 1 AND 7),
      start_date      TEXT    NOT NULL CHECK (start_date GLOB ${ISO_DATE_GLOB}),
      end_date        TEXT    NULL CHECK (end_date IS NULL OR end_date GLOB ${ISO_DATE_GLOB}),
      active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      payment_method  TEXT    NULL,
      meta            TEXT    NULL CHECK (meta IS NULL OR json_valid(meta)),
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS ix_recurrences_active_start ON recurrences(active, start_date)`,

    `CREATE TABLE IF NOT EXISTS events (
      id              TEXT    PRIMARY KEY,
      type            TEXT    NOT NULL CHECK (type IN ${EVENT_TYPES}),
      amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
      date            TEXT    NOT NULL CHECK (date GLOB ${ISO_DATE_GLOB}),
      concept         TEXT    NOT NULL,
      category_id     TEXT    NULL REFERENCES categories(id) ON DELETE SET NULL,
      nature          TEXT    NULL CHECK (nature IS NULL OR nature IN ('fixed','variable')),
      payment_method  TEXT    NULL,
      notes           TEXT    NULL,
      attachment_path TEXT    NULL,
      recurrence_id   TEXT    NULL REFERENCES recurrences(id) ON DELETE SET NULL,
      meta            TEXT    NULL CHECK (meta IS NULL OR json_valid(meta)),
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS ix_events_date ON events(date)`,
    `CREATE INDEX IF NOT EXISTS ix_events_type_date ON events(type, date)`,
    `CREATE INDEX IF NOT EXISTS ix_events_category_date ON events(category_id, date)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_events_recurrence_date
       ON events(recurrence_id, date) WHERE recurrence_id IS NOT NULL`,

    `CREATE TABLE IF NOT EXISTS ai_reports (
      id                      TEXT    PRIMARY KEY,
      week_start              TEXT    NOT NULL CHECK (week_start GLOB ${ISO_DATE_GLOB}),
      week_end                TEXT    NOT NULL CHECK (week_end GLOB ${ISO_DATE_GLOB}),
      model                   TEXT    NOT NULL,
      generated_at            TEXT    NOT NULL,
      status                  TEXT    NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
      verdict                 TEXT    NULL,
      findings                TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(findings)),
      recommendations         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(recommendations)),
      savings_potential_cents INTEGER NOT NULL DEFAULT 0,
      summary_input           TEXT    NULL CHECK (summary_input IS NULL OR json_valid(summary_input)),
      duration_ms             INTEGER NULL,
      error                   TEXT    NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_reports_week ON ai_reports(week_start)`,

    `CREATE TABLE IF NOT EXISTS settings (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL
    )`,
  ],
};
