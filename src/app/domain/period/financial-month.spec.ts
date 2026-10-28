import { isoDate } from '../../core/types/iso-date';
import { FinancialCalendar, isPayroll } from './financial-month';

const d = isoDate;

describe('FinancialCalendar', () => {
  it('en modo natural es el mes de calendario', () => {
    const cal = new FinancialCalendar();
    expect(cal.rangeOf(d(2026, 11, 15))).toEqual({ from: d(2026, 11, 1), to: d(2026, 11, 30) });
    expect(cal.labelOf(d(2026, 10, 28))).toBe(d(2026, 10, 1));
  });

  it('con día de referencia 28 y sin nóminas: 28 oct – 27 nov es noviembre', () => {
    const cal = new FinancialCalendar({ mode: 'payday', startDay: 28 });
    expect(cal.rangeOf(d(2026, 11, 1))).toEqual({ from: d(2026, 10, 28), to: d(2026, 11, 27) });
    expect(cal.labelOf(d(2026, 10, 28))).toBe(d(2026, 11, 1));
    expect(cal.labelOf(d(2026, 10, 27))).toBe(d(2026, 10, 1));
  });

  it('una nómina que llega antes adelanta el inicio del mes', () => {
    const cal = new FinancialCalendar({ mode: 'payday', startDay: 28 }, [d(2026, 10, 26), d(2026, 11, 27)]);
    expect(cal.rangeOf(d(2026, 11, 1))).toEqual({ from: d(2026, 10, 26), to: d(2026, 11, 26) });
    expect(cal.labelOf(d(2026, 10, 26))).toBe(d(2026, 11, 1));
    expect(cal.rangeOf(d(2026, 12, 1)).from).toBe(d(2026, 11, 27));
  });

  it('una nómina fuera de la ventana de ±7 días no mueve nada', () => {
    const cal = new FinancialCalendar({ mode: 'payday', startDay: 28 }, [d(2026, 10, 10)]);
    expect(cal.rangeOf(d(2026, 11, 1)).from).toBe(d(2026, 10, 28));
  });

  it('una nómina tardía retrasa el inicio y alarga el mes anterior', () => {
    const cal = new FinancialCalendar({ mode: 'payday', startDay: 28 }, [d(2026, 11, 2)]);
    expect(cal.rangeOf(d(2026, 10, 1)).to).toBe(d(2026, 11, 1));
    expect(cal.rangeOf(d(2026, 11, 1)).from).toBe(d(2026, 11, 2));
  });

  it('con día de referencia bajo, el mes empieza dentro del propio mes', () => {
    const cal = new FinancialCalendar({ mode: 'payday', startDay: 5 });
    expect(cal.rangeOf(d(2026, 11, 1))).toEqual({ from: d(2026, 11, 5), to: d(2026, 12, 4) });
  });

  it('cubre el año sin huecos ni solapes', () => {
    const cal = new FinancialCalendar({ mode: 'payday', startDay: 25 }, [d(2026, 1, 23), d(2026, 2, 27), d(2026, 6, 20)]);
    let prevTo = cal.rangeOf(d(2026, 1, 1)).to;
    for (let m = 2; m <= 12; m++) {
      const r = cal.rangeOf(d(2026, m, 1));
      const next = new Date(Date.UTC(Number(prevTo.slice(0, 4)), Number(prevTo.slice(5, 7)) - 1, Number(prevTo.slice(8)) + 1));
      expect(r.from).toBe(next.toISOString().slice(0, 10));
      prevTo = r.to;
    }
  });
});

describe('isPayroll', () => {
  it('reconoce la categoría Nómina y el concepto con o sin tilde', () => {
    expect(isPayroll({ concept: 'Transferencia', categoryId: 'cat-nomina' })).toBe(true);
    expect(isPayroll({ concept: 'NÓMINA OCTUBRE ACME', categoryId: null })).toBe(true);
    expect(isPayroll({ concept: 'Abono nomina', categoryId: 'cat-otros-ingresos' })).toBe(true);
    expect(isPayroll({ concept: 'Bizum de Ana', categoryId: null })).toBe(false);
  });
});
