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
  /** Mes natural o «mes de nómina» (ver `domain/period/financial-month.ts`). */
  readonly monthMode: 'calendar' | 'payday';
  /** Día de referencia del mes de nómina, de 1 a 28. */
  readonly monthStartDay: number;
  /** Avisos del sistema operativo (cargos de mañana, presupuesto, objetivos…). */
  readonly notificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  dateFormat: 'DD/MM/YYYY',
  ollamaEndpoint: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.1:8b',
  lastBackupAt: null,
  weekStartsOn: 1,
  monthMode: 'calendar',
  monthStartDay: 28,
  notificationsEnabled: true,
};

/** Clave de la tabla `settings` por cada campo tipado. */
export const SETTINGS_KEYS: Readonly<Record<keyof Settings, string>> = {
  currency: 'currency',
  dateFormat: 'date_format',
  ollamaEndpoint: 'ollama_endpoint',
  ollamaModel: 'ollama_model',
  lastBackupAt: 'last_backup_at',
  weekStartsOn: 'week_starts_on',
  monthMode: 'month_mode',
  monthStartDay: 'month_start_day',
  notificationsEnabled: 'notifications_enabled',
};
