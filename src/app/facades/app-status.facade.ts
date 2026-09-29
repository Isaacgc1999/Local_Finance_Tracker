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

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: string;
  readonly text: string;
  readonly tone: 'income' | 'expense' | 'neutral';
  /** Botón opcional («Deshacer»). Pulsarlo cierra el aviso sin llamar a `onExpire`. */
  readonly action: ToastAction | null;
  readonly durationMs: number;
  /** `true` durante la animación de salida, antes de quitarlo de la lista. */
  readonly leaving: boolean;
}

export interface NotifyOptions {
  readonly action?: ToastAction;
  readonly durationMs?: number;
  /** Se ejecuta si el aviso caduca o se cierra sin pulsar la acción. */
  readonly onExpire?: () => void;
}

const TOAST_MS = 4000;
/** Lo que tarda la animación de salida del aviso (`ft-toast-out`). */
const TOAST_LEAVE_MS = 180;
/** Como mucho tres avisos a la vez: el más antiguo sale para dejar sitio. */
const TOAST_MAX = 3;

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
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly onExpire = new Map<string, () => void>();

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

  notify(text: string, tone: Toast['tone'] = 'neutral', options: NotifyOptions = {}): string {
    const durationMs = options.durationMs ?? TOAST_MS;
    const toast: Toast = { id: uuidV7(), text, tone, action: options.action ?? null, durationMs, leaving: false };
    if (options.onExpire) this.onExpire.set(toast.id, options.onExpire);
    const visible = this.toastsSig().filter((t) => !t.leaving);
    const oldest = visible.length >= TOAST_MAX ? visible[0] : undefined;
    if (oldest) this.dismiss(oldest.id);
    this.toastsSig.update((list) => [...list, toast]);
    this.timers.set(
      toast.id,
      setTimeout(() => this.dismiss(toast.id), durationMs),
    );
    return toast.id;
  }

  /** Pulsa la acción del aviso: la ejecuta y lo cierra sin disparar `onExpire`. */
  runAction(id: string): void {
    const toast = this.toastsSig().find((t) => t.id === id);
    if (!toast?.action || toast.leaving) return;
    this.onExpire.delete(id);
    toast.action.run();
    this.dismiss(id);
  }

  /** Cierra el aviso (caducado o descartado). Si tenía `onExpire`, se ejecuta una vez. */
  dismiss(id: string): void {
    const toast = this.toastsSig().find((t) => t.id === id);
    if (!toast || toast.leaving) return;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    const expire = this.onExpire.get(id);
    this.onExpire.delete(id);
    expire?.();
    this.toastsSig.update((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => this.toastsSig.update((list) => list.filter((t) => t.id !== id)), TOAST_LEAVE_MS);
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
