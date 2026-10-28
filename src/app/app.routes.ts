import { Routes } from '@angular/router';

import type { NavId } from './layout/navegacion';

/** Datos de ruta que lee el Shell: destino activo de la navegación y si muestra el FAB. */
export interface RutaData {
  readonly nav: NavId;
  readonly fab: boolean;
}

const data = (nav: NavId, fab: boolean): RutaData => ({ nav, fab });

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Fintrack',
    data: data('dashboard', true),
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'events',
    title: 'Movimientos · Fintrack',
    data: data('movimientos', true),
    loadComponent: () => import('./features/events/event-list/event-list').then((m) => m.EventList),
  },
  {
    path: 'events/new',
    title: 'Nuevo evento · Fintrack',
    data: data('movimientos', false),
    loadComponent: () => import('./features/events/event-form/event-form').then((m) => m.EventForm),
  },
  {
    path: 'events/import',
    title: 'Importar extracto · Fintrack',
    data: data('movimientos', false),
    loadComponent: () => import('./features/events/importar/importar').then((m) => m.Importar),
  },
  {
    path: 'events/:id',
    title: 'Editar evento · Fintrack',
    data: data('movimientos', false),
    loadComponent: () => import('./features/events/event-form/event-form').then((m) => m.EventForm),
  },
  {
    path: 'accounts',
    title: 'Cuentas · Fintrack',
    data: data('cuentas', true),
    loadComponent: () => import('./features/accounts/accounts').then((m) => m.Accounts),
  },
  {
    path: 'accounts/:id',
    title: 'Conciliar cuenta · Fintrack',
    data: data('cuentas', false),
    loadComponent: () => import('./features/accounts/conciliacion/conciliacion').then((m) => m.Conciliacion),
  },
  {
    path: 'goals',
    title: 'Objetivos · Fintrack',
    data: data('objetivos', false),
    loadComponent: () => import('./features/goals/goals').then((m) => m.Goals),
  },
  {
    path: 'savings',
    title: 'Ahorros · Fintrack',
    data: data('ahorros', false),
    loadComponent: () => import('./features/savings/savings').then((m) => m.Savings),
  },
  {
    path: 'investments',
    title: 'Inversiones · Fintrack',
    data: data('inversiones', false),
    loadComponent: () => import('./features/investments/investments').then((m) => m.Investments),
  },
  {
    path: 'analytics',
    title: 'Analítica · Fintrack',
    data: data('analitica', false),
    loadComponent: () => import('./features/analytics/analytics').then((m) => m.Analytics),
  },
  {
    path: 'ai',
    title: 'Análisis IA · Fintrack',
    data: data('ia', false),
    loadComponent: () => import('./features/ai/ai').then((m) => m.Ai),
  },
  {
    path: 'settings',
    title: 'Ajustes · Fintrack',
    data: data('ajustes', false),
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
  { path: '**', redirectTo: 'dashboard' },
];
