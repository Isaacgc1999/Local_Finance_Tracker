import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SettingsFacade } from '../../../facades/settings.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { PillEstado, type PillTono } from '../../../shared/components/pill-estado/pill-estado';

/**
 * «Ollama» del handoff: pill de estado con latencia («Conectado · 240 ms»),
 * select de modelo, endpoint y botón «Probar conexión».
 *
 * El endpoint se valida contra localhost: la regla del proyecto es que la
 * aplicación no hace ninguna llamada de red que no sea a Ollama en la propia
 * máquina, y este campo es el único sitio donde el usuario podría romperla.
 */
@Component({
  selector: 'ft-ajustes-ollama',
  imports: [PillEstado],
  templateUrl: './ajustes-ollama.html',
  styleUrl: './ajustes-ollama.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AjustesOllama {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);

  /** Borrador del endpoint mientras se escribe; se guarda al salir del campo. */
  protected readonly endpointBorrador = signal<string | null>(null);

  protected readonly endpoint = computed(() => this.endpointBorrador() ?? this.facade.settings().ollamaEndpoint);

  /** El modelo guardado siempre está en la lista, aunque Ollama no responda. */
  protected readonly opcionesModelo = computed(() => {
    const actual = this.facade.settings().ollamaModel;
    const disponibles = this.facade.models();
    return disponibles.includes(actual) ? disponibles : [actual, ...disponibles];
  });

  protected readonly tono = computed<PillTono>(() => {
    switch (this.facade.probe()) {
      case 'connected':
        return 'income';
      case 'not_detected':
        return 'expense';
      case 'model_missing':
        return 'savings';
      default:
        return 'neutral';
    }
  });

  protected readonly etiqueta = computed(() => {
    const latencia = this.facade.latencyMs();
    switch (this.facade.probe()) {
      case 'checking':
        return 'Comprobando…';
      case 'connected':
        return latencia === null || this.bp.isMobile() ? 'Conectado' : `Conectado · ${latencia} ms`;
      case 'model_missing':
        return 'Modelo sin descargar';
      case 'not_detected':
        return 'No detectado';
      default:
        return 'Sin comprobar';
    }
  });

  protected probar(): void {
    void this.facade.testConnection(this.endpoint(), this.facade.settings().ollamaModel);
  }

  protected onEndpointInput(value: string): void {
    this.endpointBorrador.set(value);
  }

  protected async guardarEndpoint(): Promise<void> {
    const borrador = this.endpointBorrador();
    if (borrador === null || borrador.trim() === this.facade.settings().ollamaEndpoint) {
      this.endpointBorrador.set(null);
      return;
    }
    const saved = await this.facade.setEndpoint(borrador);
    // Si no valida, el campo vuelve al valor guardado en vez de quedarse a medias.
    this.endpointBorrador.set(null);
    if (saved.ok) void this.facade.testConnection();
  }

  protected onModelo(value: string): void {
    void this.facade.setModel(value).then((saved) => {
      if (saved.ok) void this.facade.testConnection(this.endpoint(), value);
    });
  }
}
