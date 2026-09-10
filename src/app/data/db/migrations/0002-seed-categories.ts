import { SYSTEM_CATEGORY } from '../../../core/types/category';
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../../../core/types/settings';
import type { Migration } from '../migrator';

/**
 * Semilla: las categorías del handoff (chips del formulario + colores de la
 * lista de Ajustes) y los ajustes por defecto. `INSERT OR IGNORE` la hace
 * idempotente y respeta lo que el usuario haya editado después.
 */
interface SeedCategory {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly kind: 'expense' | 'income';
  /** `handoff` = nombre y color del diseño; `propuesta` = elección propia marcada en FASE-0. */
  readonly origin: 'handoff' | 'propuesta';
}

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  { id: SYSTEM_CATEGORY.alimentacion, name: 'Alimentación', color: '#F45B5B', kind: 'expense', origin: 'handoff' },
  { id: SYSTEM_CATEGORY.hogar, name: 'Hogar', color: '#FBBF24', kind: 'expense', origin: 'handoff' },
  { id: SYSTEM_CATEGORY.transporte, name: 'Transporte', color: '#38BDF8', kind: 'expense', origin: 'handoff' },
  { id: SYSTEM_CATEGORY.ocio, name: 'Ocio', color: '#6E56F8', kind: 'expense', origin: 'handoff' },
  { id: SYSTEM_CATEGORY.salud, name: 'Salud', color: '#22C55E', kind: 'expense', origin: 'handoff' },
  { id: SYSTEM_CATEGORY.formacion, name: 'Formación', color: '#9BA3AF', kind: 'expense', origin: 'handoff' },
  { id: SYSTEM_CATEGORY.viajes, name: 'Viajes', color: '#C24B4B', kind: 'expense', origin: 'propuesta' },
  { id: SYSTEM_CATEGORY.otros, name: 'Otros', color: '#6B7280', kind: 'expense', origin: 'propuesta' },
  { id: SYSTEM_CATEGORY.nomina, name: 'Nómina', color: '#22C55E', kind: 'income', origin: 'propuesta' },
  { id: SYSTEM_CATEGORY.otrosIngresos, name: 'Otros ingresos', color: '#9BA3AF', kind: 'income', origin: 'propuesta' },
];

const SEED_AT = '2026-01-01T00:00:00.000Z';

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const categoryInserts = SEED_CATEGORIES.map(
  (c, i) =>
    `INSERT OR IGNORE INTO categories (id, name, icon, color, kind, is_system, sort_order, created_at, updated_at)
     VALUES (${sqlText(c.id)}, ${sqlText(c.name)}, NULL, ${sqlText(c.color)}, ${sqlText(c.kind)}, 1, ${i}, ${sqlText(SEED_AT)}, ${sqlText(SEED_AT)})`,
);

const settingsInserts = (
  [
    // Clave retirada en la 0003 (presupuestos por ámbito). Se deja como literal
    // para que esta migración ya aplicada genere exactamente el mismo SQL.
    ['budget_target_cents', '175000'],
    [SETTINGS_KEYS.currency, DEFAULT_SETTINGS.currency],
    [SETTINGS_KEYS.dateFormat, DEFAULT_SETTINGS.dateFormat],
    [SETTINGS_KEYS.ollamaEndpoint, DEFAULT_SETTINGS.ollamaEndpoint],
    [SETTINGS_KEYS.ollamaModel, DEFAULT_SETTINGS.ollamaModel],
    [SETTINGS_KEYS.lastBackupAt, ''],
    [SETTINGS_KEYS.weekStartsOn, String(DEFAULT_SETTINGS.weekStartsOn)],
  ] as const
).map(([key, value]) => `INSERT OR IGNORE INTO settings (key, value) VALUES (${sqlText(key)}, ${sqlText(value)})`);

export const MIGRATION_0002_SEED: Migration = {
  version: 2,
  name: 'seed-categories-and-settings',
  statements: [...categoryInserts, ...settingsInserts],
};
