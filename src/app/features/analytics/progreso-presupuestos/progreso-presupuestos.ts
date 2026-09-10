import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatMoney } from '../../../core/format/money-format';
import { formatBasisPoints } from '../../../core/format/percent-format';
import { money } from '../../../core/types/money';
import type { BudgetProgress } from '../../../domain/budget/budget.service';

type Tono = 'accent' | 'savings' | 'expense' | 'investment' | 'income';

interface Fila {
  readonly id: string;
  readonly label: string;
  readonly actual: string;
  readonly target: string;
  readonly pct: string;
  readonly pctNum: number;
  /** Ancho de la barra, tope 100. */
  readonly ancho: number;
  readonly nota: string;
  readonly tono: Tono;
}

/**
 * «Presupuestos» de la analítica: una barra por presupuesto con lo gastado (o
 * lo ahorrado) frente al importe del rango. Misma anatomía que la barra
 * «Presupuesto consumido» del dashboard: pista `surface-elevated`, relleno del
 * color semántico y lectura a la derecha. El color dice el estado: acento si
 * un límite va bien, ámbar a partir del 80 %, rojo si se ha pasado; azul para
 * un objetivo en curso y verde cuando se cumple.
 */
@Component({
  selector: 'ft-progreso-presupuestos',
  imports: [RouterLink],
  templateUrl: './progreso-presupuestos.html',
  styleUrl: './progreso-presupuestos.scss',
  host: { class: 'ft-card', '[class.compacta]': "variante() === 'mobile'" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgresoPresupuestos {
  readonly rows = input.required<readonly BudgetProgress[]>();
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');

  protected readonly periodo = computed(() => {
    const meses = this.rows()[0]?.months ?? 1;
    return meses <= 1 ? 'Importe de un mes' : `${meses} meses del rango · importe mensual × ${meses}`;
  });

  protected readonly filas = computed<readonly Fila[]>(() =>
    this.rows().map((r) => {
      const tono: Tono =
        r.status === 'over'
          ? 'expense'
          : r.status === 'near'
            ? 'savings'
            : r.status === 'reached'
              ? 'income'
              : r.status === 'pending'
                ? 'investment'
                : 'accent';
      const resto = formatMoney(money(Math.abs(r.remaining)));
      const nota =
        r.status === 'over'
          ? `Superado en ${resto}`
          : r.status === 'reached'
            ? 'Objetivo cumplido'
            : r.kind === 'goal'
              ? `Faltan ${resto}`
              : `Quedan ${resto}`;
      return {
        id: r.budget.id,
        label: r.label,
        actual: formatMoney(r.actual),
        target: formatMoney(r.target),
        pct: formatBasisPoints(r.progressBp, { decimals: 0 }),
        pctNum: Math.round(r.progressBp / 100),
        ancho: Math.min(100, Math.max(0, r.progressBp / 100)),
        nota,
        tono,
      };
    }),
  );
}
