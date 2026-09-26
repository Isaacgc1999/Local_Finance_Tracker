import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ValidationError } from '../../../core/errors/app-error';
import { formatDayMonth, formatDayMonthYear } from '../../../core/format/date-format';
import { formatMoney, parseMoney } from '../../../core/format/money-format';
import type { Reconciliation } from '../../../core/types/account';
import { type IsoDate, addDays, isIsoDate } from '../../../core/types/iso-date';
import { type Money, money } from '../../../core/types/money';
import { AccountsFacade } from '../../../facades/accounts.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { CabeceraPagina } from '../../../layout/cabecera-pagina/cabecera-pagina';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';

interface FilaHistorial {
  readonly reconciliation: Reconciliation;
  readonly fecha: string;
  readonly saldo: string;
  readonly ajuste: string;
}

/**
 * Conciliación básica de una cuenta: se escribe el saldo que dice el banco
 * en una fecha, se compara con el calculado y se ve el extracto desde la
 * última conciliación para localizar la diferencia. Con «Registrar ajuste»
 * la diferencia queda guardada y la cuenta pasa a cuadrar.
 */
@Component({
  selector: 'ft-conciliacion',
  imports: [CabeceraPagina, RouterLink, Skeleton],
  templateUrl: './conciliacion.html',
  styleUrl: './conciliacion.scss',
  host: { class: 'ft-page', '[class.escritorio]': 'bp.isDesktop()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Conciliacion {
  /** Id de la cuenta (parámetro de ruta). */
  readonly id = input.required<string>();

  protected readonly facade = inject(AccountsFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly extractoTexto = signal('');
  protected readonly ajustar = signal(true);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly vista = this.facade.reconciliation;
  protected readonly titulo = computed(() => {
    const v = this.vista();
    return v ? `Conciliar ${v.account.name}` : 'Conciliar cuenta';
  });

  protected readonly saldoCalculado = computed(() => {
    const v = this.vista();
    return v ? formatMoney(v.balance) : '';
  });

  private readonly extracto = computed<Money | null>(() => {
    const texto = this.extractoTexto().trim();
    if (!texto) return null;
    const parsed = parseMoney(texto);
    return parsed.ok ? parsed.value : null;
  });

  protected readonly diferencia = computed<Money | null>(() => {
    const v = this.vista();
    const e = this.extracto();
    return v && e !== null ? money(e - v.balance) : null;
  });

  protected readonly diferenciaTexto = computed(() => {
    const d = this.diferencia();
    return d === null ? '—' : formatMoney(d, { sign: 'always' });
  });

  protected readonly desdeTexto = computed(() => {
    const v = this.vista();
    if (!v) return '';
    return v.last ? `Desde la conciliación del ${formatDayMonthYear(v.last.date)}` : `Desde la apertura, ${formatDayMonthYear(v.range.from)}`;
  });

  protected readonly saldoInicialTexto = computed(() => {
    const v = this.vista();
    if (!v) return '';
    return `Saldo al cierre del ${formatDayMonth(addDays(v.range.from, -1))}`;
  });

  protected readonly historial = computed<readonly FilaHistorial[]>(() =>
    (this.vista()?.history ?? []).map((r) => ({
      reconciliation: r,
      fecha: formatDayMonthYear(r.date),
      saldo: formatMoney(r.statementBalanceCents),
      ajuste: r.adjustmentCents === 0 ? 'sin ajuste' : `ajuste ${formatMoney(r.adjustmentCents, { sign: 'always' })}`,
    })),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.facade.openReconciliation(id));
    });
    inject(DestroyRef).onDestroy(() => this.facade.closeReconciliation());
  }

  protected formatMoney = formatMoney;
  protected formatDayMonth = formatDayMonth;

  protected error(campo: string): string {
    return this.errores().get(campo) ?? '';
  }

  protected onFecha(value: string): void {
    this.errores.set(new Map());
    if (isIsoDate(value)) void this.facade.setReconcileDate(value as IsoDate);
  }

  protected onExtracto(value: string): void {
    this.extractoTexto.set(value);
    this.errores.set(new Map());
  }

  protected async conciliar(): Promise<void> {
    const e = this.extracto();
    if (e === null) {
      this.errores.set(new Map([['statement', 'Escribe el saldo que aparece en el extracto.']]));
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.reconcile(e, this.ajustar() && this.diferencia() !== 0);
    this.guardando.set(false);
    if (result.ok) this.extractoTexto.set('');
    else if (Array.isArray(result.error)) {
      this.errores.set(new Map((result.error as readonly ValidationError[]).map((x) => [x.field, x.message])));
    }
  }

  protected async borrar(r: Reconciliation): Promise<void> {
    await this.facade.deleteReconciliation(r.id);
  }
}
