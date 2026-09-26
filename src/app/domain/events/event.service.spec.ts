import type { EventDraft } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { validateEventDraft } from './event.service';

const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  type: 'expense',
  amountCents: money(7241),
  date: isoDate(2026, 9, 8),
  concept: ' Mercadona ',
  categoryId: 'cat-alimentacion',
  nature: 'variable',
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null, accountId: null,
  meta: { type: 'expense' },
  ...overrides,
});

const fields = (d: EventDraft) => {
  const r = validateEventDraft(d);
  return r.ok ? [] : r.error.map((e) => e.field);
};

describe('validateEventDraft', () => {
  it('acepta un gasto completo y recorta el concepto', () => {
    const r = validateEventDraft(draft());
    expect(r.ok && r.value.concept).toBe('Mercadona');
  });

  it('exige importe > 0, concepto y categoría en gasto', () => {
    expect(fields(draft({ amountCents: money(0) }))).toEqual(['amount']);
    expect(fields(draft({ concept: '   ' }))).toEqual(['concept']);
    expect(fields(draft({ categoryId: null }))).toEqual(['category']);
    expect(fields(draft({ amountCents: money(-5), concept: '', categoryId: null }))).toEqual(['amount', 'concept', 'category']);
  });

  it('exige ticker en inversión y rechaza naturaleza fuera de gastos', () => {
    const inv = draft({ type: 'investment', categoryId: null, nature: null, meta: { type: 'investment', ticker: '' } });
    expect(fields(inv)).toEqual(['ticker']);
    const ok = draft({ type: 'investment', categoryId: null, nature: null, meta: { type: 'investment', ticker: 'IE00B4L5Y983' } });
    expect(fields(ok)).toEqual([]);
    expect(fields(draft({ type: 'income', nature: 'fixed', meta: { type: 'income' } }))).toEqual(['nature']);
  });
});
