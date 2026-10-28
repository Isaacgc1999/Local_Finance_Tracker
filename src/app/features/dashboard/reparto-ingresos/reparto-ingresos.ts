import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatMoney } from '../../../core/format/money-format';
import { formatBasisPoints } from '../../../core/format/percent-format';
import { ALLOCATION_LABEL, type AllocationKey, type IncomeAllocation } from '../../../domain/analytics/income-allocation';
import { FT_COLORS } from '../../../shared/charts/palette';

const COLOR: Readonly<Record<AllocationKey, string>> = {
  fixed: FT_COLORS.expenseRamp[0],
  variable: FT_COLORS.expenseRamp[1],
  leisure: FT_COLORS.expenseRamp[2],
  subscriptions: FT_COLORS.subscription,
  saving: FT_COLORS.savings,
  investment: FT_COLORS.investment,
  free: FT_COLORS.income,
};

/**
 * «¿A dónde va tu nómina?»: barra apilada de los ingresos del mes entre
 * gastos (fijo, variable, ocio, suscripciones), ahorro, inversión y lo que
 * queda libre, con lo que apartas (ahorro + inversión). Responde de un vistazo a la pregunta
 * que el balance solo no contesta.
 */
@Component({
  selector: 'ft-reparto-ingresos',
  template: `
    <header class="cabecera">
      <h2 class="ft-card__title">¿A dónde va tu nómina?</h2>
      <span class="tasa num">Apartas <strong [class.ft-c-income]="(data().savingsRateBp ?? 0) > 0">{{ tasa() }}</strong></span>
    </header>
    @if (data().income > 0) {
      <div class="barra" role="img" [attr.aria-label]="resumen()">
        @for (s of filas(); track s.key) {
          <span [style.flex-grow]="s.peso" [style.background]="s.color" [title]="s.label + ': ' + s.importe"></span>
        }
      </div>
      <ul class="leyenda">
        @for (s of filas(); track s.key) {
          <li>
            <span class="punto" [style.background]="s.color"></span>
            <span class="leyenda__label">{{ s.label }}</span>
            <span class="num leyenda__importe">{{ s.importe }}</span>
            <span class="num leyenda__pct">{{ s.pct }}</span>
          </li>
        }
      </ul>
      @if (data().shortfall > 0) {
        <p class="aviso num">Este mes ha salido {{ falta() }} más de lo que ha entrado.</p>
      }
    } @else {
      <p class="vacio">Cuando entre tu nómina verás cómo se reparte.</p>
    }
  `,
  styleUrl: './reparto-ingresos.scss',
  host: { class: 'ft-card' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepartoIngresos {
  readonly data = input.required<IncomeAllocation>();

  protected readonly tasa = computed(() => formatBasisPoints(this.data().savingsRateBp));
  protected readonly falta = computed(() => formatMoney(this.data().shortfall));

  protected readonly filas = computed(() =>
    this.data().slices.map((s) => ({
      key: s.key,
      label: ALLOCATION_LABEL[s.key],
      color: COLOR[s.key],
      importe: formatMoney(s.amount),
      pct: formatBasisPoints(s.shareBp, { decimals: 0 }),
      peso: s.amount,
    })),
  );

  protected readonly resumen = computed(() => this.filas().map((f) => `${f.label} ${f.pct}`).join(', '));
}
