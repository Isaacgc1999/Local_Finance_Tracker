import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import { formatInteger } from '../../../core/format/percent-format';
import type { Money } from '../../../core/types/money';

/**
 * Hero «Balance del mes» del handoff: display `+868,31 €`, delta ▲/▼ en
 * income/expense con «frente a agosto (726,12 €)», separador y tres
 * micro-métricas (Ingresos, Gastos, Movimientos). 768: ancho completo con el
 * delta a la derecha. 390: apilado con «▲ 142,19 € vs agosto».
 */
@Component({
  selector: 'ft-hero-balance',
  templateUrl: './hero-balance.html',
  styleUrl: './hero-balance.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroBalance {
  readonly balance = input.required<Money>();
  readonly delta = input.required<Money>();
  readonly prevBalance = input.required<Money>();
  readonly prevMonthName = input.required<string>();
  readonly income = input.required<Money>();
  readonly outflow = input.required<Money>();
  readonly count = input.required<number>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  protected readonly balanceTexto = computed(() => formatMoney(this.balance(), { sign: 'always' }));
  protected readonly deltaTexto = computed(() => {
    const d = this.delta();
    const flecha = d < 0 ? '▼' : '▲';
    return `${flecha} ${formatMoney(Math.abs(d) as Money)}`;
  });
  protected readonly deltaPositivo = computed(() => this.delta() >= 0);
  protected readonly referencia = computed(() => `frente a ${this.prevMonthName()} (${formatMoney(this.prevBalance())})`);
  protected readonly referenciaCorta = computed(() => `vs ${this.prevMonthName()}`);
  protected readonly ingresosTexto = computed(() => formatMoney(this.income()));
  protected readonly gastosTexto = computed(() => formatMoney(this.outflow()));
  protected readonly movimientosTexto = computed(() => formatInteger(this.count()));
}
