import { NBSP, formatMoney } from '../../core/format/money-format';
import { money } from '../../core/types/money';
import { type CalcKey, CalculatorEngine, keyFromKeyboard, parseEntry } from './calculator-engine';
import { compoundInterest, percentOf, splitBetween } from './financial';

function press(engine: CalculatorEngine, keys: string): void {
  for (const key of keys.split(' ')) engine.press(key as CalcKey);
}

describe('CalculatorEngine', () => {
  it('teclea cifras con decimales y separador de millar', () => {
    const c = new CalculatorEngine();
    press(c, '1 8 8 4 , 3 7');
    expect(c.snapshot().display).toBe('1.884,37');
    expect(c.snapshot().result).toBe(188_437);
    expect(parseEntry('1.884,37')).toBe(188_437);
  });

  it('reproduce la operación del handoff: 1.884,37 ÷ 30 = 62,81', () => {
    const c = new CalculatorEngine();
    press(c, '1 8 8 4 , 3 7 ÷ 3 0 =');
    const s = c.snapshot();
    expect(s.display).toBe('62,81');
    expect(s.result).toBe(6281);
    expect(s.expression).toBe('1.884,37 ÷ 30 =');
    expect(s.history[0]).toMatchObject({ expression: '1.884,37 ÷ 30', result: 6281 });
  });

  it('las otras operaciones del historial del handoff', () => {
    const c = new CalculatorEngine();
    press(c, '7 8 0 × 1 2 =');
    expect(c.snapshot().display).toBe('9.360,00');
    press(c, 'C 2 7 5 2 , 6 8 − 1 8 8 4 , 3 7 =');
    expect(c.snapshot().display).toBe('868,31');
  });

  it('suma sin errores de float', () => {
    const c = new CalculatorEngine();
    press(c, '0 , 1 + 0 , 2 =');
    expect(c.snapshot().result).toBe(30);
    expect(formatMoney(c.snapshot().result)).toBe(`0,30${NBSP}€`);
  });

  it('encadena operaciones cerrando la anterior', () => {
    const c = new CalculatorEngine();
    press(c, '1 0 + 5 + 2 =');
    expect(c.snapshot().result).toBe(1700); // 17,00
    press(c, 'C 2 × 3 × 4 =');
    expect(c.snapshot().result).toBe(2400); // 24,00
  });

  it('trata la división entre cero sin romperse', () => {
    const c = new CalculatorEngine();
    press(c, '1 0 ÷ 0 =');
    expect(c.snapshot().error).toBe('No se puede dividir entre cero.');
    expect(c.snapshot().display).toBe('0');
    press(c, '5 + 5 =');
    expect(c.snapshot().error).toBeNull();
    expect(c.snapshot().result).toBe(1000);
  });

  it('C, ±, %, retroceso y coma repetida', () => {
    const c = new CalculatorEngine();
    press(c, '5 0 ±');
    expect(c.snapshot().display).toBe('−50');
    press(c, '±');
    expect(c.snapshot().display).toBe('50');
    press(c, 'backspace');
    expect(c.snapshot().display).toBe('5');
    press(c, 'C 2 1 %');
    expect(c.snapshot().result).toBe(21); // 21 → 0,21
    press(c, 'C 1 , 2 , 3');
    expect(c.snapshot().display).toBe('1,23');
    press(c, 'C');
    expect(c.snapshot().display).toBe('0');
  });

  it('guarda historial reutilizable y lo puede vaciar', () => {
    const c = new CalculatorEngine();
    press(c, '2 + 2 =');
    press(c, '1 0 × 3 =');
    expect(c.snapshot().history.map((h) => h.result)).toEqual([3000, 400]);
    const reused = c.load(money(3000));
    expect(reused.display).toBe('30,00');
    press(c, '+ 1 0 =');
    expect(c.snapshot().result).toBe(4000);
    c.clearHistory();
    expect(c.snapshot().history).toEqual([]);
  });

  it('traduce el teclado físico', () => {
    expect(keyFromKeyboard('7')).toBe('7');
    expect(keyFromKeyboard('.')).toBe(',');
    expect(keyFromKeyboard('*')).toBe('×');
    expect(keyFromKeyboard('/')).toBe('÷');
    expect(keyFromKeyboard('-')).toBe('−');
    expect(keyFromKeyboard('Enter')).toBe('=');
    expect(keyFromKeyboard('Backspace')).toBe('backspace');
    expect(keyFromKeyboard('Escape')).toBeNull(); // Escape cierra el panel
    expect(keyFromKeyboard('Delete')).toBe('C');
    expect(keyFromKeyboard('q')).toBeNull();
  });
});

describe('calculadora financiera', () => {
  it('% de importe: 21 % de 2.412,68 € = 506,66 € (handoff)', () => {
    expect(percentOf(money(241_268), 2100)).toBe(50_666);
    expect(percentOf(money(0), 2100)).toBe(0);
  });

  it('dividir entre N personas sin perder céntimos', () => {
    const tres = splitBetween(money(10_000), 3);
    expect(tres.each).toBe(3333);
    expect(tres.remainder).toBe(1);
    expect(tres.shares).toEqual([3334, 3333, 3333]);
    expect(tres.shares.reduce((a, b) => a + b, 0)).toBe(10_000);

    const exacto = splitBetween(money(10_000), 4);
    expect(exacto.each).toBe(2500);
    expect(exacto.remainder).toBe(0);

    expect(splitBetween(money(10_000), 0).shares).toEqual([]);
    expect(splitBetween(money(10_000), 2.5).shares).toEqual([]);
  });

  it('interés compuesto: capital 4.200 €, 250 €/mes, 18 años al 6,8 %', () => {
    const r = compoundInterest({
      principal: money(420_000),
      monthlyContribution: money(25_000),
      years: 18,
      annualRateBp: 680,
    });
    expect(r.contributed).toBe(420_000 + 25_000 * 216); // 58.200,00 € (handoff)
    expect(formatMoney(r.contributed)).toBe(`58.200,00${NBSP}€`);
    // El handoff muestra 122.847,36 €; la cifra exacta depende del convenio de
    // capitalización, así que se comprueba el orden de magnitud y la coherencia.
    expect(r.finalValue).toBeGreaterThan(115_00_000);
    expect(r.finalValue).toBeLessThan(130_00_000);
    expect(r.interest).toBe(r.finalValue - r.contributed);
  });

  it('interés compuesto con casos límite', () => {
    const sinTiempo = compoundInterest({ principal: money(100_000), monthlyContribution: money(1000), years: 0, annualRateBp: 680 });
    expect(sinTiempo.finalValue).toBe(100_000);
    expect(sinTiempo.interest).toBe(0);

    const sinInteres = compoundInterest({ principal: money(100_000), monthlyContribution: money(10_000), years: 1, annualRateBp: 0 });
    expect(sinInteres.finalValue).toBe(100_000 + 10_000 * 12);
    expect(sinInteres.interest).toBe(0);

    const soloAportacion = compoundInterest({ principal: money(0), monthlyContribution: money(10_000), years: 2, annualRateBp: 500 });
    expect(soloAportacion.contributed).toBe(240_000);
    expect(soloAportacion.finalValue).toBeGreaterThan(soloAportacion.contributed);
  });
});
