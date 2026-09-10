import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

import { fsError, messageOf } from '../../core/errors/app-error';
import { type Result, ok, tryCatch } from '../../core/types/result';
import { isTauri } from './db-location';

export interface SaveRequest {
  readonly defaultName: string;
  readonly extension: string;
  readonly filterName: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/**
 * Guarda con el diálogo nativo de Tauri. Fuera de Tauri (modo demo del
 * navegador) descarga el fichero con un enlace temporal, para poder probar
 * los exportadores sin la shell.
 * `null` cuando el usuario cancela.
 */
export async function saveBinaryFile(req: SaveRequest): Promise<Result<string | null>> {
  if (!isTauri()) return saveInBrowser(req);
  return tryCatch(
    async () => {
      const path = await save({
        defaultPath: req.defaultName,
        filters: [{ name: req.filterName, extensions: [req.extension] }],
      });
      if (!path) return null;
      await writeFile(path, req.bytes);
      return path;
    },
    (cause) => fsError(`No se pudo guardar el fichero: ${messageOf(cause)}`, cause),
  );
}

async function saveInBrowser(req: SaveRequest): Promise<Result<string | null>> {
  const result = await tryCatch(
    async () => {
      const blob = new Blob([req.bytes as unknown as BlobPart], { type: req.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = req.defaultName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return req.defaultName;
    },
    (cause) => fsError(messageOf(cause), cause),
  );
  return result.ok ? ok(result.value) : result;
}
