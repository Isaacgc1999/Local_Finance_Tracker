import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { formatDateTime } from '../../../core/format/date-format';
import { formatBytes } from '../../../core/format/bytes-format';
import { formatInteger } from '../../../core/format/percent-format';
import { SettingsFacade } from '../../../facades/settings.facade';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { Spinner } from '../../../shared/components/spinner/spinner';

/**
 * «Fichero de datos» del handoff: ruta en tipografía tabular con enlace
 * «Cambiar», tamaño / movimientos / última copia, y los dos botones de copia
 * de seguridad y restauración.
 *
 * Las tres operaciones necesitan la ventana de Tauri (diálogos nativos y
 * acceso al disco); en el modo demo del navegador se muestran deshabilitadas
 * con el motivo, en lugar de fallar al pulsarlas.
 */
@Component({
  selector: 'ft-fichero-datos',
  imports: [Spinner],
  templateUrl: './fichero-datos.html',
  styleUrl: './fichero-datos.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FicheroDatos {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly ruta = computed(() => this.facade.dbInfo()?.path ?? '—');
  protected readonly tamano = computed(() => {
    const info = this.facade.dbInfo();
    return info ? formatBytes(info.bytes) : '—';
  });
  protected readonly movimientos = computed(() => {
    const info = this.facade.dbInfo();
    return info ? formatInteger(info.events) : '—';
  });
  protected readonly ultimaCopia = computed(() => {
    const stamp = this.facade.settings().lastBackupAt;
    return stamp ? formatDateTime(stamp) : 'Nunca';
  });
  /** Resumen de una línea del frame de 390: «2,41 MB · última copia 8 sep, 23:14». */
  protected readonly resumenMovil = computed(() => `${this.tamano()} · última copia ${this.ultimaCopia().toLowerCase()}`);

  protected readonly motivoDeshabilitado = computed(() =>
    this.facade.demo()
      ? 'En el modo demo del navegador no hay fichero que copiar.'
      : 'Disponible dentro de la ventana de Fintrack.',
  );

  protected copia(): void {
    void this.facade.createBackup();
  }

  protected restaurar(): void {
    void this.facade.restoreBackup();
  }

  protected cambiar(): void {
    void this.facade.changeLocation();
  }
}
