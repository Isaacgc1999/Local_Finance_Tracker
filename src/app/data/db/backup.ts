import { validationError } from '../../core/errors/app-error';
import { type Result, err, ok } from '../../core/types/result';
import type { DatabaseHandle } from './database';

/**
 * Copia de seguridad a nivel de SQLite. No toca el sistema de ficheros por su
 * cuenta ni depende de Tauri, así que se puede probar contra `node:sqlite`;
 * los diálogos nativos y el copiado viven en `infra/fs/backup.ts`.
 */

/** «fintrack-backup-2026-09-10.db» */
export function backupFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `fintrack-backup-${y}-${m}-${d}.db`;
}

/**
 * Copia consistente de una base de datos **abierta**: `VACUUM INTO` escribe
 * un fichero nuevo ya compactado y con el WAL integrado, así que no hay que
 * cerrar la conexión ni copiar los ficheros auxiliares. Es la forma que
 * recomienda SQLite para copiar en caliente.
 *
 * Falla si el destino ya existe, de modo que el borrado previo es explícito.
 * La ruta va incrustada en el SQL (SQLite no admite parámetro aquí), con las
 * comillas simples escapadas.
 */
export async function vacuumInto(handle: DatabaseHandle, target: string): Promise<Result<void>> {
  const escaped = target.replace(/'/g, "''");
  const done = await handle.executeRaw(`VACUUM INTO '${escaped}'`);
  return done.ok ? ok(undefined) : done;
}

export interface BackupSummary {
  readonly events: number;
  readonly schemaVersion: number;
}

/** Tablas sin las cuales el fichero no es una base de datos de Fintrack. */
const REQUIRED_TABLES = ['events', 'categories', 'settings', 'schema_migrations'] as const;

/**
 * Comprueba que un fichero elegido por el usuario es de verdad una base de
 * datos de Fintrack antes de dejar que sustituya a la suya: integridad,
 * tablas obligatorias y versión de esquema no futura.
 */
export async function inspectBackup(
  candidate: DatabaseHandle,
  currentSchemaVersion: number,
): Promise<Result<BackupSummary>> {
  const integrity = await candidate.select<{ integrity_check: string }>('PRAGMA integrity_check');
  if (!integrity.ok) return integrity;
  const veredicto = integrity.value[0]?.integrity_check ?? 'desconocido';
  if (veredicto !== 'ok') {
    return err(validationError('restore', `El fichero está dañado (integrity_check: ${veredicto}).`));
  }

  const placeholders = REQUIRED_TABLES.map(() => '?').join(', ');
  const tables = await candidate.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
    [...REQUIRED_TABLES],
  );
  if (!tables.ok) return tables;
  if (tables.value.length < REQUIRED_TABLES.length) {
    return err(validationError('restore', 'El fichero no es una base de datos de Fintrack.'));
  }

  const version = await candidate.select<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );
  if (!version.ok) return version;
  const schemaVersion = version.value[0]?.version ?? 0;
  if (schemaVersion > currentSchemaVersion) {
    return err(
      validationError(
        'restore',
        `La copia viene de una versión más nueva de Fintrack (esquema ${schemaVersion}). Actualiza la aplicación antes de restaurarla.`,
      ),
    );
  }

  const events = await candidate.select<{ n: number }>('SELECT COUNT(*) AS n FROM events');
  if (!events.ok) return events;
  return ok({ events: events.value[0]?.n ?? 0, schemaVersion });
}
