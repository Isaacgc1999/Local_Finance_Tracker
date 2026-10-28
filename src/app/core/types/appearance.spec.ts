import {
  DEFAULT_APPEARANCE,
  accentHover,
  contrastRatio,
  mixHex,
  normalizeHex,
  onAccent,
  parseAppearance,
} from './appearance';

describe('parseAppearance', () => {
  it('devuelve el valor por defecto sin nada guardado o con basura', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('no es json')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('42')).toEqual(DEFAULT_APPEARANCE);
  });

  it('conserva los campos válidos y descarta los raros uno a uno', () => {
    expect(
      parseAppearance(JSON.stringify({ mode: 'claro', style: 'cozy', accent: '#EC4899' })),
    ).toEqual({
      mode: 'claro',
      style: 'cozy',
      accent: '#ec4899',
    });
    expect(
      parseAppearance(JSON.stringify({ mode: 'neón', style: 'gamer', accent: 'rojo' })),
    ).toEqual({
      mode: 'oscuro',
      style: 'gamer',
      accent: null,
    });
  });
});

describe('colores', () => {
  it('normaliza solo #rrggbb', () => {
    expect(normalizeHex(' #6E56F8 ')).toBe('#6e56f8');
    expect(normalizeHex('#fff')).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });

  it('calcula el contraste WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('elige texto blanco sobre acentos oscuros y negro sobre claros', () => {
    expect(onAccent('#6e56f8')).toBe('#ffffff');
    expect(onAccent('#00e5ff')).toBe('#0a0b0d');
    expect(onAccent('#f59e0b')).toBe('#0a0b0d');
  });

  it('aclara el hover en oscuro y lo oscurece en claro', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    const base = '#3b82f6';
    expect(contrastRatio(accentHover(base, 'oscuro'), '#000000')).toBeGreaterThan(
      contrastRatio(base, '#000000'),
    );
    expect(contrastRatio(accentHover(base, 'claro'), '#ffffff')).toBeGreaterThan(
      contrastRatio(base, '#ffffff'),
    );
  });
});
