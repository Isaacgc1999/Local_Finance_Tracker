import { TestBed } from '@angular/core/testing';

import { AppStatusFacade } from './app-status.facade';

describe('AppStatusFacade · avisos', () => {
  let status: AppStatusFacade;

  beforeEach(() => {
    vi.useFakeTimers();
    status = TestBed.inject(AppStatusFacade);
  });

  afterEach(() => vi.useRealTimers());

  it('caduca a su tiempo, pasa por la salida y ejecuta onExpire una sola vez', () => {
    const onExpire = vi.fn();
    status.notify('Hecho', 'neutral', { durationMs: 1000, onExpire });
    vi.advanceTimersByTime(999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(status.toasts()[0]?.leaving).toBe(true);
    vi.advanceTimersByTime(500);
    expect(status.toasts()).toEqual([]);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('la acción se ejecuta y cancela onExpire', () => {
    const run = vi.fn();
    const onExpire = vi.fn();
    const id = status.notify('Borrado', 'neutral', { action: { label: 'Deshacer', run }, onExpire });
    status.runAction(id);
    status.runAction(id);
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('con más de tres avisos, el más antiguo sale y confirma lo suyo', () => {
    const onExpire = vi.fn();
    status.notify('1', 'neutral', { onExpire });
    status.notify('2');
    status.notify('3');
    status.notify('4');
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(status.toasts().filter((t) => !t.leaving).map((t) => t.text)).toEqual(['2', '3', '4']);
  });
});
