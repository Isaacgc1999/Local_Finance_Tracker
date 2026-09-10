import { BreakpointService, breakpointFor } from './breakpoint.service';

describe('breakpointFor', () => {
  it('clasifica los tres anchos del handoff', () => {
    expect(breakpointFor(390)).toBe('mobile');
    expect(breakpointFor(640)).toBe('mobile');
    expect(breakpointFor(641)).toBe('tablet');
    expect(breakpointFor(768)).toBe('tablet');
    expect(breakpointFor(1023)).toBe('tablet');
    expect(breakpointFor(1024)).toBe('desktop');
    expect(breakpointFor(1440)).toBe('desktop');
  });
});

describe('BreakpointService', () => {
  it('deriva las señales booleanas del ancho', () => {
    const service = new BreakpointService();
    service.setWidth(390);
    expect(service.isMobile()).toBe(true);
    expect(service.isDesktop()).toBe(false);
    service.setWidth(1440);
    expect(service.current()).toBe('desktop');
  });

  it('usa el ancho del elemento cuando no hay ResizeObserver', () => {
    const service = new BreakpointService();
    const element = { clientWidth: 768 } as unknown as Element;
    const original = globalThis.ResizeObserver;
    // @ts-expect-error simulamos un entorno sin ResizeObserver
    globalThis.ResizeObserver = undefined;
    try {
      const stop = service.observe(element);
      expect(service.current()).toBe('tablet');
      stop();
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
