import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { formatMoney, parseMoney } from '../../../core/format/money-format';
import { formatBasisPoints } from '../../../core/format/percent-format';
import { type Money, money } from '../../../core/types/money';
import { CalculatorFacade } from '../../../facades/calculator.facade';
import type { FinancialMode } from '../../../domain/calculator/financial';
import {
  SegmentedControl,
  type SegmentOption,
} from '../../../shared/components/segmented-control/segmented-control';

/** Orden de los chips tal como los dibuja el frame de 768. */
const MODOS: readonly SegmentOption<FinancialMode>[] = [
  { value: 'compound', label: 'Interés compuesto' },
  { value: 'percent', label: '% de importe' },
  { value: 'split', label: 'Dividir' },
];

/**
 * Pestaña «Financiera»: chips de modo, rejilla 2×N de campos y caja de
 * resultado. El único modo dibujado en el handoff es el interés compuesto
 * (capital 4.200,00 €, 250,00 €/mes, 18 años, 6,8 % → valor final en
 * `investment`, con «Aportado» e «Intereses» en verde); «% de importe» y
 * «Dividir» reutilizan esa misma anatomía (FASE-0, ambigüedad 6).
 */
@Component({
  selector: 'ft-pestana-financiera',
  imports: [SegmentedControl],
  templateUrl: './pestana-financiera.html',
  styleUrl: './pestana-financiera.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PestanaFinanciera {
  protected readonly facade = inject(CalculatorFacade);
  protected readonly modos = MODOS;

  protected readonly textoPercentBase = signal(formatMoney(this.facade.percentBase() ?? money(0), { sign: 'never' }));
  protected readonly textoPercentRate = signal(formatBasisPoints(this.facade.percentRateBp(), { decimals: 0 }));
  protected readonly textoSplitAmount = signal(formatMoney(this.facade.splitAmount() ?? money(0), { sign: 'never' }));
  protected readonly textoPrincipal = signal(formatMoney(this.facade.principal() ?? money(0), { sign: 'never' }));
  protected readonly textoAportacion = signal(formatMoney(this.facade.monthlyContribution() ?? money(0), { sign: 'never' }));
  protected readonly textoRate = signal(formatBasisPoints(this.facade.annualRateBp(), { decimals: 1 }));

  protected readonly reparto = computed(() => {
    const { each, remainder, shares } = this.facade.split();
    if (shares.length === 0) return 'Indica un número de personas mayor que cero.';
    if (remainder === 0) return `${shares.length} pagos exactos de ${formatMoney(each, { sign: 'never' })}.`;
    const con = remainder === 1 ? 'una persona paga' : `${remainder} personas pagan`;
    return `Sobra${remainder === 1 ? '' : 'n'} ${remainder} céntimo${remainder === 1 ? '' : 's'}: ${con} un céntimo más.`;
  });

  protected readonly compuesto = computed(() => this.facade.compound());

  /** Con el símbolo de la moneda activa (Ajustes → Moneda y formato). */
  protected importe(value: Money): string {
    return formatMoney(value, { sign: 'never' });
  }

  protected onImporte(texto: string, destino: 'percentBase' | 'splitAmount' | 'principal' | 'monthlyContribution'): void {
    const parsed = parseMoney(texto);
    this.facade[destino].set(parsed.ok ? parsed.value : null);
  }

  protected onBlurImporte(
    campo: { set(value: string): void },
    destino: 'percentBase' | 'splitAmount' | 'principal' | 'monthlyContribution',
  ): void {
    const value = this.facade[destino]();
    if (value !== null) campo.set(formatMoney(value, { sign: 'never' }));
  }

  /** «21 %», «6,8» o «6,8 %»: se queda con el número y lo pasa a puntos básicos. */
  protected onPorcentaje(texto: string, destino: 'percentRateBp' | 'annualRateBp'): void {
    const limpio = texto.replace('%', '').trim().replace(',', '.');
    const value = Number(limpio);
    if (limpio === '' || !Number.isFinite(value) || value < 0) return;
    this.facade[destino].set(Math.round(value * 100));
  }

  protected onEntero(texto: string, destino: 'splitPeople' | 'years'): void {
    const value = Number(texto.trim());
    if (!Number.isFinite(value) || value < 0) return;
    this.facade[destino].set(Math.trunc(value));
  }
}
