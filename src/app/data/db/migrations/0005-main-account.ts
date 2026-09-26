import type { Migration } from '../migrator';

/** Id fijo de la cuenta que crea esta migración; la app no le da ningún trato especial. */
export const MAIN_ACCOUNT_ID = 'account-main';
export const MAIN_ACCOUNT_NAME = 'Cuenta principal';

const NAME = `'${MAIN_ACCOUNT_NAME}'`;
const OPENING_DATE = '2000-01-01';
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/**
 * «Cuenta principal»: todos los movimientos y reglas sin cuenta pasan a ella
 * (decisión del usuario, ADR-084). Se crea también en instalaciones nuevas,
 * vacía, para que el formulario y el importador tengan siempre una cuenta
 * de destino.
 *
 * - Saldo inicial 0 y apertura el 1 de enero de 2000 (o antes, si hay
 *   movimientos más antiguos): así cuenta todo lo que ya existía y también
 *   los extractos antiguos que se importen después. Con la apertura en hoy,
 *   un extracto de meses pasados quedaría fuera del saldo.
 * - `sort_order` −1: va la primera y es la que proponen formulario e importador.
 * - Si el usuario ya tenía una cuenta con ese nombre, se reutiliza en vez de
 *   chocar con el índice único.
 */
export const MIGRATION_0005_MAIN_ACCOUNT: Migration = {
  version: 5,
  name: 'main-account',
  statements: [
    `INSERT INTO accounts (id, name, kind, color, opening_balance_cents, opening_date, archived, sort_order, created_at, updated_at)
     SELECT '${MAIN_ACCOUNT_ID}', ${NAME}, 'bank', '#6E56F8', 0,
            MIN(COALESCE((SELECT MIN(date) FROM events), '${OPENING_DATE}'), '${OPENING_DATE}'),
            0, -1, ${NOW}, ${NOW}
     WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = ${NAME} COLLATE NOCASE)`,
    `UPDATE events
     SET account_id = (SELECT id FROM accounts WHERE name = ${NAME} COLLATE NOCASE)
     WHERE account_id IS NULL`,
    `UPDATE recurrences
     SET account_id = (SELECT id FROM accounts WHERE name = ${NAME} COLLATE NOCASE)
     WHERE account_id IS NULL`,
  ],
};
