import { appDataDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { fsError, messageOf } from '../../core/errors/app-error';
import { type Result, ok, tryCatch } from '../../core/types/result';

export const DB_FILE_NAME = 'fintrack.db';
/** Fichero puntero en appData con la ruta elegida en Ajustes → «Cambiar». */
const LOCATION_POINTER = 'fintrack.location';

const toFs = (cause: unknown) => fsError(messageOf(cause), cause);

/** `true` dentro de la ventana de Tauri; `false` en `ng serve` en un navegador. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Crea appData si no existe y devuelve su ruta absoluta. */
export async function ensureAppDataDir(): Promise<Result<string>> {
  return tryCatch(async () => {
    const dir = await appDataDir();
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    return dir;
  }, toFs);
}

/**
 * Ruta absoluta del `.db`: la del puntero si el usuario la cambió, y si no
 * `appData/fintrack.db`.
 */
export async function resolveDbPath(): Promise<Result<string>> {
  const dir = await ensureAppDataDir();
  if (!dir.ok) return dir;
  return tryCatch(async () => {
    if (await exists(LOCATION_POINTER, { baseDir: BaseDirectory.AppData })) {
      const custom = (await readTextFile(LOCATION_POINTER, { baseDir: BaseDirectory.AppData })).trim();
      if (custom) return custom;
    }
    return join(dir.value, DB_FILE_NAME);
  }, toFs);
}

export async function setDbLocation(absolutePath: string): Promise<Result<void>> {
  const dir = await ensureAppDataDir();
  if (!dir.ok) return dir;
  const written = await tryCatch(
    () => writeTextFile(LOCATION_POINTER, absolutePath, { baseDir: BaseDirectory.AppData }),
    toFs,
  );
  return written.ok ? ok(undefined) : written;
}
