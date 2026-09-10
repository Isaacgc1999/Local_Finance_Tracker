import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { formatAmount } from '../core/format/money-format';
import { formatBasisPoints } from '../core/format/percent-format';
import { type Money, money } from '../core/types/money';
import {
  type CalcKey,
  type CalcState,
  CalculatorEngine,
  type HistoryEntry,
  INITIAL_STATE,
} from '../domain/calculator/calculator-engine';
import { type FinancialMode, compoundInterest, percentOf, splitBetween } from '../domain/calculator/financial';

export type CalcTab = 'standard' | 'financial';

/** Resultado principal de la pestaña financiera, con su lectura y su expresión. */
export interface FinancialOutcome {
  readonly value: Money;
  /** Texto que se guarda en el historial («21 % de 2.412,68»). */
  readonly expression: string;
  /** Color semántico de la cifra grande. */
  readonly tone: 'text-1' | 'investment';
  readonly ready: boolean;
}

const PERCENT_MAX_BP = 1_000_000; // 10.000 %

/**
 * Estado de la calculadora. Vive en el árbol raíz (`providedIn: 'root'`), no
 * en una ruta: el panel se abre sobre la vista actual sin desmontarla, tal
 * como pide el handoff. La UI solo lee signals; toda la aritmética está en
 * `CalculatorEngine` y en `financial.ts`, que son puros y están testeados.
 */
@Injectable({ providedIn: 'root' })
export class CalculatorFacade {
  private readonly router = inject(Router);
  private readonly engine = new CalculatorEngine();

  private readonly _state = signal<CalcState>(INITIAL_STATE);
  private readonly _open = signal(false);

  readonly state = this._state.asReadonly();
  readonly open = this._open.asReadonly();
  readonly tab = signal<CalcTab>('standard');

  // ── Pestaña financiera ───────────────────────────────────────────────
  readonly mode = signal<FinancialMode>('compound');
  readonly percentBase = signal<Money | null>(money(241_268));
  readonly percentRateBp = signal<number>(2100);
  readonly splitAmount = signal<Money | null>(money(10_000));
  readonly splitPeople = signal<number>(3);
  readonly principal = signal<Money | null>(money(420_000));
  readonly monthlyContribution = signal<Money | null>(money(25_000));
  readonly years = signal<number>(18);
  readonly annualRateBp = signal<number>(680);

  readonly history = computed(() => this._state().history);
  readonly display = computed(() => this._state().display);
  readonly expression = computed(() => this._state().expression);
  readonly error = computed(() => this._state().error);

  readonly split = computed(() => splitBetween(this.splitAmount() ?? money(0), Math.trunc(this.splitPeople())));

  readonly compound = computed(() =>
    compoundInterest({
      principal: this.principal() ?? money(0),
      monthlyContribution: this.monthlyContribution() ?? money(0),
      years: Math.max(0, this.years()),
      annualRateBp: Math.max(0, this.annualRateBp()),
    }),
  );

  /** Cifra protagonista de la pestaña financiera según el modo activo. */
  readonly financial = computed<FinancialOutcome>(() => {
    switch (this.mode()) {
      case 'percent': {
        const base = this.percentBase();
        const bp = this.percentRateBp();
        const ready = base !== null && bp >= 0 && bp <= PERCENT_MAX_BP;
        return {
          value: ready ? percentOf(base, bp) : money(0),
          expression: `${formatBasisPoints(bp, { decimals: bp % 100 === 0 ? 0 : 1 })} de ${formatAmount(base ?? money(0), 'never')}`,
          tone: 'text-1',
          ready,
        };
      }
      case 'split': {
        const amount = this.splitAmount();
        const people = Math.trunc(this.splitPeople());
        const ready = amount !== null && people > 0;
        return {
          value: ready ? this.split().each : money(0),
          expression: `${formatAmount(amount ?? money(0), 'never')} ÷ ${people} personas`,
          tone: 'text-1',
          ready,
        };
      }
      case 'compound': {
        const ready = this.principal() !== null && this.monthlyContribution() !== null && this.years() >= 0;
        return {
          value: ready ? this.compound().finalValue : money(0),
          expression: `${formatAmount(this.principal() ?? money(0), 'never')} + ${formatAmount(
            this.monthlyContribution() ?? money(0),
            'never',
          )}/mes · ${this.years()} años`,
          tone: 'investment',
          ready,
        };
      }
    }
  });

  /** Importe que se llevaría al formulario: depende de la pestaña activa. */
  readonly usableAmount = computed<Money | null>(() => {
    const value = this.tab() === 'standard' ? this._state().result : this.financial().value;
    return value > 0 ? value : null;
  });

  readonly usableLabel = computed(() => {
    const value = this.usableAmount();
    return value === null ? 'Usar el resultado en nuevo evento' : `Usar ${formatAmount(value, 'never')} en nuevo evento`;
  });

  toggle(): void {
    this._open.update((v) => !v);
  }

  openPanel(): void {
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
  }

  press(key: CalcKey): void {
    this._state.set(this.engine.press(key));
  }

  /** Reutiliza una fila del historial: su resultado pasa al display. */
  reuse(entry: HistoryEntry): void {
    this.tab.set('standard');
    this._state.set(this.engine.load(entry.result));
  }

  clearHistory(): void {
    this.engine.clearHistory();
    this._state.set(this.engine.snapshot());
  }

  /** Guarda la cuenta financiera actual en el historial compartido. */
  recordFinancial(): void {
    const outcome = this.financial();
    if (!outcome.ready) return;
    this._state.set(this.engine.record(outcome.expression, outcome.value));
  }

  /**
   * «Usar X en nuevo evento»: cierra el panel y abre el formulario con el
   * importe precargado. Viaja en céntimos enteros, nunca formateado (ADR-045).
   */
  async useInNewEvent(): Promise<void> {
    const value = this.usableAmount();
    if (value === null) return;
    this.close();
    await this.router.navigate(['/events/new'], { queryParams: { amount: String(value) } });
  }
}
