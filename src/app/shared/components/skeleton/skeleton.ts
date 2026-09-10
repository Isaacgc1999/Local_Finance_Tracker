import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'fila' | 'tarjeta' | 'grafico';

/** Anchos de las dos líneas de texto, en el orden del handoff (sección 7). */
const ANCHOS: readonly [string, string][] = [
  ['62%', '38%'],
  ['48%', '30%'],
  ['70%', '42%'],
];

/**
 * Skeleton de carga: barrido `shim` 1,6 s sobre bloques r999.
 * `fila` = avatar + dos líneas + importe (handoff); `tarjeta` y `grafico`
 * son la «versión del mismo barrido para tarjetas y gráficos» del README.
 */
@Component({
  selector: 'ft-skeleton',
  templateUrl: './skeleton.html',
  styleUrl: './skeleton.scss',
  host: {
    role: 'status',
    'aria-busy': 'true',
    'aria-label': 'Cargando',
    '[class]': '"ft-skeleton ft-skeleton--" + variant()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  readonly variant = input<SkeletonVariant>('fila');
  readonly rows = input<number>(3);
  readonly height = input<number>(215);

  readonly filas = computed(() =>
    Array.from({ length: this.rows() }, (_, i) => ANCHOS[i % ANCHOS.length] ?? ANCHOS[0]!),
  );
}
