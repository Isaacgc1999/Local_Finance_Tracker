import { nowIsoTimestamp } from '../../core/types/iso-date';
import { type Result, ok } from '../../core/types/result';
import { type DatabaseHandle, placeholders, stmt } from '../db/database';

/** Avisos del sistema ya enviados, por clave, para no repetir ninguno. */
export class NotificationLogRepository {
  constructor(private readonly db: DatabaseHandle) {}

  /** De las claves dadas, las que ya se enviaron. */
  async sent(keys: readonly string[]): Promise<Result<ReadonlySet<string>>> {
    if (keys.length === 0) return ok(new Set());
    const rows = await this.db.select<{ key: string }>(`SELECT key FROM notification_log WHERE key IN (${placeholders(keys.length)})`, keys);
    if (!rows.ok) return rows;
    return ok(new Set(rows.value.map((r) => r.key)));
  }

  async mark(keys: readonly string[]): Promise<Result<void>> {
    if (keys.length === 0) return ok(undefined);
    const now = nowIsoTimestamp();
    const result = await this.db.transaction(
      keys.map((key) => stmt('INSERT INTO notification_log (key, sent_at) VALUES (?, ?) ON CONFLICT(key) DO NOTHING', key, now)),
    );
    return result.ok ? ok(undefined) : result;
  }
}
