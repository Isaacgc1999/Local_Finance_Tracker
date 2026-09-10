import { type Result, ok } from '../../core/types/result';
import { DEFAULT_SETTINGS, SETTINGS_KEYS, type Settings } from '../../core/types/settings';
import { type DatabaseHandle, stmt } from '../db/database';

interface SettingRow {
  readonly key: string;
  readonly value: string;
}

/** Codificación texto ↔ valor tipado por clave. Lo que no parsea vuelve al valor por defecto. */
const CODECS: { readonly [K in keyof Settings]: { decode(raw: string): Settings[K] | undefined; encode(v: Settings[K]): string } } = {
  currency: { decode: (raw) => (raw === 'EUR' || raw === 'USD' ? raw : undefined), encode: (v) => v },
  dateFormat: {
    decode: (raw) => (raw === 'DD/MM/YYYY' || raw === 'YYYY-MM-DD' ? raw : undefined),
    encode: (v) => v,
  },
  ollamaEndpoint: { decode: (raw) => (raw.trim() ? raw.trim() : undefined), encode: (v) => v },
  ollamaModel: { decode: (raw) => (raw.trim() ? raw.trim() : undefined), encode: (v) => v },
  lastBackupAt: { decode: (raw) => (raw === '' ? null : raw), encode: (v) => v ?? '' },
  weekStartsOn: { decode: (raw) => (raw === '1' ? 1 : undefined), encode: (v) => String(v) },
};

export class SettingsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  async getAll(): Promise<Result<Settings>> {
    const rows = await this.db.select<SettingRow>('SELECT key, value FROM settings');
    if (!rows.ok) return rows;
    const byKey = new Map(rows.value.map((r) => [r.key, r.value]));
    const settings: Settings = { ...DEFAULT_SETTINGS };
    const out = settings as { -readonly [K in keyof Settings]: Settings[K] };
    for (const field of Object.keys(CODECS) as (keyof Settings)[]) {
      const raw = byKey.get(SETTINGS_KEYS[field]);
      if (raw === undefined) continue;
      const decoded = CODECS[field].decode(raw) as Settings[typeof field] | undefined;
      if (decoded !== undefined) (out as Record<string, unknown>)[field] = decoded;
    }
    return ok(out);
  }

  async set<K extends keyof Settings>(field: K, value: Settings[K]): Promise<Result<void>> {
    const encoded = CODECS[field].encode(value);
    const result = await this.db.transaction([
      stmt(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        SETTINGS_KEYS[field],
        encoded,
      ),
    ]);
    return result.ok ? ok(undefined) : result;
  }
}
