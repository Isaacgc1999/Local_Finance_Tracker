import { NodeSqliteDatabase } from '../../../../tools/node-sqlite-database';
import { SYSTEM_CATEGORY } from '../../core/types/category';
import type { EventDraft } from '../../core/types/event';
import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
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
  amountCents: money(1200),
  date: isoDate(2026, 9, 8),
  concept: 'Mercadona',
  categoryId: SYSTEM_CATEGORY.otros,
  nature: 'variable',
  paymentMethod: null,
  notes: null,
  attachmentPath: null,
  recurrenceId: null,
  accountId: null,
  meta: { type: 'expense' },
  ...overrides,
});

describe('CategoryRulesRepository', () => {
  it('crea, lista en orden, edita y borra', async () => {
    const repos = await freshRepos();
    const a = await repos.categoryRules.insert({ pattern: '  Mercadona  ', categoryId: SYSTEM_CATEGORY.alimentacion });
    expect(a.ok && a.value.pattern).toBe('Mercadona');
    const b = await repos.categoryRules.insert({ pattern: 'amazon prime', categoryId: SYSTEM_CATEGORY.ocio });
    expect(b.ok).toBe(true);

    const all = await repos.categoryRules.findAll();
    // Mismo sortOrder: primero el patrón más largo.
    expect(all.ok && all.value.map((r) => r.pattern)).toEqual(['amazon prime', 'Mercadona']);

    if (!a.ok) return;
    const updated = await repos.categoryRules.update(a.value.id, { categoryId: SYSTEM_CATEGORY.hogar });
    expect(updated.ok && updated.value.categoryId).toBe(SYSTEM_CATEGORY.hogar);

    const deleted = await repos.categoryRules.delete(a.value.id);
    expect(deleted.ok).toBe(true);
    const missing = await repos.categoryRules.delete(a.value.id);
    expect(!missing.ok && missing.error.kind).toBe('not_found');
  });

  it('rechaza patrones cortos y duplicados sin distinguir mayúsculas', async () => {
    const repos = await freshRepos();
    const short = await repos.categoryRules.insert({ pattern: 'a', categoryId: SYSTEM_CATEGORY.otros });
    expect(!short.ok && short.error.kind).toBe('validation');
    await repos.categoryRules.insert({ pattern: 'Netflix', categoryId: SYSTEM_CATEGORY.ocio });
    const dup = await repos.categoryRules.insert({ pattern: 'NETFLIX', categoryId: SYSTEM_CATEGORY.otros });
    expect(!dup.ok && dup.error.kind).toBe('validation');
  });

  it('upsertByPattern cambia la categoría de la regla existente en vez de duplicarla', async () => {
    const repos = await freshRepos();
    await repos.categoryRules.insert({ pattern: 'Netflix', categoryId: SYSTEM_CATEGORY.otros });
    const again = await repos.categoryRules.upsertByPattern({ pattern: 'netflix', categoryId: SYSTEM_CATEGORY.ocio });
    expect(again.ok && again.value.categoryId).toBe(SYSTEM_CATEGORY.ocio);
    const all = await repos.categoryRules.findAll();
    expect(all.ok && all.value.length).toBe(1);
  });

  it('borrar la categoría borra sus reglas (CASCADE) y addHits acumula', async () => {
    const repos = await freshRepos();
    const cat = await repos.categories.insert({ name: 'Mascotas', icon: null, color: '#22C55E', kind: 'expense', sortOrder: 99 });
    if (!cat.ok) throw new Error('categoría');
    const rule = await repos.categoryRules.insert({ pattern: 'kiwoko', categoryId: cat.value.id });
    if (!rule.ok) throw new Error('regla');
    await repos.categoryRules.addHits(new Map([[rule.value.id, 3]]));
    const withHits = await repos.categoryRules.findById(rule.value.id);
    expect(withHits.ok && withHits.value?.hits).toBe(3);

    await repos.categories.delete(cat.value.id);
    const gone = await repos.categoryRules.findById(rule.value.id);
    expect(gone.ok && gone.value).toBeNull();
  });
});

describe('EventsRepository en bloque', () => {
  it('updateCategoryMany solo cuenta las filas que cambian y deleteMany borra la selección', async () => {
    const repos = await freshRepos();
    const a = await repos.events.insert(gasto());
    const b = await repos.events.insert(gasto({ concept: 'Mercadona online', categoryId: SYSTEM_CATEGORY.alimentacion }));
    const c = await repos.events.insert(gasto({ concept: 'Otro' }));
    if (!a.ok || !b.ok || !c.ok) throw new Error('inserts');

    const updated = await repos.events.updateCategoryMany([a.value.id, b.value.id], SYSTEM_CATEGORY.alimentacion);
    expect(updated.ok && updated.value.updated).toBe(1);
    const readA = await repos.events.findById(a.value.id);
    expect(readA.ok && readA.value?.categoryId).toBe(SYSTEM_CATEGORY.alimentacion);

    const deleted = await repos.events.deleteMany([a.value.id, c.value.id]);
    expect(deleted.ok && deleted.value.deleted).toBe(2);
    const count = await repos.events.countAll();
    expect(count.ok && count.value).toBe(1);
  });

  it('recentConcepts agrupa sin distinguir mayúsculas y devuelve la categoría del último uso', async () => {
    const repos = await freshRepos();
    await repos.events.insert(gasto({ date: isoDate(2026, 9, 1), concept: 'farmacia garcía', categoryId: SYSTEM_CATEGORY.otros }));
    await repos.events.insert(gasto({ date: isoDate(2026, 9, 5), concept: 'Farmacia García', categoryId: SYSTEM_CATEGORY.salud }));
    await repos.events.insert(gasto({ date: isoDate(2026, 9, 3), concept: 'Netflix', categoryId: SYSTEM_CATEGORY.ocio }));

    const recent = await repos.events.recentConcepts(10);
    expect(recent.ok && recent.value.map((c) => [c.concept, c.categoryId, c.uses])).toEqual([
      ['Farmacia García', SYSTEM_CATEGORY.salud, 2],
      ['Netflix', SYSTEM_CATEGORY.ocio, 1],
    ]);
  });

  it('findCategorizable devuelve los sin categoría o con la categoría por defecto', async () => {
    const repos = await freshRepos();
    await repos.events.insert(gasto({ concept: 'A', categoryId: null }));
    await repos.events.insert(gasto({ concept: 'B', categoryId: SYSTEM_CATEGORY.otros }));
    await repos.events.insert(gasto({ concept: 'C', categoryId: SYSTEM_CATEGORY.alimentacion }));
    await repos.events.insert(gasto({ concept: 'D', type: 'saving', nature: null, categoryId: null, meta: { type: 'saving' } }));

    const found = await repos.events.findCategorizable([SYSTEM_CATEGORY.otros]);
    expect(found.ok && found.value.map((e) => e.concept).sort()).toEqual(['A', 'B']);
  });
});
