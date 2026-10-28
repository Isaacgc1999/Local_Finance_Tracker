/**
 * Destinos de la sidebar / tab bar. Los cinco del handoff (Sidebar.dc.html y
 * README «Layout responsive») más «Cuentas», que va junto a Movimientos, y
 * el bloque de patrimonio: Objetivos, Ahorros e Inversiones.
 */
export type NavId = 'dashboard' | 'movimientos' | 'cuentas' | 'objetivos' | 'ahorros' | 'inversiones' | 'analitica' | 'ia' | 'ajustes';

export interface NavItem {
  readonly id: NavId;
  /** Etiqueta de la sidebar (240px). */
  readonly label: string;
  /** Etiqueta de la tab bar móvil. */
  readonly tabLabel: string;
  readonly path: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', tabLabel: 'Inicio', path: '/dashboard' },
  { id: 'movimientos', label: 'Movimientos', tabLabel: 'Movim.', path: '/events' },
  { id: 'cuentas', label: 'Cuentas', tabLabel: 'Cuentas', path: '/accounts' },
  { id: 'objetivos', label: 'Objetivos', tabLabel: 'Objetivos', path: '/goals' },
  { id: 'ahorros', label: 'Ahorros', tabLabel: 'Ahorros', path: '/savings' },
  { id: 'inversiones', label: 'Inversiones', tabLabel: 'Invers.', path: '/investments' },
  { id: 'analitica', label: 'Analítica', tabLabel: 'Analítica', path: '/analytics' },
  { id: 'ia', label: 'Análisis IA', tabLabel: 'IA', path: '/ai' },
  { id: 'ajustes', label: 'Ajustes', tabLabel: 'Ajustes', path: '/settings' },
];
