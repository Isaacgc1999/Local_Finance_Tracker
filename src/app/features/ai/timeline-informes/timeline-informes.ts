import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatDuration } from '../../../core/format/date-format';
import type { AiReport } from '../../../core/types/ai-report';
import type { GeneratingState } from '../../../facades/ai.facade';
import { Spinner } from '../../../shared/components/spinner/spinner';
import { TarjetaInformeIa } from '../tarjeta-informe-ia/tarjeta-informe-ia';

/**
 * Timeline vertical del handoff: línea de 2px con un nodo de 12px por tarjeta
 * (acento en la activa) y anillo de 3px del color del fondo para recortar la
 * línea. La primera tarjeta puede ser el estado «generando».
 */
@Component({
  selector: 'ft-timeline-informes',
  imports: [TarjetaInformeIa, Spinner],
  templateUrl: './timeline-informes.html',
  styleUrl: './timeline-informes.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineInformes {
  readonly reports = input.required<readonly AiReport[]>();
  readonly generating = input<GeneratingState | null>(null);
  readonly expandedId = input<string | null>(null);
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');
  readonly alternar = output<string>();
  readonly reintentar = output<void>();
  readonly aplicar = output<{ readonly reportId: string; readonly index: number; readonly applied: boolean }>();

  protected readonly progreso = computed(() => {
    const g = this.generating();
    return g ? Math.min(100, g.progressBp / 100) : 0;
  });

  /** «semana 36» a partir de «Semana 36 · 31 ago–6 sep 2026». */
  protected readonly tituloGenerando = computed(() => {
    const label = this.generating()?.weekLabel ?? '';
    const [semana] = label.split(' · ');
    return (semana ?? label).toLocaleLowerCase('es');
  });

  protected readonly transcurrido = computed(() => {
    const g = this.generating();
    return g ? formatDuration(g.elapsedMs) : '';
  });

  protected estaExpandida(report: AiReport, index: number): boolean {
    const current = this.expandedId();
    // Sin selección explícita, solo la más reciente empieza expandida.
    return current === null ? index === 0 && this.generating() === null : current === report.id;
  }

  protected esActiva(report: AiReport, index: number): boolean {
    return this.estaExpandida(report, index);
  }
}
