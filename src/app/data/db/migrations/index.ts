import type { Migration } from '../migrator';
import { MIGRATION_0001_INITIAL } from './0001-initial';
import { MIGRATION_0002_SEED } from './0002-seed-categories';
import { MIGRATION_0003_BUDGETS } from './0003-budgets';

/** Registro ordenado. Añadir siempre al final con la siguiente versión; nunca editar una aplicada. */
export const MIGRATIONS: readonly Migration[] = [MIGRATION_0001_INITIAL, MIGRATION_0002_SEED, MIGRATION_0003_BUDGETS];

/** Versión de esquema que espera esta compilación; la usa la validación de copias. */
export const LATEST_SCHEMA_VERSION: number = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
