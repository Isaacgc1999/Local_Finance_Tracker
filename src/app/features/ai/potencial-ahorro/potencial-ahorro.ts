import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import type { Money } from '../../../core/types/money';
import type { SavingsSource } from '../../../facades/ai.facade';

/**
 * «Potencial de ahorro detectado» del handoff: importe display en verde con
 * «/mes», explicación con el equivalente anual y desglose de las fuentes.
 * Las recomendaciones aplicadas se descuentan y se listan aparte.
 */
@Component({
  selector: 'ft-potencial-ahorro',
  templateUrl: './potencial-ahorro.html',
  styleUrl: './potencial-ahorro.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PotencialAhorro {
  readonly monthly = input.required<Money>();
  readonly yearly = input.required<Money>();
  readonly applied = input.required<Money>();
  readonly sources = input.required<readonly SavingsSource[]>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  protected readonly mensual = computed(() => formatMoney(this.monthly()));
  protected readonly anual = computed(() => formatMoney(this.yearly()));
  protected readonly aplicado = computed(() => formatMoney(this.applied()));
  protected readonly explicacion = computed(() => {
    const base = `Suma de las recomendaciones aplicables sin tocar tu nivel de vida. Equivale a ${this.anual()} al año.`;
    return this.applied() > 0 ? `${base} Ya tienes en cuenta ${this.aplicado()} al mes.` : base;
  });
  protected readonly filas = computed(() => this.sources().map((s) => ({ ...s, importe: formatMoney(s.amount) })));
}
