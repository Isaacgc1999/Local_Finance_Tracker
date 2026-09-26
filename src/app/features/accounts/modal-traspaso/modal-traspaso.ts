import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';

import type { ValidationError } from '../../../core/errors/app-error';
import { formatAmount, parseMoney } from '../../../core/format/money-format';
import type { Transfer } from '../../../core/types/account';
import { type IsoDate, isIsoDate, todayIso } from '../../../core/types/iso-date';
import { money } from '../../../core/types/money';
import { AccountsFacade } from '../../../facades/accounts.facade';
import { Modal } from '../../../shared/components/modal/modal';

/**
 * Alta y edición de un traspaso entre dos cuentas propias. Resta de una y
 * suma en la otra el mismo día; no aparece en Movimientos ni en Analítica
 * porque no es ingreso ni gasto.
 */
@Component({
  selector: 'ft-modal-traspaso',
  imports: [Modal],
  templateUrl: './modal-traspaso.html',
  styleUrl: '../modal-cuenta/modal-cuenta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalTraspaso {
  readonly abierto = model<boolean>(false);
  readonly traspaso = input<Transfer | null>(null);

  private readonly facade = inject(AccountsFacade);

  protected readonly desde = signal('');
  protected readonly hacia = signal('');
  protected readonly importeTexto = signal('');
  protected readonly fecha = signal<string>(todayIso());
  protected readonly concepto = signal('');
  protected readonly guardando = signal(false);
  protected readonly errores = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly confirmandoBorrado = signal(false);

  protected readonly edicion = computed(() => this.traspaso() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar traspaso' : 'Nuevo traspaso'));

  /** Cuentas activas y, al editar, también las del traspaso aunque estén archivadas. */
  protected readonly cuentas = computed(() => {
    const t = this.traspaso();
    const keep = new Set(t ? [t.fromAccountId, t.toAccountId] : []);
    return this.facade.accounts().filter((a) => !a.archived || keep.has(a.id));
  });

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const actual = this.traspaso();
      const [primera, segunda] = this.cuentas();
      this.desde.set(actual?.fromAccountId ?? primera?.id ?? '');
      this.hacia.set(actual?.toAccountId ?? segunda?.id ?? '');
      this.importeTexto.set(actual ? formatAmount(actual.amountCents, 'never') : '');
      this.fecha.set(actual?.date ?? todayIso());
      this.concepto.set(actual?.concept ?? '');
      this.errores.set(new Map());
      this.confirmandoBorrado.set(false);
    });
  }

  protected error(campo: string): string {
    return this.errores().get(campo) ?? '';
  }

  protected limpiar(campo: string): void {
    if (!this.errores().has(campo)) return;
    const next = new Map(this.errores());
    next.delete(campo);
    this.errores.set(next);
  }

  /** Cambia origen y destino de sitio. */
  protected invertir(): void {
    const d = this.desde();
    this.desde.set(this.hacia());
    this.hacia.set(d);
    this.limpiar('to');
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected async guardar(): Promise<void> {
    const importe = parseMoney(this.importeTexto());
    if (!importe.ok || importe.value <= 0) {
      this.errores.set(new Map([['amount', importe.ok ? 'El importe tiene que ser mayor que cero.' : 'Importe no válido.']]));
      return;
    }
    const fecha = this.fecha();
    if (!isIsoDate(fecha)) {
      this.errores.set(new Map([['date', 'Fecha no válida.']]));
      return;
    }
    const datos = {
      fromAccountId: this.desde(),
      toAccountId: this.hacia(),
      amountCents: money(importe.value),
      date: fecha as IsoDate,
      concept: this.concepto(),
    };
    this.guardando.set(true);
    const actual = this.traspaso();
    const result = actual ? await this.facade.updateTransfer(actual, datos) : await this.facade.createTransfer(datos);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
    else if (Array.isArray(result.error)) this.mostrar(result.error);
  }

  protected async borrar(): Promise<void> {
    const actual = this.traspaso();
    if (!actual) return;
    if (!this.confirmandoBorrado()) {
      this.confirmandoBorrado.set(true);
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.deleteTransfer(actual.id);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
  }

  private mostrar(errors: readonly ValidationError[]): void {
    this.errores.set(new Map(errors.map((e) => [e.field, e.message])));
  }
}
