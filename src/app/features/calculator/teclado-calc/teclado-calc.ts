import { ChangeDetectionStrategy, Component, output } from '@angular/core';

import type { CalcKey } from '../../../domain/calculator/calculator-engine';

type Estilo = 'digito' | 'funcion' | 'operador' | 'igual';

interface Tecla {
  readonly key: CalcKey;
  readonly glifo: string;
  readonly estilo: Estilo;
  readonly ancha: boolean;
  readonly aria: string;
}

const tecla = (key: CalcKey, estilo: Estilo, aria: string, glifo = key, ancha = false): Tecla => ({
  key,
  glifo,
  estilo,
  ancha,
  aria,
});

/** Rejilla 4×5 exacta del handoff, en el mismo orden de lectura. */
const TECLAS: readonly Tecla[] = [
  tecla('C', 'funcion', 'Borrar todo'),
  tecla('±', 'funcion', 'Cambiar de signo'),
  tecla('%', 'funcion', 'Porcentaje'),
  tecla('÷', 'operador', 'Dividir'),
  tecla('7', 'digito', 'Siete'),
  tecla('8', 'digito', 'Ocho'),
  tecla('9', 'digito', 'Nueve'),
  tecla('×', 'operador', 'Multiplicar'),
  tecla('4', 'digito', 'Cuatro'),
  tecla('5', 'digito', 'Cinco'),
  tecla('6', 'digito', 'Seis'),
  tecla('−', 'operador', 'Restar'),
  tecla('1', 'digito', 'Uno'),
  tecla('2', 'digito', 'Dos'),
  tecla('3', 'digito', 'Tres'),
  tecla('+', 'operador', 'Sumar'),
  tecla('0', 'digito', 'Cero', '0', true),
  tecla(',', 'digito', 'Coma decimal'),
  tecla('=', 'igual', 'Igual'),
];

/**
 * Teclado de 4 columnas: dígitos y coma sobre `surface-elevated`, `C ± %` en
 * text-2, operadores en acento sobre `accent-12`, `=` en acento sólido y el
 * `0` a dos columnas. Glifo 500/24, teclas de 56px (60 en móvil).
 */
@Component({
  selector: 'ft-teclado-calc',
  template: `
    @for (t of teclas; track t.key) {
      <button
        type="button"
        class="tecla"
        [class]="'tecla--' + t.estilo"
        [class.ancha]="t.ancha"
        [attr.aria-label]="t.aria"
        (click)="tecla.emit(t.key)"
      >
        {{ t.glifo }}
      </button>
    }
  `,
  styleUrl: './teclado-calc.scss',
  host: { role: 'group', 'aria-label': 'Teclado de la calculadora' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TecladoCalc {
  readonly tecla = output<CalcKey>();
  protected readonly teclas = TECLAS;
}
