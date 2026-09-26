import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';

import { formatAmount, parseMoney } from '../../../core/format/money-format';
import { todayIso } from '../../../core/types/iso-date';
import { type Money, money } from '../../../core/types/money';
import { FREQUENCY_LABEL, FREQUENCIES, type Frequency, type Recurrence } from '../../../core/types/recurrence';
import { SettingsFacade } from '../../../facades/settings.facade';
import { Modal } from '../../../shared/components/modal/modal';
import { SegmentedControl, type SegmentOption } from '../../../shared/components/segmented-control/segmented-control';

const FRECUENCIAS: readonly SegmentOption<Frequency>[] = FREQUENCIES.map((value) => ({
  value,
  label: FREQUENCY_LABEL[value],
}));

/**
 * Alta y edición de un ingreso recurrente. Igual que el de categorías, el
 * handoff solo dibuja el enlace «+ Añadir ingreso recurrente», así que el
 * formulario vive en el modal de 480px de la hoja de componentes y reutiliza
 * los mismos campos que el bloque de recurrencia del formulario de evento.
 */
@Component({
  selector: 'ft-modal-ingreso-recurrente',
  imports: [Modal, SegmentedControl],
  templateUrl: './modal-ingreso-recurrente.html',
  styleUrl: './modal-ingreso-recurrente.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalIngresoRecurrente {
  readonly abierto = model<boolean>(false);
  readonly ingreso = input<Recurrence | null>(null);
  readonly guardado = output<void>();

  private readonly facade = inject(SettingsFacade);

  protected readonly frecuencias = FRECUENCIAS;

  protected readonly concepto = signal('');
  protected readonly importeTexto = signal('');
  protected readonly frecuencia = signal<Frequency>('monthly');
  protected readonly diaDelMes = signal(1);
  protected readonly activo = signal(true);
  protected readonly guardando = signal(false);
  protected readonly errorConcepto = signal('');
  protected readonly errorImporte = signal('');
  protected readonly confirmandoBorrado = signal(false);

  protected readonly edicion = computed(() => this.ingreso() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar ingreso recurrente' : 'Nuevo ingreso recurrente'));
  protected readonly pideDia = computed(() => this.frecuencia() !== 'weekly');

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const actual = this.ingreso();
      this.concepto.set(actual?.concept ?? '');
      this.importeTexto.set(actual ? formatAmount(actual.amountCents, 'never') : '');
      this.frecuencia.set(actual?.frequency ?? 'monthly');
      this.diaDelMes.set(actual?.dayOfMonth ?? 1);
      this.activo.set(actual?.active ?? true);
      this.errorConcepto.set('');
      this.errorImporte.set('');
      this.confirmandoBorrado.set(false);
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected onDia(value: string): void {
    const n = Number(value);
    if (Number.isFinite(n)) this.diaDelMes.set(Math.min(31, Math.max(1, Math.trunc(n))));
  }

  protected async guardar(): Promise<void> {
    const concepto = this.concepto().trim();
    if (!concepto) {
      this.errorConcepto.set('El concepto es obligatorio.');
      return;
    }
    const importe = this.leerImporte();
    if (importe === null) return;

    this.guardando.set(true);
    const actual = this.ingreso();
    const dia = this.pideDia() ? this.diaDelMes() : null;
    const result = actual
      ? await this.facade.updateIncome(actual.id, {
          concept: concepto,
          amountCents: importe,
          frequency: this.frecuencia(),
          dayOfMonth: dia,
          active: this.activo(),
        })
      : await this.facade.createIncome({
          type: 'income',
          amountCents: importe,
          categoryId: null,
          concept: concepto,
          frequency: this.frecuencia(),
          interval: 1,
          dayOfMonth: dia,
          weekday: this.frecuencia() === 'weekly' ? 1 : null,
          startDate: todayIso(),
          endDate: null,
          active: this.activo(),
          paymentMethod: null,
          accountId: null,
          meta: null,
        });
    this.guardando.set(false);
    if (result.ok) {
      this.abierto.set(false);
      this.guardado.emit();
    }
  }

  protected async borrar(): Promise<void> {
    const actual = this.ingreso();
    if (!actual) return;
    if (!this.confirmandoBorrado()) {
      this.confirmandoBorrado.set(true);
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.deleteIncome(actual.id);
    this.guardando.set(false);
    if (result.ok) {
      this.abierto.set(false);
      this.guardado.emit();
    }
  }

  private leerImporte(): Money | null {
    const parsed = parseMoney(this.importeTexto());
    if (!parsed.ok) {
      this.errorImporte.set('Importe no válido.');
      return null;
    }
    if (parsed.value <= 0) {
      this.errorImporte.set('El importe tiene que ser mayor que cero.');
      return null;
    }
    return money(parsed.value);
  }
}
