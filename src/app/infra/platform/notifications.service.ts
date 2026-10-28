import { Injectable, effect, inject, untracked } from '@angular/core';

import { MESES, formatMonthYear } from '../../core/format/date-format';
import { formatMoney } from '../../core/format/money-format';
import { isTauri } from '../fs/db-location';
import { month, todayIso } from '../../core/types/iso-date';
import { DbConnection } from '../../data/db/db-connection';
import { outflowOf, totalsByType } from '../../domain/analytics/aggregation';
import { computeBudgetPace } from '../../domain/budget/budget.service';
import { type Alert, pendingAlerts } from '../../domain/notifications/alerts';
import { AppStatusFacade } from '../../facades/app-status.facade';
import { GoalsFacade } from '../../facades/goals.facade';
import { InvestmentsFacade } from '../../facades/investments.facade';
import { FinancialMonthService } from './financial-month.service';
import { PreferencesService } from './preferences.service';

/** Cada cuánto se revisa si hay algo que avisar mientras la app está abierta. */
const CHECK_EVERY_MS = 30 * 60 * 1000;
/** Margen tras arrancar para que objetivos e inversiones terminen de cargar. */
const FIRST_CHECK_DELAY_MS = 15 * 1000;

export type NotificationPermission = 'granted' | 'denied' | 'unsupported';

/**
 * Avisos del sistema (centro de notificaciones de Windows, macOS o Linux):
 * cargos de mañana, nómina recibida, presupuesto, objetivos, inversiones sin
 * actualizar y copia de seguridad. Cada aviso se manda una sola vez (tabla
 * `notification_log`). Al pulsarlo, Windows relanza la app y el plugin de
 * instancia única enfoca la ventana abierta.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly prefs = inject(PreferencesService);
  private readonly fm = inject(FinancialMonthService);
  private readonly goals = inject(GoalsFacade);
  private readonly investments = inject(InvestmentsFacade);

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor() {
    effect(() => {
      const ready = this.db.ready();
      const enabled = this.prefs.settings().notificationsEnabled;
      untracked(() => {
        if (ready && enabled && !this.status.demo()) this.schedule();
        else this.stop();
      });
    });
  }

  /** Pide permiso al sistema si hace falta. */
  async permission(): Promise<NotificationPermission> {
    if (isTauri()) {
      const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
      if (await isPermissionGranted()) return 'granted';
      return (await requestPermission()) === 'granted' ? 'granted' : 'denied';
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return (await Notification.requestPermission()) === 'granted' ? 'granted' : 'denied';
  }

  /** Aviso de prueba desde Ajustes. */
  async test(): Promise<NotificationPermission> {
    const p = await this.permission();
    if (p === 'granted') await this.send({ key: 'test', title: 'Fintrack', body: 'Los avisos funcionan. Pulsa aquí para volver a la app.' });
    return p;
  }

  /** Revisa ahora y manda lo que toque y no se haya mandado ya. */
  async check(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const alerts = await this.collect();
      if (alerts.length === 0) return;
      const repos = this.db.repos();
      if (!repos) return;
      const sent = await repos.notificationLog.sent(alerts.map((a) => a.key));
      if (!sent.ok) return;
      const fresh = alerts.filter((a) => !sent.value.has(a.key));
      if (fresh.length === 0 || (await this.permission()) !== 'granted') return;
      for (const a of fresh) await this.send(a);
      await repos.notificationLog.mark(fresh.map((a) => a.key));
    } finally {
      this.running = false;
    }
  }

  private schedule(): void {
    if (this.timer) return;
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS);
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async collect(): Promise<readonly Alert[]> {
    const repos = this.db.repos();
    if (!repos) return [];
    const today = todayIso();
    const label = this.fm.current(today);
    const range = this.fm.rangeOf(label);
    const [recurrences, events, budgets] = await Promise.all([repos.recurrences.findAll(), repos.events.findInRange(range), repos.budgets.findAll()]);
    if (!recurrences.ok || !events.ok || !budgets.ok) return [];

    const target = budgets.value.find((b) => b.scope === 'total')?.amountCents ?? null;
    const totals = totalsByType(events.value);
    const pace = target ? computeBudgetPace({ outflow: outflowOf(totals), income: totals.income, budgetTarget: target, monthStart: label, today, period: range }) : null;

    return pendingAlerts({
      today,
      format: (m) => formatMoney(m),
      recurrences: recurrences.value,
      paydayMonth: this.fm.isPayday() ? { label, from: range.from, name: (MESES[month(label) - 1] ?? formatMonthYear(label)).toLowerCase() } : null,
      budget: target && pace ? { label, outflow: outflowOf(totals), target, projectedClose: pace.projectedClose } : null,
      goals: this.goals.views().map((v) => ({
        id: v.goal.id,
        name: v.goal.name,
        targetDate: v.goal.targetDate,
        status: v.goal.status,
        achieved: v.plan.health === 'achieved',
        remaining: v.plan.remaining,
      })),
      holdings: this.investments.portfolio().holdings.map((h) => ({ name: h.investment.name, lastUpdate: h.lastUpdate })),
      lastBackupAt: this.prefs.lastBackupAt(),
    });
  }

  private async send(alert: Alert): Promise<void> {
    if (isTauri()) {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title: alert.title, body: alert.body });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(alert.title, { body: alert.body, tag: alert.key });
      n.onclick = () => window.focus();
    }
  }
}
