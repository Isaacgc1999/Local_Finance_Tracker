import type { CategoryRule } from '../../core/types/category-rule';
import { compileRules, matchRule, normalizeText, proposePattern, suggestCategory } from './category-rules';

const rule = (pattern: string, categoryId: string, sortOrder = 0): CategoryRule => ({
  id: `r-${pattern}`,
  pattern,
  categoryId,
  sortOrder,
  hits: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('normalizeText', () => {
  it('quita acentos, mayúsculas y puntuación', () => {
    expect(normalizeText('  Compra en MERCADONA, S.A. — Móstoles ')).toBe('compra en mercadona s a mostoles');
  });
});

describe('matchRule', () => {
  it('encuentra el patrón dentro del concepto sin distinguir mayúsculas ni acentos', () => {
    const compiled = compileRules([rule('mercadona', 'cat-alimentacion')]);
    expect(matchRule(compiled, 'PAGO TARJETA MERCADONA 1234')?.categoryId).toBe('cat-alimentacion');
    expect(matchRule(compiled, 'Farmacia')).toBeNull();
  });

  it('a igual orden gana el patrón más largo', () => {
    const compiled = compileRules([rule('amazon', 'cat-otros'), rule('amazon prime', 'cat-ocio')]);
    expect(matchRule(compiled, 'Amazon Prime Video')?.categoryId).toBe('cat-ocio');
    expect(matchRule(compiled, 'Amazon EU')?.categoryId).toBe('cat-otros');
  });

  it('respeta sortOrder por encima de la longitud', () => {
    const compiled = compileRules([rule('amazon', 'cat-otros', 0), rule('amazon prime', 'cat-ocio', 1)]);
    expect(matchRule(compiled, 'Amazon Prime Video')?.categoryId).toBe('cat-otros');
  });

  it('ignora reglas cuyo patrón se queda vacío y conceptos vacíos', () => {
    const compiled = compileRules([rule('--', 'cat-otros')]);
    expect(compiled).toHaveLength(0);
    expect(matchRule(compileRules([rule('mercadona', 'x')]), '   ')).toBeNull();
  });
});

describe('suggestCategory', () => {
  const compiled = compileRules([rule('netflix', 'cat-ocio')]);
  const history = [
    { concept: 'Farmacia García', categoryId: 'cat-salud' },
    { concept: 'Farmacia García', categoryId: 'cat-otros' },
    { concept: 'Sin categoría', categoryId: null },
  ];

  it('la regla manda sobre el historial', () => {
    expect(suggestCategory(compiled, 'NETFLIX.COM', history)).toEqual({ categoryId: 'cat-ocio', source: 'rule', rule: compiled[0]?.rule });
  });

  it('sin regla, usa la categoría del movimiento más reciente con el mismo concepto', () => {
    expect(suggestCategory(compiled, 'farmacia garcia', history)).toEqual({ categoryId: 'cat-salud', source: 'history', rule: null });
  });

  it('sin regla ni historial no sugiere nada', () => {
    expect(suggestCategory(compiled, 'Sin categoría', history)).toBeNull();
    expect(suggestCategory(compiled, 'Otra cosa', history)).toBeNull();
  });
});

describe('proposePattern', () => {
  it('con un solo concepto distinto propone el concepto entero', () => {
    expect(proposePattern(['Netflix', 'netflix', ' Netflix '])).toBe('Netflix');
  });

  it('con varios propone el prefijo común de palabras', () => {
    expect(proposePattern(['PAGO TARJETA MERCADONA 0012', 'Pago tarjeta Mercadona 0345'])).toBe('PAGO TARJETA MERCADONA');
  });

  it('sin prefijo común devuelve vacío', () => {
    expect(proposePattern(['Netflix', 'Spotify'])).toBe('');
    expect(proposePattern([])).toBe('');
  });
});
