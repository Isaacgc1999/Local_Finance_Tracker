import { formatBasisPoints, formatDelta, formatInteger, formatPoints } from './percent-format';

describe('percent-format', () => {
  it('muestra porcentajes con un decimal y guion para null', () => {
    expect(formatBasisPoints(6846)).toBe('68,5 %');
    expect(formatBasisPoints(2690)).toBe('26,9 %');
    expect(formatBasisPoints(10000, { decimals: 0 })).toBe('100 %');
    expect(formatBasisPoints(null)).toBe('—');
    expect(formatBasisPoints(-620, { sign: 'always' })).toBe('−6,2 %');
    expect(formatBasisPoints(40, { sign: 'always' })).toBe('+0,4 %');
  });

  it('codifica el signo con flecha y color como el handoff', () => {
    expect(formatDelta(-480)).toEqual({ text: '▼ 4,8 %', tone: 'income' });
    expect(formatDelta(14830)).toEqual({ text: '▲ 148,3 %', tone: 'expense' });
    expect(formatDelta(1410, { goodWhenNegative: false })).toEqual({ text: '▲ 14,1 %', tone: 'income' });
    expect(formatDelta(null).tone).toBe('neutral');
  });

  it('formatea puntos y enteros', () => {
    expect(formatPoints(3850)).toBe('38,5 puntos');
    expect(formatInteger(1847)).toBe('1.847');
    expect(formatInteger(31)).toBe('31');
  });
});
