import type { Event } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import type { PotEntry, SavingsPot } from '../../core/types/savings';
import { balancesByPot, defaultPotId, potFlows } from './pot-balances';

const pot = (id: string, kind: SavingsPot['kind']): SavingsPot => ({
  id,
  name: id,
  kind,
  color: '#FBBF24',
  targetCents: null,
  goalId: null,
  archived: false,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

const saving = (id: string, cents: number, potId?: string): Event => ({
  id,
  type: 'saving',
  amountCents: money(cents),
  date: isoDate(2026, 10, 1),
  concept: 'Traspaso',
  categoryId: null,
  nature: null,
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null,
  accountId: null,
  meta: potId ? { type: 'saving', potId } : { type: 'saving' },
  source: 'manual',
  importBatch: null,
  createdAt: '',
  updatedAt: '',
});

describe('pot-balances', () => {
  const pots = [pot('pot-emergency', 'emergency'), pot('pot-general', 'general'), pot('coche', 'goal')];

  it('suma apuntes y movimientos de ahorro; sin hucha van a Ahorro general', () => {
    const entries: PotEntry[] = [
      { id: 'e1', potId: 'pot-emergency', date: isoDate(2026, 9, 1), amountCents: money(300000), note: null, createdAt: '' },
      { id: 'e2', potId: 'pot-emergency', date: isoDate(2026, 10, 3), amountCents: money(-50000), note: 'Dentista', createdAt: '' },
    ];
    const fallback = defaultPotId(pots, 'pot-general');
    const flows = potFlows(pots, entries, [saving('s1', 20000), saving('s2', 15000, 'coche'), saving('s3', 1000, 'borrada')], fallback);
    const b = balancesByPot(flows);
    expect(b.get('pot-emergency')).toBe(250000);
    expect(b.get('pot-general')).toBe(21000);
    expect(b.get('coche')).toBe(15000);
  });
});
