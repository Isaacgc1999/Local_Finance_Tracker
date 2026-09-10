import { TestBed } from '@angular/core/testing';

import { Icono } from './icono';

describe('Icono', () => {
  it('dibuja el icono pedido con las medidas del handoff', async () => {
    await TestBed.configureTestingModule({ imports: [Icono] }).compileComponents();
    const fixture = TestBed.createComponent(Icono);
    fixture.componentRef.setInput('name', 'dashboard');
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('stroke-width')).toBe('1.6');
    expect(svg.querySelectorAll('rect').length).toBe(4);
  });
});
