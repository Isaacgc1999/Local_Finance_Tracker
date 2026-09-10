import type { DateFormat } from '../format/date-format';
import type { Currency } from '../format/money-format';

/**
 * Ajustes simples del usuario (tabla clave-valor `settings`). Los
 * presupuestos, que antes eran un único «presupuesto mensual objetivo»,
 * viven en su propia tabla desde la migración 0003.
 */
export interface Settings {
  /** Moneda de visualización. Los importes se guardan igual (céntimos); no hay conversión. */
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly ollamaEndpoint: string;
  readonly ollamaModel: string;
  /** Marca temporal ISO de la última copia de seguridad, o null. */
  readonly lastBackupAt: string | null;
  /** Siempre lunes (ISO 8601). */
  readonly weekStartsOn: 1;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  dateFormat: 'DD/MM/YYYY',
  ollamaEndpoint: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.1:8b',
  lastBackupAt: null,
  weekStartsOn: 1,
};

/** Clave de la tabla `settings` por cada campo tipado. */
export const SETTINGS_KEYS: Readonly<Record<keyof Settings, string>> = {
  currency: 'currency',
  dateFormat: 'date_format',
  ollamaEndpoint: 'ollama_endpoint',
  ollamaModel: 'ollama_model',
  lastBackupAt: 'last_backup_at',
  weekStartsOn: 'week_starts_on',
};
