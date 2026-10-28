import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  ACCENT_PRESETS,
  APP_STYLES,
  type AppStyle,
  DEFAULT_APPEARANCE,
  STYLE_HINT,
  STYLE_LABEL,
  type ThemeMode,
  contrastRatio,
  normalizeHex,
} from '../../../core/types/appearance';
import { BreakpointService } from '../../../infra/platform/breakpoint.service';
import { ThemeService } from '../../../infra/platform/theme.service';
import { FT_COLORS } from '../../../shared/charts/palette';
import {
  SegmentedControl,
  type SegmentOption,
} from '../../../shared/components/segmented-control/segmented-control';

const MODOS: readonly SegmentOption<ThemeMode>[] = [
  { value: 'oscuro', label: 'Oscuro' },
  { value: 'claro', label: 'Claro' },
  { value: 'sistema', label: 'Sistema' },
];

/** Por debajo de 3:1 (WCAG para elementos gráficos) el acento apenas se distingue del fondo. */
const MIN_CONTRASTE = 3;

/**
 * «Apariencia»: modo (oscuro / claro / sistema), estilo de la app y color de
 * acento. Cada miniatura de estilo lleva sus propios `data-estilo` y
 * `data-modo`, así que se pinta con los tokens de ese tema (`_themes.scss`)
 * sin repetir colores aquí.
 *
 * Los cambios se aplican y guardan al momento, sin botón de guardar: es lo
 * que se espera de un ajuste visual y se deshace con otro clic.
 */
@Component({
  selector: 'ft-apariencia',
  imports: [SegmentedControl],
  templateUrl: './apariencia.html',
  styleUrl: './apariencia.scss',
  host: { class: 'ft-card', '[class.compacta]': 'bp.isMobile()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Apariencia {
  protected readonly theme = inject(ThemeService);
  protected readonly bp = inject(BreakpointService);

  protected readonly modos = MODOS;
  protected readonly estilos = APP_STYLES.map((value) => ({
    value,
    label: STYLE_LABEL[value],
    hint: STYLE_HINT[value],
  }));
  protected readonly acentos = ACCENT_PRESETS;

  protected readonly modoVisto = this.theme.resolvedMode;
  protected readonly acento = this.theme.accent;
  protected readonly personalizado = computed(() => {
    const a = this.acento();
    return a !== null && !this.acentos.some((p) => p.hex === a);
  });
  protected readonly valorSelector = computed(() => this.acento() ?? '#6e56f8');

  protected readonly avisoContraste = computed(() => {
    const a = this.acento();
    const fondo = normalizeHex(FT_COLORS.surface);
    if (!a || !fondo) return '';
    return contrastRatio(a, fondo) < MIN_CONTRASTE
      ? `Este color se distingue poco sobre el fondo ${this.modoVisto() === 'claro' ? 'claro' : 'oscuro'}: botones y enlaces costarán de leer.`
      : '';
  });

  protected readonly porDefecto = computed(() => {
    const a = this.theme.appearance();
    return (
      a.mode === DEFAULT_APPEARANCE.mode &&
      a.style === DEFAULT_APPEARANCE.style &&
      a.accent === null
    );
  });

  protected onModo(value: ThemeMode | null): void {
    if (value !== null && value !== this.theme.mode()) this.theme.setMode(value);
  }

  protected onEstilo(value: AppStyle): void {
    if (value !== this.theme.style()) this.theme.setStyle(value);
  }

  protected onAcento(value: string | null): void {
    if (value !== this.acento()) this.theme.setAccent(value);
  }

  protected onTeclaEstilo(event: KeyboardEvent, actual: AppStyle): void {
    const delta = (
      { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>
    )[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const i = APP_STYLES.indexOf(actual);
    const next = APP_STYLES[(i + delta + APP_STYLES.length) % APP_STYLES.length] ?? actual;
    this.onEstilo(next);
    const grupo = (event.currentTarget as HTMLElement).parentElement;
    grupo?.querySelector<HTMLButtonElement>(`[data-valor="${next}"]`)?.focus();
  }
}
