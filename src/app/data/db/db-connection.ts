import { Injectable, computed, signal } from '@angular/core';

import { notReady } from '../../core/errors/app-error';
import { type Result, err, ok } from '../../core/types/result';
import { type Repositories, createRepositories } from '../repositories';
import type { DatabaseHandle } from './database';

/**
 * Único punto donde la app sostiene la base de datos abierta. Las facades
 * piden los repositorios aquí y reciben `Result` mientras no esté lista.
 */
@Injectable({ providedIn: 'root' })
export class DbConnection {
  private readonly handleSig = signal<DatabaseHandle | null>(null);

  readonly handle = this.handleSig.asReadonly();
  readonly ready = computed(() => this.handleSig() !== null);
  readonly repos = computed<Repositories | null>(() => {
    const h = this.handleSig();
    return h ? createRepositories(h) : null;
  });

  attach(handle: DatabaseHandle): void {
    this.handleSig.set(handle);
  }

  async detach(): Promise<void> {
    const current = this.handleSig();
    this.handleSig.set(null);
    if (current) await current.close();
  }

  require(): Result<Repositories> {
    const repos = this.repos();
    return repos ? ok(repos) : err(notReady());
  }

  /** Tamaño del fichero según SQLite (no necesita permisos de fs). */
  async fileSizeBytes(): Promise<Result<number>> {
    const h = this.handleSig();
    if (!h) return err(notReady());
    const rows = await h.select<{ bytes: number }>(
      'SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()',
    );
    if (!rows.ok) return rows;
    return ok(rows.value[0]?.bytes ?? 0);
  }
}
