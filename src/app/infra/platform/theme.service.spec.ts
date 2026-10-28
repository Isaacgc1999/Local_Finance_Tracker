import { TestBed } from '@angular/core/testing';

import { APPEARANCE_STORAGE_KEY } from '../../core/types/appearance';
import { FT_COLORS } from '../../shared/charts/palette';
import { ThemeService, applyAppearance, resolveMode } from './theme.service';

describe('resolveMode', () => {
  it('sigue al sistema solo en modo «Sistema»', () => {
    expect(resolveMode('sistema', true)).toBe('oscuro');
    expect(resolveMode('sistema', false)).toBe('claro');
    expect(resolveMode('claro', true)).toBe('claro');
  });
});

describe('applyAppearance', () => {
  afterEach(() => {
    const root = document.documentElement;
    delete root.dataset['modo'];
    delete root.dataset['estilo'];
    root.removeAttribute('style');
  });

  it('marca <html> y fija el acento propio con su texto y hover', () => {
    applyAppearance({ mode: 'claro', style: 'gamer', accent: '#00e5ff' }, true);
    const root = document.documentElement;
    expect(root.dataset['modo']).toBe('claro');
    expect(root.dataset['estilo']).toBe('gamer');
    expect(root.style.getPropertyValue('--ft-accent')).toBe('#00e5ff');
    expect(root.style.getPropertyValue('--ft-on-accent')).toBe('#0a0b0d');
  });

  it('quita el acento en línea al volver al del estilo', () => {
    applyAppearance({ mode: 'oscuro', style: 'finance', accent: '#ef4444' }, true);
    applyAppearance({ mode: 'oscuro', style: 'finance', accent: null }, true);
    expect(document.documentElement.style.getPropertyValue('--ft-accent')).toBe('');
  });
});

describe('ThemeService', () => {
  beforeEach(() => localStorage.removeItem(APPEARANCE_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(APPEARANCE_STORAGE_KEY));

  it('guarda cada cambio y vuelve al valor por defecto con reset', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setStyle('cozy');
    theme.setAccent('#EC4899');
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toEqual({
      mode: 'oscuro',
      style: 'cozy',
      accent: '#ec4899',
    });
    theme.reset();
    expect(theme.appearance()).toEqual({ mode: 'oscuro', style: 'finance', accent: null });
  });

  it('publica el acento para los gráficos', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setAccent('#10b981');
    TestBed.tick();
    expect(FT_COLORS.accent).toBe('#10b981');
  });
});
