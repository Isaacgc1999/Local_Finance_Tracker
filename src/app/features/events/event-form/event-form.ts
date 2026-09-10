import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { formatMoney } from '../../../core/format/money-format';
import { ASSET_CLASS_LABEL, type AssetClass, EVENT_TYPE_LABEL, NATURE_LABEL, type Nature } from '../../../core/types/event';
import { money } from '../../../core/types/money';
import { INCOME_SOURCES, PAYMENT_METHODS, PLATFORMS } from '../../../domain/events/event-form-strategy';
import { EventFormFacade } from '../../../facades/event-form.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { CabeceraPagina } from '../../../layout/cabecera-pagina/cabecera-pagina';
import { ChipCategoria } from '../../../shared/components/chip-categoria/chip-categoria';
import { InputImporte } from '../../../shared/components/input-importe/input-importe';
import { Modal } from '../../../shared/components/modal/modal';
import { SegmentedControl, type SegmentOption } from '../../../shared/components/segmented-control/segmented-control';
import { AdjuntarRecibo } from './adjuntar-recibo/adjuntar-recibo';
import { BarraAcciones } from './barra-acciones/barra-acciones';
import { BloqueRecurrencia } from './bloque-recurrencia/bloque-recurrencia';
import { SelectorTipo } from './selector-tipo/selector-tipo';

/**
 * Pantalla «Nuevo evento» / edición. Un único contenedor: la estrategia del
 * tipo (FORM_STRATEGIES) decide qué campos se muestran; el tipo cambia en el
 * segmented sin navegar. Ctrl/Cmd+Enter guarda.
 */
@Component({
  selector: 'ft-event-form',
  imports: [
    ReactiveFormsModule,
    CabeceraPagina,
    SelectorTipo,
    InputImporte,
    ChipCategoria,
    SegmentedControl,
    BloqueRecurrencia,
    AdjuntarRecibo,
    BarraAcciones,
    Modal,
  ],
  providers: [EventFormFacade],
  templateUrl: './event-form.html',
  styleUrl: './event-form.scss',
  host: {
    class: 'ft-page',
    '[class.movil]': 'bp.isMobile()',
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventForm {
  /** Parámetro de ruta `/events/:id` (edición). */
  readonly id = input<string>();
  /** Query `?amount=<céntimos>` desde la calculadora. */
  readonly amount = input<string>();

  protected readonly facade = inject(EventFormFacade);
  protected readonly bp = inject(BreakpointService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly importe = viewChild(InputImporte, { read: ElementRef });

  protected readonly form = this.facade.form;
  protected readonly confirmarBorrado = signal(false);

  protected readonly titulo = computed(() => (this.facade.mode() === 'edit' ? 'Editar evento' : 'Nuevo evento'));
  /** Ejemplo del campo Notas del handoff, con el símbolo de la moneda activa. */
  protected readonly notasEjemplo = computed(() => `Incluye ${formatMoney(money(1860))} de productos de limpieza del trimestre`);
  protected readonly tituloMovil = computed(() =>
    this.facade.mode() === 'edit' ? `Editar ${EVENT_TYPE_LABEL[this.facade.type()].toLowerCase()}` : this.facade.strategy().mobileTitle,
  );

  protected readonly naturalezas: readonly SegmentOption<Nature>[] = (['fixed', 'variable'] as const).map((n) => ({
    value: n,
    label: NATURE_LABEL[n],
  }));
  protected readonly clasesActivo: readonly { value: AssetClass; label: string }[] = (
    Object.keys(ASSET_CLASS_LABEL) as AssetClass[]
  ).map((k) => ({ value: k, label: ASSET_CLASS_LABEL[k] }));
  protected readonly metodosPago = PAYMENT_METHODS;
  protected readonly origenes = INCOME_SOURCES;
  protected readonly plataformas = PLATFORMS;

  constructor() {
    effect(() => {
      const id = this.id();
      const amount = this.amount();
      void this.facade.init({ id, presetAmountCents: amount });
    });
  }

  protected error(field: string): string {
    return this.facade.errors().get(field) ?? '';
  }

  /** Opciones del select incluyendo el valor actual si no está en la lista (datos antiguos). */
  protected opciones(base: readonly string[], control: 'paymentMethod' | 'source' | 'platform'): readonly string[] {
    const current = this.facade.value()[control];
    return current && !base.includes(current) ? [current, ...base] : base;
  }

  protected setNature(value: Nature | null): void {
    if (value) this.form.controls.nature.setValue(value);
  }

  protected setCategory(id: string): void {
    this.form.controls.categoryId.setValue(this.form.controls.categoryId.value === id ? null : id);
  }

  protected setAssetClass(value: AssetClass): void {
    this.form.controls.assetClass.setValue(this.form.controls.assetClass.value === value ? null : value);
  }

  protected async guardar(): Promise<void> {
    await this.facade.save();
    this.enfocarPrimerError();
  }

  protected async guardarYOtro(): Promise<void> {
    const result = await this.facade.saveAndAddAnother();
    if (result.ok) this.importe()?.nativeElement.querySelector('input')?.focus();
    else this.enfocarPrimerError();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.guardar();
    }
  }

  private enfocarPrimerError(): void {
    const invalid = this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]');
    invalid?.focus();
  }
}
