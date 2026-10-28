import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { formatDayMonth } from '../../core/format/date-format';
import { type DateRange, type IsoDate, todayIso } from '../../core/types/iso-date';
import { DbConnection } from '../../data/db/db-connection';
import { FinancialCalendar, isPayroll } from '../../domain/period/financial-month';
import { AppStatusFacade } from '../../facades/app-status.facade';
import { PreferencesService } from './preferences.service';

/**
 * El calendario de meses financieros de la app como signal: se rehace al
 * cambiar el ajuste del mes o al entrar una nómina nueva. Dashboard,
 * movimientos y avisos preguntan aquí qué fechas forman «el mes».
 */
@Injectable({ providedIn: 'root' })
export class FinancialMonthService {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly prefs = inject(PreferencesService);

  private readonly paydaysSig = signal<readonly IsoDate[]>([]);

  readonly paydays = this.paydaysSig.asReadonly();

  readonly calendar = computed(() => {
    const s = this.prefs.settings();
    return new FinancialCalendar({ mode: s.monthMode, startDay: s.monthStartDay }, this.paydaysSig());
  });

  readonly isPayday = computed(() => !this.calendar().isCalendar);

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.reload());
    });
  }

  rangeOf(label: IsoDate): DateRange {
    return this.calendar().rangeOf(label);
  }

  labelOf(date: IsoDate): IsoDate {
    return this.calendar().labelOf(date);
  }

  /** Mes financiero en curso (el 28 de octubre, con nómina ese día, ya es «Noviembre»). */
  current(today: IsoDate = todayIso()): IsoDate {
    return this.calendar().labelOf(today);
  }

  /** «28 oct – 27 nov», o cadena vacía si el mes es el natural. */
  rangeLabel(label: IsoDate): string {
    const cal = this.calendar();
    if (cal.isNaturalMonth(label)) return '';
    const r = cal.rangeOf(label);
    return `${formatDayMonth(r.from)} – ${formatDayMonth(r.to)}`;
  }

  private async reload(): Promise<void> {
    const repos = this.db.repos();
    if (!repos) return;
    const incomes = await repos.events.incomeHeads();
    if (!incomes.ok) return;
    const dates = incomes.value.filter(isPayroll).map((i) => i.date);
    const prev = this.paydaysSig();
    if (prev.length === dates.length && prev.every((d, i) => d === dates[i])) return;
    this.paydaysSig.set(dates);
  }
}
