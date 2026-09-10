import { Injectable, inject, signal } from '@angular/core';

import { type AppError, notReady } from '../core/errors/app-error';
import { uuidV7 } from '../core/ids/uuid-v7';
import { todayIso } from '../core/types/iso-date';
import type { Result } from '../core/types/result';
import type { DatabaseHandle } from '../data/db/database';
import { DbConnection } from '../data/db/db-connection';
import { MIGRATIONS } from '../data/db/migrations';
import { applyPendingMigrations } from '../data/db/migrator';
import { TauriDatabase } from '../data/db/tauri-database';
import { EventService } from '../domain/events/event.service';
import { isTauri, resolveDbPath } from '../infra/fs/db-location';

export type BootState = 'idle' | 'opening' | 'migrating' | 'ready' | 'error';

export interface DbInfo {
  readonly path: string;
  readonly bytes: number;
  readonly events: number;
  readonly schemaVersion: number;
}

export interface Toast {
  readonly id: string;
  readonly text: string;
  readonly tone: 'income' | 'expense' | 'neutral';
}

const TOAST_MS = 4000;

/** Arranque (BD + migraciones + materialización), información del fichero y avisos. */
@Injectable({ providedIn: 'root' })
export class AppStatusFacade {
  private readonly db = inject(DbConnection);

  private readonly bootSig = signal<BootState>('idle');
  private readonly bootErrorSig = signal<AppError | null>(null);
  private readonly dbInfoSig = signal<DbInfo | null>(null);
  private readonly toastsSig = signal<readonly Toast[]>([]);
  private readonly demoSig = signal(false);
  /** Cambia cada vez que se materializan instancias o se escribe; las facades lo observan para recargar. */
  private readonly dataVersionSig = signal(0);

  readonly boot = this.bootSig.asReadonly();
  readonly bootError = this.bootErrorSig.asReadonly();
  readonly dbInfo = this.dbInfoSig.asReadonly();
  readonly toasts = this.toastsSig.asReadonly();
  /** `true` en el modo demo de navegador (solo desarrollo). */
  readonly demo = this.demoSig.asReadonly();
  readonly dataVersion = this.dataVersionSig.asReadonly();

  /** Idempotente: si ya está lista o arrancando no hace nada. */
  async start(): Promise<void> {
    const state = this.bootSig();
    if (state === 'ready' || state === 'opening' || state === 'migrating') return;
    this.bootErrorSig.set(null);
    this.bootSig.set('opening');

    const opened = await this.openDatabase();
    if (!opened.ok) return this.fail(opened.error);

    this.bootSig.set('migrating');
    const migrated = await applyPendingMigrations(opened.value, MIGRATIONS);
    if (!migrated.ok) {
      await opened.value.close();
      return this.fail(migrated.error);
    }

    this.db.attach(opened.value);
    const repos = this.db.repos();
    // No hay datos de ejemplo en ningún modo: la analítica solo es fiable si
    // todo lo que muestra lo ha registrado el usuario.
    if (repos) {
      const materialized = await new EventService(repos).materializeDue(todayIso());
      if (materialized.ok && materialized.value.inserted > 0) this.touch();
    }
    await this.refreshDbInfo(migrated.value.current);
    this.bootSig.set('ready');
    if (this.demoSig()) this.notify('Modo demo en navegador: los datos no se guardan.');
  }

  async retry(): Promise<void> {
    this.bootSig.set('idle');
    await this.start();
  }

  /** Señala a las facades que hay datos nuevos (tras guardar, borrar, materializar). */
  touch(): void {
    this.dataVersionSig.update((v) => v + 1);
    void this.refreshDbInfo();
  }

  async refreshDbInfo(schemaVersion?: number): Promise<void> {
    const handle = this.db.handle();
    const repos = this.db.repos();
    if (!handle || !repos) return;
    const [bytes, events] = await Promise.all([this.db.fileSizeBytes(), repos.events.countAll()]);
    this.dbInfoSig.set({
      path: handle.path,
      bytes: bytes.ok ? bytes.value : 0,
      events: events.ok ? events.value : 0,
      schemaVersion: schemaVersion ?? this.dbInfoSig()?.schemaVersion ?? 0,
    });
  }

  notify(text: string, tone: Toast['tone'] = 'neutral'): void {
    const toast: Toast = { id: uuidV7(), text, tone };
    this.toastsSig.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), TOAST_MS);
  }

  dismiss(id: string): void {
    this.toastsSig.update((list) => list.filter((t) => t.id !== id));
  }

  private async openDatabase(): Promise<Result<DatabaseHandle>> {
    if (isTauri()) {
      const path = await resolveDbPath();
      if (!path.ok) return path;
      return TauriDatabase.open(path.value);
    }
    if (FT_BROWSER_DEMO) {
      // Solo en builds de desarrollo; en producción esta rama no existe.
      const { SqlJsDatabase } = await import('../data/db/sqljs-database');
      this.demoSig.set(true);
      return SqlJsDatabase.open();
    }
    return {
      ok: false,
      error: notReady(
        'Fintrack necesita ejecutarse dentro de la ventana de Tauri (npm run dev). En el navegador no hay acceso a SQLite.',
      ),
    };
  }

  private fail(error: AppError): void {
    this.bootErrorSig.set(error);
    this.bootSig.set('error');
  }
}
