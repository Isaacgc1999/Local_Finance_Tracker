import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import type { AppError } from '../core/errors/app-error';
import type { Category } from '../core/types/category';
import { type Event, type EventType, balanceSign } from '../core/types/event';
import { type IsoDate, monthRange, startOfMonth, todayIso } from '../core/types/iso-date';
import { type Money, addMoney, money, ZERO } from '../core/types/money';
import { type Result, err, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { EventService } from '../domain/events/event.service';
import { AppStatusFacade } from './app-status.facade';

export interface DayGroup {
  readonly date: IsoDate;
  readonly items: readonly Event[];
  /** Suma con signo del día (ingresos +, resto −). */
  readonly balance: Money;
}

/** Listado de movimientos del mes visible con filtros de tipo y búsqueda. */
@Injectable({ providedIn: 'root' })
export class EventsFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  readonly month = signal<IsoDate>(startOfMonth(todayIso()));
  readonly types = signal<readonly EventType[]>([]);
  readonly search = signal('');

  private readonly eventsSig = signal<readonly Event[]>([]);
  private readonly categoriesSig = signal<readonly Category[]>([]);
  private readonly loadingSig = signal(false);
  private readonly errorSig = signal<AppError | null>(null);

  readonly events = this.eventsSig.asReadonly();
  readonly categories = this.categoriesSig.asReadonly();
  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();

  readonly categoryById = computed(() => new Map(this.categoriesSig().map((c) => [c.id, c])));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLocaleLowerCase('es');
    if (!q) return this.eventsSig();
    return this.eventsSig().filter((e) => e.concept.toLocaleLowerCase('es').includes(q));
  });

  readonly groupedByDay = computed<readonly DayGroup[]>(() => {
    const groups = new Map<IsoDate, Event[]>();
    for (const e of this.filtered()) {
      const list = groups.get(e.date);
      if (list) list.push(e);
      else groups.set(e.date, [e]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([date, items]) => ({
        date,
        items,
        balance: items.reduce((acc, e) => addMoney(acc, money(balanceSign(e.type) * e.amountCents)), ZERO),
      }));
  });

  readonly total = computed(() => this.filtered().length);
  readonly hasFilters = computed(() => this.types().length > 0 || this.search().trim() !== '');

  constructor() {
    // Recarga cuando cambian mes, tipos o los datos (guardar, borrar, materializar).
    effect(() => {
      const month = this.month();
      const types = this.types();
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load(month, types));
    });
  }

  clearFilters(): void {
    this.types.set([]);
    this.search.set('');
  }

  async remove(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const result = await new EventService(repos.value).remove(id);
    if (result.ok) this.status.touch();
    return result;
  }

  private async load(month: IsoDate, types: readonly EventType[]): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) {
      this.errorSig.set(repos.error);
      return;
    }
    this.loadingSig.set(true);
    const [events, categories] = await Promise.all([
      repos.value.events.findInRange(monthRange(month), { types }),
      repos.value.categories.findAll(),
    ]);
    this.loadingSig.set(false);
    if (!events.ok) {
      this.errorSig.set(events.error);
      return;
    }
    this.errorSig.set(null);
    this.eventsSig.set(events.value);
    if (categories.ok) this.categoriesSig.set(categories.value);
  }
}

export function okOrError<T>(r: Result<T>): Result<T> {
  return r.ok ? ok(r.value) : err(r.error);
}
