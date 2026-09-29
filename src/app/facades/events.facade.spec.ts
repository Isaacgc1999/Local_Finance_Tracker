import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { Event } from '../core/types/event';
import type { IsoDate } from '../core/types/iso-date';
import { money } from '../core/types/money';
import { ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { AppStatusFacade } from './app-status.facade';
import { EventsFacade } from './events.facade';

function evento(id: string, concept: string): Event {
  return {
    id,
    type: 'expense',
    amountCents: money(1000),
    date: '2026-09-10' as IsoDate,
    concept,
    categoryId: null,
    nature: 'variable',
    paymentMethod: null,
    notes: null,
    attachmentPath: null,
    recurrenceId: null,
    accountId: null,
    meta: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('EventsFacade · borrar con «Deshacer»', () => {
  let facade: EventsFacade;
  let status: AppStatusFacade;
  let deleteMany: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    const rows = [evento('a', 'Mercadona'), evento('b', 'Netflix')];
    deleteMany = vi.fn(async (ids: readonly string[]) => ok({ deleted: ids.length }));
    const repos = {
      events: { findInRange: async () => ok(rows), deleteMany },
      categories: { findAll: async () => ok([]) },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: DbConnection, useValue: { ready: signal(true), handle: signal(null), repos: signal(null), require: () => ok(repos) } }],
    });
    facade = TestBed.inject(EventsFacade);
    status = TestBed.inject(AppStatusFacade);
    TestBed.tick();
    await vi.runAllTimersAsync();
  });

  afterEach(() => vi.useRealTimers());

  it('oculta al momento y no borra de la BD hasta que caduca el aviso', async () => {
    facade.selectAllVisible(false);
    facade.toggleSelected('a');
    facade.deleteSelected();
    expect(facade.filtered().map((e) => e.id)).toEqual(['b']);
    expect(facade.selecting()).toBe(false);
    expect(deleteMany).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6000);
    expect(deleteMany).toHaveBeenCalledWith(['a']);
    expect(facade.filtered().map((e) => e.id)).toEqual(['b']);
  });

  it('«Deshacer» devuelve las filas y no toca la BD', async () => {
    facade.toggleSelected('a');
    facade.toggleSelected('b');
    facade.deleteSelected();
    expect(facade.filtered()).toEqual([]);

    const toast = status.toasts().at(-1);
    expect(toast?.action?.label).toBe('Deshacer');
    status.runAction(toast!.id);
    expect(facade.filtered().map((e) => e.id)).toEqual(['a', 'b']);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
