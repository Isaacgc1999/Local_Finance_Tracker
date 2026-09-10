import { open, save } from '@tauri-apps/plugin-dialog';
import { copyFile, exists, remove } from '@tauri-apps/plugin-fs';

import { fsError, messageOf, validationError } from '../../core/errors/app-error';
import { type Result, err, ok, tryCatch } from '../../core/types/result';
import { isTauri } from './db-location';

/**
 * Parte de la copia de seguridad que necesita la ventana de Tauri: diálogos
 * nativos y sistema de ficheros. La lógica SQL vive en `data/db/backup.ts`,
 * que sí se puede probar sin la shell.
 */

const toFs = (cause: unknown) => fsError(messageOf(cause), cause);

/** Ficheros que SQLite crea junto al `.db` en modo WAL. */
const WAL_SUFFIXES = ['-wal', '-shm'] as const;

/** Borra un fichero si existe (el diálogo nativo ya ha pedido confirmación). */
export async function removeIfExists(path: string): Promise<Result<void>> {
  return tryCatch(async () => {
    if (await exists(path)) await remove(path);
  }, toFs);
}

/**
 * Borra el `-wal` y el `-shm` que hayan quedado junto a un `.db`. Sin esto,
 * al restaurar una copia sobre la ruta activa SQLite reaplicaría el WAL
 * antiguo encima del fichero nuevo y lo dejaría inconsistente.
 */
export async function removeWalSiblings(dbPath: string): Promise<Result<void>> {
  for (const suffix of WAL_SUFFIXES) {
    const removed = await removeIfExists(dbPath + suffix);
    if (!removed.ok) return removed;
  }
  return ok(undefined);
}

/** Diálogo nativo «Guardar como» para la copia de seguridad. `null` si se cancela. */
export async function pickBackupTarget(defaultName: string): Promise<Result<string | null>> {
  if (!isTauri()) return err(validationError('backup', 'Las copias de seguridad necesitan la ventana de Fintrack.'));
  return tryCatch(
    () => save({ defaultPath: defaultName, filters: [{ name: 'Base de datos de Fintrack', extensions: ['db'] }] }),
    toFs,
  );
}

/** Diálogo nativo «Abrir» para elegir la copia a restaurar. `null` si se cancela. */
export async function pickDatabaseFile(title: string): Promise<Result<string | null>> {
  if (!isTauri()) return err(validationError('restore', 'Restaurar necesita la ventana de Fintrack.'));
  const picked = await tryCatch(
    () =>
      open({
        title,
        multiple: false,
        directory: false,
        filters: [{ name: 'Base de datos de Fintrack', extensions: ['db', 'sqlite', 'sqlite3'] }],
      }),
    toFs,
  );
  if (!picked.ok) return picked;
  return ok(typeof picked.value === 'string' ? picked.value : null);
}

/**
 * Sustituye el fichero activo por la copia. La conexión ya tiene que estar
 * cerrada: el orden es cerrar, limpiar el WAL viejo, copiar y reabrir.
 */
export async function replaceDatabaseFile(source: string, target: string): Promise<Result<void>> {
  const cleaned = await removeWalSiblings(target);
  if (!cleaned.ok) return cleaned;
  const copied = await tryCatch(() => copyFile(source, target), toFs);
  return copied.ok ? ok(undefined) : copied;
}
