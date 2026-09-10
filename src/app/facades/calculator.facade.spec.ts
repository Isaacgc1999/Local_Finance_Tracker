import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';

import { money } from '../core/types/money';
import { CalculatorFacade } from './calculator.facade';

describe('CalculatorFacade', () => {
  let facade: CalculatorFacade;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    facade = TestBed.inject(CalculatorFacade);
    router = TestBed.inject(Router);
  });

  it('abre y cierra el panel sin tocar el estado del cálculo', () => {
    expect(facade.open()).toBe(false);
    facade.press('7');
    facade.toggle();
    expect(facade.open()).toBe(true);
    facade.close();
    expect(facade.open()).toBe(false);
    expect(facade.display()).toBe('7');
  });

  it('la etiqueta de la barra inferior sigue al resultado activo', () => {
    expect(facade.usableAmount()).toBeNull();
    facade.press('1');
    facade.press('8');
    facade.press('8');
    facade.press('4');
    facade.press(',');
    facade.press('3');
    facade.press('7');
    facade.press('÷');
    facade.press('3');
    facade.press('0');
    facade.press('=');
    expect(facade.usableAmount()).toBe(6281);
    expect(facade.usableLabel()).toBe('Usar 62,81 en nuevo evento');
  });

  it('la pestaña financiera manda cuando está activa', () => {
    facade.tab.set('financial');
    facade.mode.set('percent');
    facade.percentBase.set(money(241_268));
    facade.percentRateBp.set(2100);
    expect(facade.financial().value).toBe(50_666);
    expect(facade.financial().expression).toBe('21 % de 2.412,68');
    expect(facade.usableAmount()).toBe(50_666);
  });

  it('guarda la cuenta financiera en el historial compartido y la reutiliza', () => {
    facade.tab.set('financial');
    facade.mode.set('percent');
    facade.recordFinancial();
    expect(facade.history()[0]).toMatchObject({ expression: '21 % de 2.412,68', result: 50_666 });

    const entrada = facade.history()[0];
    if (!entrada) throw new Error('sin historial');
    facade.reuse(entrada);
    expect(facade.tab()).toBe('standard');
    expect(facade.display()).toBe('506,66');
  });

  it('el modo dividir reparte sin perder céntimos', () => {
    facade.mode.set('split');
    facade.splitAmount.set(money(10_000));
    facade.splitPeople.set(3);
    expect(facade.financial().value).toBe(3333);
    expect(facade.split().shares.reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it('«usar en nuevo evento» viaja en céntimos enteros y cierra el panel', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    facade.openPanel();
    facade.press('5');
    facade.press('0');
    facade.press('=');
    await facade.useInNewEvent();
    expect(navigate).toHaveBeenCalledWith(['/events/new'], { queryParams: { amount: '5000' } });
    expect(facade.open()).toBe(false);
  });

  it('no navega si no hay un importe positivo', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await facade.useInNewEvent();
    expect(navigate).not.toHaveBeenCalled();
  });
});
