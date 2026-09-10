import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatDuration, formatRelative, formatWeekLabel } from '../../../core/format/date-format';
import { formatMoney } from '../../../core/format/money-format';
import type { AiReport } from '../../../core/types/ai-report';
import { money } from '../../../core/types/money';

/**
 * Tarjeta de informe IA del handoff. Estados: expandida (borde acento, meta,
 * veredicto 600/24, hallazgos con barra vertical de 6px y recomendaciones con
 * su impacto en verde), colapsada (meta + resumen + «Expandir ▾») y error
 * (borde `expense` + «Reintentar»).
 *
 * Las recomendaciones llevan una casilla «La tengo en cuenta» en lugar del
 * botón «Aplicar» del handoff: la app no ejecuta nada por su cuenta (no
 * cancela suscripciones ni mueve dinero), solo guarda la marca, y un botón
 * prometía una acción que no existe.
 */
@Component({
  selector: 'ft-tarjeta-informe-ia',
  templateUrl: './tarjeta-informe-ia.html',
  styleUrl: './tarjeta-informe-ia.scss',
  host: {
    '[class.expandida]': 'expanded() && !fallida()',
    '[class.fallida]': 'fallida()',
    '[class.compacta]': 'compacta()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TarjetaInformeIa {
  readonly report = input.required<AiReport>();
  readonly expanded = input<boolean>(false);
  readonly compacta = input<boolean>(false);
  readonly alternar = output<string>();
  readonly reintentar = output<void>();
  readonly aplicar = output<{ readonly reportId: string; readonly index: number; readonly applied: boolean }>();

  protected readonly fallida = computed(() => this.report().status === 'failed');

  protected readonly meta = computed(() => {
    const r = this.report();
    const cuando = formatRelative(r.generatedAt);
    const duracion = r.durationMs ? ` · ${formatDuration(r.durationMs)}` : '';
    return `${formatWeekLabel(r.weekStart)} · generado ${cuando}${duracion}`;
  });

  protected readonly metaCorta = computed(() => formatWeekLabel(this.report().weekStart));

  /** Resumen de una línea de la tarjeta colapsada. */
  protected readonly resumen = computed(() => {
    const r = this.report();
    if (r.status === 'failed') return r.error ?? 'No se pudo generar el informe.';
    return r.verdict ?? r.findings[0]?.title ?? 'Informe sin veredicto.';
  });

  protected readonly hallazgos = computed(() => this.report().findings);

  protected readonly recomendaciones = computed(() =>
    this.report().recommendations.map((r, index) => ({
      index,
      action: r.action,
      rationale: r.rationale,
      applied: r.applied === true,
      impacto: `${r.monthly_impact_cents >= 0 ? '+' : ''}${formatMoney(money(Math.abs(r.monthly_impact_cents)))}/mes`,
      positivo: r.monthly_impact_cents >= 0,
    })),
  );
}
