import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';

import { formatMoney, parseMoney } from '../../core/format/money-format';
import { type IsoDate, isIsoDate, todayIso } from '../../core/types/iso-date';
import { type Money, money } from '../../core/types/money';
import { Modal } from '../../shared/components/modal/modal';
import { SegmentedControl, type SegmentOption } from '../../shared/components/segmented-control/segmented-control';

export interface Aportacion {
  readonly amount: Money;
  readonly date: IsoDate;
  readonly note: string | null;
}

type Sentido = 'in' | 'out';

const SENTIDOS: readonly SegmentOption<Sentido>[] = [
  { value: 'in', label: 'Aportar' },
  { value: 'out', label: 'Retirar' },
];

/** Aportar o retirar dinero de una hucha (de un objetivo o de Ahorros). Devuelve el importe con signo. */
@Component({
  selector: 'ft-modal-aportar',
  imports: [Modal, SegmentedControl],
  template: `
    <ft-modal [(open)]="abierto" [titulo]="titulo()" [subtitulo]="subtitulo()" (cerrar)="abierto.set(false)">
      <ft-segmented-control layout="stretch" tone="subtle" label="Aportar o retirar" [options]="sentidos" [value]="sentido()" (valueChange)="$event && sentido.set($event)" />
      <div class="fila-2">
        <label class="ft-field">
          <span class="ft-field__label">Importe</span>
          <input class="ft-input num" inputmode="decimal" placeholder="0,00" [value]="texto()" (input)="texto.set($any($event.target).value)" />
        </label>
        <label class="ft-field">
          <span class="ft-field__label">Fecha</span>
          <input class="ft-input num" type="date" [value]="fecha()" (input)="fecha.set($any($event.target).value)" />
        </label>
      </div>
      <label class="ft-field">
        <span class="ft-field__label">Nota<span class="ft-field__label-hint"> · opcional</span></span>
        <input class="ft-input" maxlength="120" [placeholder]="sentido() === 'in' ? 'Paga extra, sobrante del mes…' : 'Reparación del coche…'" [value]="nota()" (input)="nota.set($any($event.target).value)" />
      </label>
      @if (sugerido()) {
        <button type="button" class="ft-link sugerido" (click)="texto.set(sugeridoTexto())">Usar el aporte del plan: {{ sugeridoLabel() }}</button>
      }
      @if (error()) {
        <p class="confirmar">{{ error() }}</p>
      }
      <div acciones class="acciones">
        <button type="button" class="ft-btn ft-btn--secondary" (click)="abierto.set(false)">Cancelar</button>
        <button type="button" class="ft-btn ft-btn--primary" (click)="confirmar()">{{ sentido() === 'in' ? 'Aportar' : 'Retirar' }}</button>
      </div>
    </ft-modal>
  `,
  styleUrl: './goals-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalAportar {
  readonly abierto = model<boolean>(false);
  readonly nombre = input<string>('');
  /** Aporte que propone el plan del objetivo (botón «Usar el aporte del plan»). */
  readonly sugerido = input<Money | null>(null);
  readonly guardar = output<Aportacion>();

  protected readonly sentidos = SENTIDOS;
  protected readonly sentido = signal<Sentido>('in');
  protected readonly texto = signal('');
  protected readonly fecha = signal<string>(todayIso());
  protected readonly nota = signal('');
  protected readonly error = signal('');

  protected readonly titulo = computed(() => (this.nombre() ? `Hucha · ${this.nombre()}` : 'Aportar'));
  protected readonly subtitulo = computed(() => 'Apunta lo que metes o sacas. Si lo apuntas como movimiento de ahorro, no hace falta repetirlo aquí.');
  protected readonly sugeridoLabel = computed(() => formatMoney(this.sugerido() ?? (0 as Money)));
  protected readonly sugeridoTexto = computed(() => formatMoney(this.sugerido() ?? (0 as Money), { symbol: false }));

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      this.sentido.set('in');
      this.texto.set('');
      this.fecha.set(todayIso());
      this.nota.set('');
      this.error.set('');
    });
  }

  protected confirmar(): void {
    const parsed = parseMoney(this.texto());
    if (!parsed.ok || parsed.value === 0) return this.error.set('Escribe un importe.');
    const fecha = this.fecha();
    if (!isIsoDate(fecha)) return this.error.set('Fecha no válida.');
    const abs = Math.abs(parsed.value);
    this.guardar.emit({ amount: money(this.sentido() === 'in' ? abs : -abs), date: fecha, note: this.nota().trim() || null });
    this.abierto.set(false);
  }
}
