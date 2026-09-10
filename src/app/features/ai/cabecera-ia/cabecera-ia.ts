import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { ModelStatus } from '../../../facades/ai.facade';
import { PillEstado, type PillTono } from '../../../shared/components/pill-estado/pill-estado';

interface EstadoPill {
  readonly texto: string;
  readonly tono: PillTono;
  readonly punto: boolean;
}

/**
 * Cabecera de Análisis IA del handoff: título, badge «Llama 3.1 · local»,
 * pill de estado (Conectado / No detectado), párrafo de privacidad y los
 * botones «Ajustes del modelo» y «Regenerar análisis».
 */
@Component({
  selector: 'ft-cabecera-ia',
  imports: [PillEstado],
  templateUrl: './cabecera-ia.html',
  styleUrl: './cabecera-ia.scss',
  host: { '[class]': '"variante-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CabeceraIa {
  readonly status = input.required<ModelStatus>();
  readonly model = input.required<string>();
  readonly latencyMs = input<number | null>(null);
  readonly busy = input<boolean>(false);
  readonly variante = input<'desktop' | 'tablet' | 'mobile'>('desktop');
  readonly regenerar = output<void>();
  readonly ajustes = output<void>();
  readonly cancelar = output<void>();

  /** «Llama 3.1 · local» a partir del identificador del modelo. */
  protected readonly modeloCorto = computed(() => {
    const [name = ''] = this.model().split(':');
    const bonito = name.replace(/^llama/i, 'Llama ').replace(/^(\w)/, (c) => c.toUpperCase()).trim();
    return `${bonito || this.model()} · local`;
  });

  protected readonly pill = computed<EstadoPill>(() => {
    switch (this.status()) {
      case 'connected': {
        const latencia = this.latencyMs();
        return { texto: latencia === null ? 'Conectado' : `Conectado · ${latencia} ms`, tono: 'income', punto: true };
      }
      case 'generating':
        return { texto: 'Generando', tono: 'accent', punto: true };
      case 'checking':
        return { texto: 'Comprobando…', tono: 'neutral', punto: false };
      case 'model_missing':
        return { texto: 'Modelo no descargado', tono: 'savings', punto: true };
      case 'error':
        return { texto: 'Error', tono: 'expense', punto: true };
      case 'not_detected':
        return { texto: 'No detectado', tono: 'expense', punto: true };
      default:
        return { texto: 'Sin comprobar', tono: 'neutral', punto: false };
    }
  });
}
