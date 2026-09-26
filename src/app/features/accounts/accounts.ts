import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { describeError } from '../../core/errors/app-error';
import { formatDayMonth } from '../../core/format/date-format';
import { formatMoney } from '../../core/format/money-format';
import { ACCOUNT_KIND_LABEL, type Account, type Transfer } from '../../core/types/account';
import { AccountsFacade, type AccountRow } from '../../facades/accounts.facade';
import { BreakpointService } from '../../infra/platform/breakpoint.service';
import { CabeceraPagina } from '../../layout/cabecera-pagina/cabecera-pagina';
import { EstadoVacio } from '../../shared/components/estado-vacio/estado-vacio';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { ModalCuenta } from './modal-cuenta/modal-cuenta';
import { ModalTraspaso } from './modal-traspaso/modal-traspaso';

interface TarjetaCuenta {
  readonly row: AccountRow;
  readonly tipo: string;
  readonly saldo: string;
  readonly conciliada: string;
}

interface FilaTraspaso {
  readonly transfer: Transfer;
  readonly ruta: string;
  readonly detalle: string;
  readonly importe: string;
}

/**
 * Pantalla «Cuentas»: total y saldo de hoy de cada cuenta, traspasos
 * recientes y acceso a la conciliación. No está en el handoff; reutiliza la
 * anatomía de las tarjetas y listas de Ajustes y del dashboard.
 */
@Component({
  selector: 'ft-accounts',
  imports: [CabeceraPagina, TarjetaError, EstadoVacio, Skeleton, ModalCuenta, ModalTraspaso],
  templateUrl: './accounts.html',
  styleUrl: './accounts.scss',
  host: { class: 'ft-page', '[class.movil]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Accounts {
  protected readonly facade = inject(AccountsFacade);
  protected readonly bp = inject(BreakpointService);
  private readonly router = inject(Router);

  protected readonly modalCuenta = signal(false);
  protected readonly cuentaEnEdicion = signal<Account | null>(null);
  protected readonly modalTraspaso = signal(false);
  protected readonly traspasoEnEdicion = signal<Transfer | null>(null);

  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  protected readonly total = computed(() => formatMoney(this.facade.total()));

  protected readonly resumen = computed(() => {
    const n = this.facade.activeRows().length;
    return n === 1 ? '1 cuenta activa' : `${n} cuentas activas`;
  });

  /** «3 movimientos sin cuenta no suman en ningún saldo.» */
  protected readonly avisoSinCuenta = computed(() => {
    const n = this.facade.unassignedEvents();
    if (n === 0) return '';
    return n === 1
      ? '1 movimiento no tiene cuenta y no suma en ningún saldo. Asígnale una desde su ficha.'
      : `${n} movimientos no tienen cuenta y no suman en ningún saldo. Asígnales una desde su ficha.`;
  });

  protected readonly activas = computed(() => this.facade.activeRows().map((r) => this.tarjeta(r)));
  protected readonly archivadas = computed(() => this.facade.archivedRows().map((r) => this.tarjeta(r)));

  protected readonly puedeTraspasar = computed(() => this.facade.activeAccounts().length >= 2);

  protected readonly traspasos = computed<readonly FilaTraspaso[]>(() => {
    const cuentas = this.facade.accountById();
    const nombre = (id: string) => cuentas.get(id)?.name ?? 'Cuenta borrada';
    return this.facade.transfers().map((t) => ({
      transfer: t,
      ruta: `${nombre(t.fromAccountId)} → ${nombre(t.toAccountId)}`,
      detalle: [formatDayMonth(t.date), t.concept].filter(Boolean).join(' · '),
      importe: formatMoney(t.amountCents, { sign: 'never' }),
    }));
  });

  protected nuevaCuenta(): void {
    this.cuentaEnEdicion.set(null);
    this.modalCuenta.set(true);
  }

  protected editarCuenta(account: Account): void {
    this.cuentaEnEdicion.set(account);
    this.modalCuenta.set(true);
  }

  protected nuevoTraspaso(): void {
    this.traspasoEnEdicion.set(null);
    this.modalTraspaso.set(true);
  }

  protected editarTraspaso(transfer: Transfer): void {
    this.traspasoEnEdicion.set(transfer);
    this.modalTraspaso.set(true);
  }

  protected conciliar(account: Account): void {
    void this.router.navigate(['/accounts', account.id]);
  }

  private tarjeta(row: AccountRow): TarjetaCuenta {
    const last = row.lastReconciliation;
    return {
      row,
      tipo: ACCOUNT_KIND_LABEL[row.account.kind],
      saldo: formatMoney(row.balance),
      conciliada: last ? `conciliada el ${formatDayMonth(last.date)}` : 'sin conciliar',
    };
  }
}
