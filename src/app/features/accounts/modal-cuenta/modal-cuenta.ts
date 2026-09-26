import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';

import type { ValidationError } from '../../../core/errors/app-error';
import { formatAmount, parseMoney } from '../../../core/format/money-format';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_COLOR,
  ACCOUNT_KIND_LABEL,
  type Account,
  type AccountKind,
} from '../../../core/types/account';
import { type IsoDate, isIsoDate, todayIso } from '../../../core/types/iso-date';
import { money } from '../../../core/types/money';
import { ACCOUNT_NAME_MAX } from '../../../domain/accounts/account.service';
import { AccountsFacade } from '../../../facades/accounts.facade';
import { Modal } from '../../../shared/components/modal/modal';
import { SegmentedControl, type SegmentOption } from '../../../shared/components/segmented-control/segmented-control';
import { CATEGORY_COLORS } from '../../settings/lista-categorias/modal-categoria';

const TIPOS: readonly SegmentOption<AccountKind>[] = ACCOUNT_KINDS.map((value) => ({
  value,
  label: value === 'bank' ? 'Banco' : ACCOUNT_KIND_LABEL[value],
}));

/**
 * Alta y edición de una cuenta en el modal de 480px, como categorías e
 * ingresos recurrentes. Al editar se puede archivar (la cuenta desaparece de
 * los formularios pero su historia sigue sumando) o borrar si está vacía.
 */
@Component({
  selector: 'ft-modal-cuenta',
  imports: [Modal, SegmentedControl],
  templateUrl: './modal-cuenta.html',
  styleUrl: './modal-cuenta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalCuenta {
  readonly abierto = model<boolean>(false);
  readonly cuenta = input<Account | null>(null);

  private readonly facade = inject(AccountsFacade);

  protected readonly tipos = TIPOS;
  protected readonly colores = CATEGORY_COLORS;
  protected readonly nombreMax = ACCOUNT_NAME_MAX;

  protected readonly nombre = signal('');
  protected readonly tipo = signal<AccountKind>('bank');
  protected readonly color = signal<string>(ACCOUNT_KIND_COLOR.bank);
  protected readonly saldoTexto = signal('');
  protected readonly fecha = signal<string>(todayIso());
  protected readonly guardando = signal(false);
  protected readonly errores = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly confirmandoBorrado = signal(false);

  protected readonly edicion = computed(() => this.cuenta() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar cuenta' : 'Nueva cuenta'));
  protected readonly archivada = computed(() => this.cuenta()?.archived ?? false);
  /** Mientras el usuario no elige color, el color sigue al tipo. */
  private colorElegido = false;

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const actual = this.cuenta();
      this.nombre.set(actual?.name ?? '');
      this.tipo.set(actual?.kind ?? 'bank');
      this.color.set(actual?.color ?? ACCOUNT_KIND_COLOR.bank);
      this.saldoTexto.set(actual ? formatAmount(actual.openingBalanceCents) : '');
      this.fecha.set(actual?.openingDate ?? todayIso());
      this.errores.set(new Map());
      this.confirmandoBorrado.set(false);
      this.colorElegido = actual !== null;
    });
  }

  protected error(campo: string): string {
    return this.errores().get(campo) ?? '';
  }

  protected setTipo(tipo: AccountKind): void {
    this.tipo.set(tipo);
    if (!this.colorElegido) this.color.set(ACCOUNT_KIND_COLOR[tipo]);
  }

  protected setColor(color: string): void {
    this.colorElegido = true;
    this.color.set(color);
  }

  protected limpiar(campo: string): void {
    if (!this.errores().has(campo)) return;
    const next = new Map(this.errores());
    next.delete(campo);
    this.errores.set(next);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected async guardar(): Promise<void> {
    const texto = this.saldoTexto().trim();
    const saldo = texto === '' ? { ok: true as const, value: money(0) } : parseMoney(texto);
    if (!saldo.ok) {
      this.errores.set(new Map([['openingBalance', 'Importe no válido.']]));
      return;
    }
    const fecha = this.fecha();
    if (!isIsoDate(fecha)) {
      this.errores.set(new Map([['openingDate', 'Fecha no válida.']]));
      return;
    }

    this.guardando.set(true);
    const actual = this.cuenta();
    const datos = {
      name: this.nombre(),
      kind: this.tipo(),
      color: this.color(),
      openingBalanceCents: saldo.value,
      openingDate: fecha as IsoDate,
    };
    const result = actual
      ? await this.facade.updateAccount(actual, datos)
      : await this.facade.createAccount({ ...datos, archived: false });
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
    else if (Array.isArray(result.error)) this.mostrar(result.error);
  }

  protected async alternarArchivo(): Promise<void> {
    const actual = this.cuenta();
    if (!actual) return;
    this.guardando.set(true);
    const result = await this.facade.setArchived(actual, !actual.archived);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
  }

  protected async borrar(): Promise<void> {
    const actual = this.cuenta();
    if (!actual) return;
    if (!this.confirmandoBorrado()) {
      this.confirmandoBorrado.set(true);
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.deleteAccount(actual.id);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
    else if (Array.isArray(result.error)) this.mostrar(result.error);
  }

  private mostrar(errors: readonly ValidationError[]): void {
    this.errores.set(new Map(errors.map((e) => [e.field, e.message])));
  }
}
