import { appDataDir, join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, copyFile, exists, mkdir, remove, stat } from '@tauri-apps/plugin-fs';

import { fsError, messageOf } from '../../core/errors/app-error';
import { uuidV7 } from '../../core/ids/uuid-v7';
import { type Result, err, ok, tryCatch } from '../../core/types/result';
import { isTauri } from './db-location';

export interface AttachmentInfo {
  readonly path: string;
  readonly name: string;
  readonly bytes: number;
}

const DIR = 'attachments';
const MAX_BYTES = 8 * 1024 * 1024; // «máx. 8 MB» (handoff)
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf'];

const toFs = (cause: unknown) => fsError(messageOf(cause), cause);

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Abre el diálogo nativo, valida tipo y tamaño y copia el fichero a
 * `appData/attachments/<uuid>.<ext>`. `null` si el usuario cancela.
 */
export async function pickAndStoreAttachment(): Promise<Result<AttachmentInfo | null>> {
  if (!isTauri()) return err(fsError('Los adjuntos solo están disponibles en la app de escritorio.'));
  return tryCatch(async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      title: 'Adjuntar recibo',
      filters: [{ name: 'Recibos (PNG, JPG, PDF)', extensions: EXTENSIONS }],
    });
    if (!picked) return null;
    const source = typeof picked === 'string' ? picked : String(picked);
    const info = await stat(source);
    if (info.size > MAX_BYTES) throw new Error('El fichero supera los 8 MB.');
    const ext = (source.split('.').pop() ?? 'bin').toLowerCase();
    if (!EXTENSIONS.includes(ext)) throw new Error('Formato no admitido. Usa PNG, JPG o PDF.');

    if (!(await exists(DIR, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const stored = `${uuidV7()}.${ext}`;
    await copyFile(source, `${DIR}/${stored}`, { toPathBaseDir: BaseDirectory.AppData });
    const absolute = await join(await appDataDir(), DIR, stored);
    return { path: absolute, name: fileName(source), bytes: info.size };
  }, toFs);
}

export async function attachmentInfo(path: string): Promise<Result<AttachmentInfo>> {
  if (!isTauri()) return ok({ path, name: fileName(path), bytes: 0 });
  return tryCatch(async () => {
    const info = await stat(path);
    return { path, name: fileName(path), bytes: info.size };
  }, toFs);
}

export async function removeStoredAttachment(path: string): Promise<Result<void>> {
  if (!isTauri()) return ok(undefined);
  const result = await tryCatch(async () => {
    if (await exists(path)) await remove(path);
  }, toFs);
  return result.ok ? ok(undefined) : result;
}
