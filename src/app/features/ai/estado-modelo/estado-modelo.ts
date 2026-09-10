import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatDuration, formatRelative } from '../../../core/format/date-format';
import type { AiReport } from '../../../core/types/ai-report';

/** Tarjeta «Estado del modelo» del handoff: modelo, endpoint, último informe y duración. */
@Component({
  selector: 'ft-estado-modelo',
  template: `
    <p class="titulo">Estado del modelo</p>
    <div class="fila"><span class="clave">Modelo</span><span class="valor">{{ model() }}</span></div>
    <div class="fila"><span class="clave">Endpoint</span><span class="valor num">{{ endpoint() }}</span></div>
    <div class="fila"><span class="clave">Último informe</span><span class="valor">{{ ultimo() }}</span></div>
    @if (latencyMs() !== null) {
      <div class="fila"><span class="clave">Latencia</span><span class="valor num">{{ latencyMs() }} ms</span></div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: var(--ft-card-padding);
      background: var(--ft-surface);
      border: 1px solid var(--ft-border);
      border-radius: var(--ft-radius-card);
      min-width: 0;
    }
    .titulo {
      font: var(--ft-font-label);
      color: var(--ft-text-1);
    }
    .fila {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .clave {
      font: var(--ft-font-meta);
      color: var(--ft-text-3);
    }
    .valor {
      font: var(--ft-font-meta);
      color: var(--ft-text-1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadoModelo {
  readonly model = input.required<string>();
  readonly endpoint = input.required<string>();
  readonly lastReport = input<AiReport | null>(null);
  readonly latencyMs = input<number | null>(null);

  protected readonly ultimo = computed(() => {
    const r = this.lastReport();
    if (!r) return 'ninguno todavía';
    const duracion = r.durationMs ? ` · ${formatDuration(r.durationMs)}` : '';
    return `${formatRelative(r.generatedAt)}${duracion}`;
  });
}
