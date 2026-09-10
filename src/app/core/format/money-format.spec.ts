import { describeError } from '../errors/app-error';
import { money } from '../types/money';
import { MINUS, formatAmount, formatMoney, parseMoney } from './money-format';

describe('formatMoney', () => {
  it('agrupa millares siempre y usa coma decimal', () => {
    expect(formatMoney(money(123456))).toBe('1.234,56 €');
    expect(formatMoney(money(188437))).toBe('1.884,37 €'); // 4 dígitos con punto (handoff)
    expect(formatMoney(money(1248055))).toBe('12.480,55 €');
    expect(formatMoney(money(12284736))).toBe('122.847,36 €');
    expect(formatMoney(money(5))).toBe('0,05 €');
    expect(formatMoney(money(0))).toBe('0,00 €');
  });

  it('gestiona el signo como el handoff', () => {
    expect(formatMoney(money(-7241))).toBe(`${MINUS}72,41 €`);
    expect(formatMoney(money(241268), { sign: 'always' })).toBe('+2.412,68 €');
    expect(formatMoney(money(-7241), { sign: 'never' })).toBe('72,41 €');
    expect(formatAmount(money(6281))).toBe('62,81');
  });
});

describe('parseMoney', () => {
  const cents = (s: string) => {
    const r = parseMoney(s);
    return r.ok ? r.value : describeError(r.error);
  };

  it('acepta las formas habituales', () => {
    expect(cents('1.234,56')).toBe(123456);
    expect(cents('1234,56')).toBe(123456);
    expect(cents('1234.56')).toBe(123456);
    expect(cents('1,234.56')).toBe(123456);
    expect(cents('12')).toBe(1200);
    expect(cents('12,5')).toBe(1250);
    expect(cents('1.234')).toBe(123400); // millar es-ES
    expect(cents('1.5')).toBe(150);
    expect(cents('72,41 €')).toBe(7241);
    expect(cents(`${MINUS}72,41`)).toBe(-7241);
    expect(cents('-12,50')).toBe(-1250);
  });

  it('rechaza lo inválido', () => {
    expect(parseMoney('').ok).toBe(false);
    expect(parseMoney('abc').ok).toBe(false);
    expect(parseMoney('1,2,3').ok).toBe(false);
    expect(cents('1,234')).toBe('Máximo dos decimales.');
  });
});
