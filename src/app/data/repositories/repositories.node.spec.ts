import { NodeSqliteDatabase } from '../../../../tools/node-sqlite-database';
import { SYSTEM_CATEGORY } from '../../core/types/category';
import type { EventDraft } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import type { RecurrenceDraft } from '../../core/types/recurrence';
import { MIGRATIONS } from '../db/migrations';
import { applyPendingMigrations } from '../db/migrator';
import { type Repositories, createRepositories } from './index';

async function freshRepos(): Promise<Repositories> {
  const db = NodeSqliteDatabase.open();
  const migrated = await applyPendingMigrations(db, MIGRATIONS);
  if (!migrated.ok) throw new Error('migraciones');
  return createRepositories(db);
}

const gasto = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  type: 'expense',
  amountCents: money(7241),
  date: isoDate(2026, 9, 8),
  concept: 'Mercadona · compra semanal',
  categoryId: SYSTEM_CATEGORY.alimentacion,
  nature: 'variable',
  paymentMethod: 'Tarjeta ·5417',
  notes: null,
  attachmentPath: null,
  recurrenceId: null,
  meta: { type: 'expense' },
  ...overrides,
});

describe('EventsRepository', () => {
  it('inserta, lee, actualiza y borra', async () => {
    const repos = await freshRepos();
    const inserted = await repos.events.insert(gasto());
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const found = await repos.events.findById(inserted.value.id);
    expect(found.ok && found.value?.concept).toBe('Mercadona · compra semanal');
    expect(found.ok && found.value?.meta).toEqual({ type: 'expense' });

    const updated = await repos.events.update(inserted.value.id, { amountCents: money(8000), notes: 'nota' });
    expect(updated.ok && updated.value.amountCents).toBe(8000);
    expect(updated.ok && updated.value.notes).toBe('nota');

    const deleted = await repos.events.delete(inserted.value.id);
    expect(deleted.ok).toBe(true);
    const missing = await repos.events.delete(inserted.value.id);
    expect(!missing.ok && missing.error.kind).toBe('not_found');
  });

  it('rechaza importes no positivos y tipos desconocidos (CHECK)', async () => {
    const repos = await freshRepos();
    const zero = await repos.events.insert(gasto({ amountCents: money(0) }));
    expect(!zero.ok && zero.error.kind).toBe('db');
    const badDate = await repos.events.insert({ ...gasto(), date: '2026-9-8' as never });
    expect(badDate.ok).toBe(false);
  });

  it('filtra por rango, tipo, categoría y texto', async () => {
    const repos = await freshRepos();
    await repos.events.insert(gasto({ date: isoDate(2026, 9, 1), concept: 'Alquiler' }));
    await repos.events.insert(gasto({ date: isoDate(2026, 9, 5), type: 'income', categoryId: null, nature: null, concept: 'Nómina', meta: { type: 'income' } }));
    await repos.events.insert(gasto({ date: isoDate(2026, 8, 30), concept: 'Agosto' }));

    const sept = await repos.events.findInRange({ from: isoDate(2026, 9, 1), to: isoDate(2026, 9, 30) });
    expect(sept.ok && sept.value.map((e) => e.concept)).toEqual(['Nómina', 'Alquiler']);

    const income = await repos.events.findInRange({ from: isoDate(2026, 1, 1), to: isoDate(2026, 12, 31) }, { types: ['income'] });
    expect(income.ok && income.value.length).toBe(1);

    const byCat = await repos.events.findInRange(
      { from: isoDate(2026, 1, 1), to: isoDate(2026, 12, 31) },
      { categoryIds: [SYSTEM_CATEGORY.alimentacion] },
    );
    expect(byCat.ok && byCat.value.length).toBe(2);

    const search = await repos.events.findInRange({ from: isoDate(2026, 1, 1), to: isoDate(2026, 12, 31) }, { search: 'alqui' });
    expect(search.ok && search.value.map((e) => e.concept)).toEqual(['Alquiler']);

    const counts = await repos.events.countByCategory();
    expect(counts.ok && counts.value.get(SYSTEM_CATEGORY.alimentacion)).toBe(2);
    expect(counts.ok && counts.value.get(null)).toBe(1);
  });

  it('materializa instancias sin duplicar y respetando la edición manual', async () => {
    const repos = await freshRepos();
    const rule = await repos.recurrences.insert(regla());
    if (!rule.ok) throw new Error('regla');
    const draft = { ...gasto({ concept: 'Netflix', type: 'subscription', nature: null, meta: { type: 'subscription' } }), recurrenceId: rule.value.id };

    const first = await repos.events.insertManyIfAbsent([
      { ...draft, date: isoDate(2026, 9, 14) },
      { ...draft, date: isoDate(2026, 10, 14) },
    ]);
    expect(first.ok && first.value.inserted).toBe(2);

    const rows = await repos.events.findInRange({ from: isoDate(2026, 9, 1), to: isoDate(2026, 10, 31) });
    const sept14 = rows.ok ? rows.value.find((e) => e.date === '2026-09-14') : undefined;
    if (!sept14) throw new Error('instancia');
    await repos.events.update(sept14.id, { amountCents: money(1799) }); // edición manual

    const again = await repos.events.insertManyIfAbsent([
      { ...draft, date: isoDate(2026, 9, 14) },
      { ...draft, date: isoDate(2026, 11, 14) },
    ]);
    expect(again.ok && again.value.inserted).toBe(1);

    const edited = await repos.events.findById(sept14.id);
    expect(edited.ok && edited.value?.amountCents).toBe(1799); // la edición manual gana

    const dates = await repos.events.materializedDates(rule.value.id, { from: isoDate(2026, 9, 1), to: isoDate(2026, 12, 31) });
    expect(dates.ok && [...dates.value].sort()).toEqual(['2026-09-14', '2026-10-14', '2026-11-14']);
  });

  it('al borrar una regla las instancias quedan como movimientos sueltos', async () => {
    const repos = await freshRepos();
    const rule = await repos.recurrences.insert(regla());
    if (!rule.ok) throw new Error('regla');
    await repos.events.insertManyIfAbsent([{ ...gasto(), recurrenceId: rule.value.id }]);
    const deleted = await repos.recurrences.delete(rule.value.id);
    expect(deleted.ok).toBe(true);
    const rows = await repos.events.findRecent(5);
    expect(rows.ok && rows.value[0]?.recurrenceId).toBeNull();
  });
});

const regla = (overrides: Partial<RecurrenceDraft> = {}): RecurrenceDraft => ({
  type: 'subscription',
  amountCents: money(1399),
  categoryId: null,
  concept: 'Netflix Estándar',
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 14,
  weekday: null,
  startDate: isoDate(2026, 1, 14),
  endDate: null,
  active: true,
  paymentMethod: 'Tarjeta ·5417',
  meta: { type: 'subscription', service: 'Netflix' },
  ...overrides,
});

describe('RecurrencesRepository', () => {
  it('lista solo activas y desactiva a mitad de periodo fijando end_date', async () => {
    const repos = await freshRepos();
    const a = await repos.recurrences.insert(regla());
    await repos.recurrences.insert(regla({ concept: 'Spotify', active: false }));
    if (!a.ok) throw new Error('regla');

    const active = await repos.recurrences.findAll({ activeOnly: true });
    expect(active.ok && active.value.map((r) => r.concept)).toEqual(['Netflix Estándar']);

    const off = await repos.recurrences.setActive(a.value.id, false, isoDate(2026, 9, 20));
    expect(off.ok && off.value.active).toBe(false);
    expect(off.ok && off.value.endDate).toBe('2026-09-19');

    const on = await repos.recurrences.setActive(a.value.id, true, isoDate(2026, 10, 1));
    expect(on.ok && on.value.endDate).toBeNull();
  });
});

describe('CategoriesRepository', () => {
  it('trae la semilla en orden, filtra por tipo y no permite nombres duplicados', async () => {
    const repos = await freshRepos();
    const expense = await repos.categories.findAll('expense');
    expect(expense.ok && expense.value.map((c) => c.name)).toEqual([
      'Alimentación',
      'Hogar',
      'Transporte',
      'Ocio',
      'Salud',
      'Formación',
      'Viajes',
      'Otros',
    ]);
    expect(expense.ok && expense.value[0]?.color).toBe('#F45B5B');
    expect(expense.ok && expense.value[0]?.isSystem).toBe(true);

    const dup = await repos.categories.insert({ name: 'hogar', icon: null, color: '#FBBF24', kind: 'expense', sortOrder: 99 });
    expect(dup.ok).toBe(false);

    const created = await repos.categories.insert({ name: 'Mascotas', icon: null, color: '#22C55E', kind: 'expense', sortOrder: 99 });
    expect(created.ok && created.value.isSystem).toBe(false);
    if (!created.ok) return;
    const renamed = await repos.categories.update(created.value.id, { name: 'Perro', color: '#38BDF8' });
    expect(renamed.ok && renamed.value.name).toBe('Perro');
  });

  it('al borrar una categoría los movimientos quedan sin categoría', async () => {
    const repos = await freshRepos();
    const ev = await repos.events.insert(gasto({ categoryId: SYSTEM_CATEGORY.viajes }));
    const del = await repos.categories.delete(SYSTEM_CATEGORY.viajes);
    expect(del.ok).toBe(true);
    if (!ev.ok) return;
    const after = await repos.events.findById(ev.value.id);
    expect(after.ok && after.value?.categoryId).toBeNull();
  });
});

describe('SettingsRepository', () => {
  it('devuelve los valores por defecto de la semilla y persiste cambios tipados', async () => {
    const repos = await freshRepos();
    const initial = await repos.settings.getAll();
    expect(initial.ok && initial.value.currency).toBe('EUR');
    expect(initial.ok && initial.value.lastBackupAt).toBeNull();

    await repos.settings.set('currency', 'USD');
    await repos.settings.set('dateFormat', 'YYYY-MM-DD');
    await repos.settings.set('lastBackupAt', '2026-09-08T23:14:00.000Z');
    const after = await repos.settings.getAll();
    expect(after.ok && after.value.currency).toBe('USD');
    expect(after.ok && after.value.dateFormat).toBe('YYYY-MM-DD');
    expect(after.ok && after.value.lastBackupAt).toBe('2026-09-08T23:14:00.000Z');
  });
});

describe('BudgetsRepository', () => {
  it('empieza vacío: nada de presupuestos de ejemplo', async () => {
    const repos = await freshRepos();
    const all = await repos.budgets.findAll();
    expect(all.ok && all.value).toEqual([]);
  });

  it('guarda uno por ámbito, volver a guardarlo cambia el importe y se puede borrar', async () => {
    const repos = await freshRepos();
    const first = await repos.budgets.save('leisure', money(20_000));
    expect(first.ok).toBe(true);
    const again = await repos.budgets.save('leisure', money(25_000));
    expect(again.ok && again.value.amountCents).toBe(25_000);
    expect(again.ok && first.ok && again.value.id).toBe(first.ok ? first.value.id : '');
    await repos.budgets.save('category:cat-hogar', money(80_000));

    const all = await repos.budgets.findAll();
    expect(all.ok && [...all.value.map((b) => b.scope)].sort()).toEqual(['category:cat-hogar', 'leisure']);

    const leisure = all.ok ? all.value.find((b) => b.scope === 'leisure') : undefined;
    const deleted = await repos.budgets.delete(leisure?.id ?? '');
    expect(deleted.ok).toBe(true);
    const left = await repos.budgets.findAll();
    expect(left.ok && left.value.map((b) => b.scope)).toEqual(['category:cat-hogar']);
  });

  it('rechaza importes no positivos y ámbitos desconocidos', async () => {
    const repos = await freshRepos();
    expect((await repos.budgets.save('leisure', money(0))).ok).toBe(false);
    expect((await repos.budgets.save('lo-que-sea' as never, money(1_000))).ok).toBe(false);
  });
});

describe('AiReportsRepository', () => {
  it('guarda un informe por semana, regenerar sobrescribe y marca recomendaciones aplicadas', async () => {
    const repos = await freshRepos();
    const base = {
      id: 'r1',
      weekStart: isoDate(2026, 8, 31),
      weekEnd: isoDate(2026, 9, 6),
      model: 'llama3.1:8b',
      generatedAt: '2026-09-07T10:00:00.000Z',
      status: 'completed' as const,
      verdict: 'Semana cara por un solo motivo: el viaje.',
      findings: [{ title: 'Ocio se ha triplicado', detail: '406,60 €', amount_cents: 40660, severity: 'high' as const }],
      recommendations: [{ action: 'Cancelar gimnasio', rationale: 'sin uso', monthly_impact_cents: 3490, effort: 'low' as const }],
      savingsPotentialCents: money(11010),
      durationMs: 34_000,
      error: null,
      summaryInput: { week: 36 },
    };
    const first = await repos.aiReports.upsert(base);
    expect(first.ok).toBe(true);

    const second = await repos.aiReports.upsert({ ...base, id: 'r2', verdict: 'Regenerado', status: 'failed', error: 'timeout' });
    expect(second.ok).toBe(true);

    const all = await repos.aiReports.findAll();
    expect(all.ok && all.value.length).toBe(1);
    expect(all.ok && all.value[0]?.id).toBe('r2');
    expect(all.ok && all.value[0]?.status).toBe('failed');

    const applied = await repos.aiReports.setRecommendationApplied('r2', 0, true);
    expect(applied.ok && applied.value.recommendations[0]?.applied).toBe(true);
    const byWeek = await repos.aiReports.findByWeek(isoDate(2026, 8, 31));
    expect(byWeek.ok && byWeek.value?.recommendations[0]?.applied).toBe(true);
  });
});
