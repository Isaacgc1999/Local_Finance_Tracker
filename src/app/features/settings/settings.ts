import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { describeError } from '../../core/errors/app-error';
import { SettingsFacade } from '../../facades/settings.facade';
import { BreakpointService } from '../../infra/platform/breakpoint.service';
import { CabeceraPagina } from '../../layout/cabecera-pagina/cabecera-pagina';
import { TarjetaError } from '../../shared/components/tarjeta-error/tarjeta-error';
import { AjustesOllama } from './ajustes-ollama/ajustes-ollama';
import { FicheroDatos } from './fichero-datos/fichero-datos';
import { IngresosRecurrentes } from './ingresos-recurrentes/ingresos-recurrentes';
import { ListaCategorias } from './lista-categorias/lista-categorias';
import { MonedaFormato } from './moneda-formato/moneda-formato';
import { Presupuestos } from './presupuestos/presupuestos';
import { ReglasCategoria } from './reglas-categoria/reglas-categoria';

/**
 * Pantalla 6 del handoff. Tres layouts reales: dos columnas 7/5 en
 * escritorio, una sola columna en 768 con presupuesto y moneda a la par al
 * final, y una columna corrida en 390.
 *
 * El frame de móvil del handoff se corta en el presupuesto; aquí la tarjeta
 * de moneda y formato sigue estando, porque esconder un ajuste real según el
 * ancho de la ventana dejaría el formato de fecha inalcanzable en móvil.
 */
@Component({
  selector: 'ft-settings',
  imports: [
    CabeceraPagina,
    TarjetaError,
    FicheroDatos,
    AjustesOllama,
    ListaCategorias,
    IngresosRecurrentes,
    Presupuestos,
    ReglasCategoria,
    MonedaFormato,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  host: { class: 'ft-page', '[class]': '"v-" + variante()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly facade = inject(SettingsFacade);
  protected readonly bp = inject(BreakpointService);

  protected readonly variante = computed(() =>
    this.bp.isMobile() ? 'mobile' : this.bp.isTablet() ? 'tablet' : 'desktop',
  );

  protected readonly errorTexto = computed(() => {
    const e = this.facade.error();
    return e ? describeError(e) : '';
  });

  constructor() {
    void this.facade.testConnection();
  }
}
