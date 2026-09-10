import { isoDate } from '../types/iso-date';
import {
  formatDate,
  formatDayMonth,
  formatDuration,
  formatInDays,
  formatMonthYear,
  formatRange,
  formatRelative,
  formatWeekLabel,
} from './date-format';

describe('date-format', () => {
  it('formatea fechas según el ajuste del usuario', () => {
    expect(formatDate(isoDate(2026, 9, 8))).toBe('08/09/2026');
    expect(formatDate(isoDate(2026, 9, 8), 'YYYY-MM-DD')).toBe('2026-09-08');
    expect(formatDayMonth(isoDate(2026, 9, 9))).toBe('9 sep');
    expect(formatMonthYear(isoDate(2026, 9, 1))).toBe('Septiembre 2026');
    expect(formatMonthYear(isoDate(2026, 9, 1), 'short')).toBe('Sept. 2026');
  });

  it('formatea rangos y semanas como el handoff', () => {
    const range = { from: isoDate(2026, 4, 1), to: isoDate(2026, 9, 30) };
    expect(formatRange(range)).toBe('01/04/2026 — 30/09/2026');
    expect(formatRange(range, 'DD/MM/YYYY', true)).toBe('01/04 — 30/09/2026');
    expect(formatWeekLabel(isoDate(2026, 9, 7))).toBe('Semana 37 · 7–13 sep 2026');
    expect(formatWeekLabel(isoDate(2026, 8, 31))).toBe('Semana 36 · 31 ago–6 sep 2026');
  });

  it('formatea tiempos relativos y duraciones', () => {
    const now = new Date('2026-09-09T12:00:00Z');
    expect(formatRelative('2026-09-09T10:00:00Z', now)).toBe('hace 2 h');
    expect(formatRelative('2026-09-09T11:55:00Z', now)).toBe('hace 5 min');
    expect(formatRelative('2026-09-06T12:00:00Z', now)).toBe('hace 3 d');
    expect(formatInDays(5)).toBe('en 5 días');
    expect(formatInDays(0)).toBe('hoy');
    expect(formatDuration(34_000)).toBe('34 s');
    expect(formatDuration(72_000)).toBe('1 min 12 s');
  });
});
