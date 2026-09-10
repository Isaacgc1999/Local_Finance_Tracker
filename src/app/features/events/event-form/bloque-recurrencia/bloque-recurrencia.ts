import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { FREQUENCIES, FREQUENCY_LABEL, type Frequency } from '../../../../core/types/recurrence';
import type { EventFormControls } from '../../../../facades/event-form.facade';
import { SegmentedControl, type SegmentOption } from '../../../../shared/components/segmented-control/segmented-control';
import { Toggle } from '../../../../shared/components/toggle/toggle';

/**
 * Bloque «Recurrente» / «Aportación periódica» del handoff: cabecera con
 * toggle, y, cuando está activo (o siempre, en suscripciones y
 * domiciliaciones), segmented Semanal / Mensual / Anual + «Fecha de fin · opcional».
 */
@Component({
  selector: 'ft-bloque-recurrencia',
  imports: [ReactiveFormsModule, SegmentedControl, Toggle],
  templateUrl: './bloque-recurrencia.html',
  styleUrl: './bloque-recurrencia.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BloqueRecurrencia {
  readonly form = input.required<FormGroup<EventFormControls>>();
  readonly mode = input.required<'toggle' | 'always' | 'none'>();
  readonly label = input.required<string>();
  readonly hint = input<string>('');
  readonly expanded = input.required<boolean>();
  readonly resumen = input<string>('');
  readonly locked = input<boolean>(false);

  protected readonly frecuencias: readonly SegmentOption<Frequency>[] = FREQUENCIES.map((f) => ({
    value: f,
    label: FREQUENCY_LABEL[f],
  }));

  protected setFrequency(value: Frequency | null): void {
    if (value) this.form().controls.frequency.setValue(value);
  }
}
