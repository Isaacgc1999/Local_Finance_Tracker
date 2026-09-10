import {
  addDays,
  addMonthsClamped,
  addYearsClamped,
  daysBetween,
  daysInMonth,
  endOfIsoWeek,
  endOfMonth,
  isIsoDate,
  isoDate,
  isoWeek,
  isoWeekKey,
  parseIsoDate,
  startOfIsoWeek,
  weekdayIso,
} from './iso-date';

describe('IsoDate', () => {
  it('valida fechas de calendario reales', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-9-1')).toBe(false);
    expect(isIsoDate(20260901)).toBe(false);
    expect(parseIsoDate('2026-04-31').ok).toBe(false);
    expect(() => isoDate(2026, 4, 31)).toThrow();
  });

  it('suma días cruzando meses y años', () => {
    expect(addDays(isoDate(2026, 12, 31), 1)).toBe('2027-01-01');
    expect(addDays(isoDate(2026, 3, 1), -1)).toBe('2026-02-28');
    expect(daysBetween(isoDate(2026, 9, 1), isoDate(2026, 9, 30))).toBe(29);
    expect(daysBetween(isoDate(2026, 9, 30), isoDate(2026, 9, 1))).toBe(-29);
  });

  it('recorta el día 31 al último día del mes (política de recurrencias)', () => {
    expect(addMonthsClamped(isoDate(2026, 1, 31), 1, 31)).toBe('2026-02-28');
    expect(addMonthsClamped(isoDate(2026, 1, 31), 3, 31)).toBe('2026-04-30');
    expect(addMonthsClamped(isoDate(2026, 1, 31), 4, 31)).toBe('2026-05-31');
    expect(addMonthsClamped(isoDate(2028, 1, 31), 1, 31)).toBe('2028-02-29');
    expect(addMonthsClamped(isoDate(2026, 11, 15), 2, 15)).toBe('2027-01-15'); // cambio de año
    expect(addYearsClamped(isoDate(2028, 2, 29), 1, 29)).toBe('2029-02-28');
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(endOfMonth(isoDate(2026, 9, 9))).toBe('2026-09-30');
  });

  it('calcula semanas ISO que empiezan en lunes', () => {
    expect(weekdayIso(isoDate(2026, 9, 7))).toBe(1); // lunes
    expect(weekdayIso(isoDate(2026, 9, 13))).toBe(7); // domingo
    expect(startOfIsoWeek(isoDate(2026, 9, 9))).toBe('2026-09-07');
    expect(endOfIsoWeek(isoDate(2026, 9, 9))).toBe('2026-09-13');
    expect(isoWeek(isoDate(2026, 9, 9))).toEqual({ year: 2026, week: 37 });
    expect(isoWeek(isoDate(2026, 1, 1))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(isoDate(2027, 1, 1))).toEqual({ year: 2026, week: 53 }); // año con 53 semanas
    expect(isoWeekKey(isoDate(2027, 1, 1))).toBe('2026-W53');
  });
});
