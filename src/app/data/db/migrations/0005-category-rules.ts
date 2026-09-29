import type { Migration } from '../migrator';

/**
 * Reglas de categorización automática (ADR-084).
 *
 * - `pattern` es el texto que tiene que contener el concepto, guardado como
 *   lo escribió el usuario; la comparación normaliza mayúsculas y acentos en
 *   el dominio, no en SQL, para que la misma función sirva en el navegador.
 * - Borrar la categoría borra sus reglas (CASCADE): una regla que apunta a
 *   una categoría inexistente no clasificaría nada.
 * - El patrón es único sin distinguir mayúsculas: dos reglas con el mismo
 *   texto y distinta categoría serían una contradicción.
 */
export const MIGRATION_0005_CATEGORY_RULES: Migration = {
  version: 5,
  name: 'category-rules',
  statements: [
    `CREATE TABLE category_rules (
      id           TEXT    PRIMARY KEY,
      pattern      TEXT    NOT NULL CHECK (length(pattern) >= 2),
      category_id  TEXT    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      hits         INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL
    )`,
    `CREATE UNIQUE INDEX ux_category_rules_pattern ON category_rules(pattern COLLATE NOCASE)`,
    `CREATE INDEX ix_category_rules_category ON category_rules(category_id)`,
  ],
};
