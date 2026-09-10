import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';

import { formatRange } from '../../../core/format/date-format';
import { PreferencesService } from '../../../infra/platform/preferences.service';
import {
  type DateRange,
  type IsoDate,
  addMonthsClamped,
  endOfMonth,
  endOfYear,
  isIsoDate,
  startOfMonth,
  startOfYear,
  todayIso,
} from '../../../core/types/iso-date';

interface Preset {
  readonly label: string;
  readonly range: () => DateRange;
}

/**
 * Control de rango de fechas del handoff («01/04/2026 — 30/09/2026 ▾»):
 * el diseño solo muestra el control cerrado; el popover (propio) ofrece
 * atajos y dos campos de fecha nativos.
 */
@Component({
  selector: 'ft-selector-rango',
  templateUrl: './selector-rango.html',
  styleUrl: './selector-rango.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'open.set(false)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectorRango {
  readonly value = model.required<DateRange>();
  readonly compact = input<boolean>(false);
  readonly open = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly prefs = inject(PreferencesService);

  protected readonly texto = computed(() => formatRange(this.value(), this.prefs.dateFormat(), this.compact()));

  protected readonly presets: readonly Preset[] = [
    { label: 'Este mes', range: () => ({ from: startOfMonth(todayIso()), to: endOfMonth(todayIso()) }) },
    { label: '3 meses', range: () => ({ from: addMonthsClamped(startOfMonth(todayIso()), -2, 1), to: endOfMonth(todayIso()) }) },
    { label: '6 meses', range: () => ({ from: addMonthsClamped(startOfMonth(todayIso()), -5, 1), to: endOfMonth(todayIso()) }) },
    { label: '12 meses', range: () => ({ from: addMonthsClamped(startOfMonth(todayIso()), -11, 1), to: endOfMonth(todayIso()) }) },
    { label: 'Este año', range: () => ({ from: startOfYear(todayIso()), to: endOfYear(todayIso()) }) },
  ];

  protected aplicarPreset(p: Preset): void {
    this.value.set(p.range());
    this.open.set(false);
  }

  protected setFrom(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (isIsoDate(v)) this.value.update((r) => ({ from: v as IsoDate, to: r.to < v ? (v as IsoDate) : r.to }));
  }

  protected setTo(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (isIsoDate(v)) this.value.update((r) => ({ from: r.from > v ? (v as IsoDate) : r.from, to: v as IsoDate }));
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
