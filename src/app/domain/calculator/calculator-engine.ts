import { formatAmount } from '../../core/format/money-format';
import { type Money, money } from '../../core/types/money';

/**
 * Calculadora estándar con aritmética en céntimos: nunca hay float en los
 * acumuladores, así que 0,1 + 0,2 da 0,30 exacto. La división es la única
 * operación que redondea, y lo hace al céntimo al cerrar la operación.
 */

export type Operator = '+' | '−' | '×' | '÷';
export type CalcKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | ','
  | Operator
  | '='
  | 'C'
  | '±'
  | '%'
  | 'backspace';

export interface HistoryEntry {
  readonly id: number;
  /** «1.884,37 ÷ 30», con los operandos tal como se teclearon. */
  readonly expression: string;
  readonly result: Money;
}

export interface CalcState {
  /** Cifra que se está tecleando o resultado en pantalla. */
  readonly display: string;
  /** Línea superior: «1.884,37 ÷ 30 =» mientras hay operación en curso. */
  readonly expression: string;
  readonly result: Money;
  readonly history: readonly HistoryEntry[];
  readonly error: string | null;
}

const MAX_DIGITS = 12;
const MAX_HISTORY = 20;

export const INITIAL_STATE: CalcState = {
  display: '0',
  expression: '',
  result: money(0),
  history: [],
  error: null,
};

interface Internal {
  /** Cifra en curso tal como se teclea («72,41»). */
  readonly entry: string;
  readonly accumulator: Money | null;
  readonly operator: Operator | null;
  /** El display muestra un resultado, no una entrada en curso. */
  readonly showsResult: boolean;
  /** Texto del operando izquierdo tal como se tecleó, para la expresión. */
  readonly leftText: string;
}

const OPERATORS: readonly Operator[] = ['+', '−', '×', '÷'];

function isOperator(key: CalcKey): key is Operator {
  return (OPERATORS as readonly string[]).includes(key);
}

const INITIAL_INTERNAL: Internal = { entry: '', accumulator: null, operator: null, showsResult: false, leftText: '' };

/** «1.884,37» → 188437 céntimos. Cadena vacía → 0. */
export function parseEntry(entry: string): Money {
  if (!entry) return money(0);
  const negative = entry.startsWith('-') || entry.startsWith('−');
  const clean = (negative ? entry.slice(1) : entry).replace(/\./g, '');
  const [whole = '0', decimals = ''] = clean.split(',');
  const cents = Number(whole || '0') * 100 + Number(decimals.padEnd(2, '0').slice(0, 2) || '0');
  return money(negative ? -cents : cents);
}

/** Texto que se muestra mientras se teclea, con punto de millar. */
function formatEntry(entry: string): string {
  if (!entry) return '0';
  const negative = entry.startsWith('-');
  const body = negative ? entry.slice(1) : entry;
  const [whole = '', decimals] = body.split(',');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') || '0';
  const text = decimals === undefined ? grouped : `${grouped},${decimals}`;
  return negative ? `−${text}` : text;
}

function digitsOf(entry: string): number {
  return entry.replace(/[-.,−]/g, '').length;
}

function apply(a: Money, operator: Operator, b: Money): { readonly value: Money; readonly error: string | null } {
  switch (operator) {
    case '+':
      return { value: money(a + b), error: null };
    case '−':
      return { value: money(a - b), error: null };
    case '×':
      // (a/100) × (b/100) en céntimos = a × b / 100.
      return { value: money(Math.round((a * b) / 100)), error: null };
    case '÷':
      if (b === 0) return { value: money(0), error: 'No se puede dividir entre cero.' };
      return { value: money(Math.round((a * 100) / b)), error: null };
  }
}

/**
 * Motor de la calculadora. Cada tecla devuelve un estado nuevo, de modo que
 * la UI puede guardarlo en una signal sin copias defensivas.
 */
export class CalculatorEngine {
  private internal: Internal = INITIAL_INTERNAL;
  private state: CalcState = INITIAL_STATE;
  private nextId = 1;

  snapshot(): CalcState {
    return this.state;
  }

  reset(): void {
    this.internal = INITIAL_INTERNAL;
    this.state = { ...INITIAL_STATE, history: this.state.history };
  }

  clearHistory(): void {
    this.state = { ...this.state, history: [] };
  }

  /**
   * Añade una operación al historial sin tocar el display: lo usa la pestaña
   * financiera, cuyas cuentas también aparecen en el historial del handoff
   * («21 % de 2.412,68 → 506,66»).
   */
  record(expression: string, result: Money): CalcState {
    this.state = {
      ...this.state,
      history: [{ id: this.nextId++, expression, result }, ...this.state.history].slice(0, MAX_HISTORY),
    };
    return this.state;
  }

  /** Carga un valor en el display (resultado reutilizado del historial). */
  load(value: Money): CalcState {
    this.internal = { ...INITIAL_INTERNAL, showsResult: true };
    this.state = { ...this.state, display: formatAmount(value, 'auto'), expression: '', result: value, error: null };
    return this.state;
  }

  press(key: CalcKey): CalcState {
    const before = this.internal;

    if (key === 'C') {
      this.reset();
      return this.state;
    }

    if (key >= '0' && key <= '9') {
      const entry = before.showsResult || before.entry === '' ? (key === '0' ? '0' : key) : before.entry + key;
      if (digitsOf(entry) > MAX_DIGITS) return this.state;
      this.internal = { ...before, entry: entry === '0' ? '' : entry, showsResult: false };
      return this.render();
    }

    if (key === ',') {
      const base = before.showsResult || before.entry === '' ? '0' : before.entry;
      if (base.includes(',')) return this.state;
      this.internal = { ...before, entry: `${base},`, showsResult: false };
      return this.render();
    }

    if (key === 'backspace') {
      if (before.showsResult) return this.state;
      this.internal = { ...before, entry: before.entry.slice(0, -1) };
      return this.render();
    }

    if (key === '±') {
      if (before.showsResult) return this.load(money(-this.state.result));
      const entry = before.entry.startsWith('-') ? before.entry.slice(1) : `-${before.entry || '0'}`;
      this.internal = { ...before, entry };
      return this.render();
    }

    if (key === '%') {
      // El valor en pantalla pasa a ser su centésima parte (21 → 0,21).
      const current = before.showsResult ? this.state.result : parseEntry(before.entry);
      return this.load(money(Math.round(current / 100)));
    }

    if (key === '=') return this.equals();
    if (!isOperator(key)) return this.state;

    // Operador: cierra la operación pendiente y encadena.
    const current = before.showsResult ? this.state.result : parseEntry(before.entry);
    if (before.operator !== null && before.accumulator !== null && !before.showsResult && before.entry !== '') {
      const { value, error } = apply(before.accumulator, before.operator, current);
      if (error) return this.fail(error);
      const text = formatAmount(value, 'auto');
      this.internal = { entry: '', accumulator: value, operator: key, showsResult: true, leftText: text };
      this.state = { ...this.state, display: text, result: value, expression: `${text} ${key}`, error: null };
      return this.state;
    }
    const text = before.showsResult ? this.state.display : formatEntry(before.entry);
    this.internal = { entry: '', accumulator: current, operator: key, showsResult: true, leftText: text };
    this.state = { ...this.state, display: text, result: current, expression: `${text} ${key}`, error: null };
    return this.state;
  }

  private equals(): CalcState {
    const { accumulator, operator, entry, showsResult, leftText } = this.internal;
    if (operator === null || accumulator === null) {
      return this.load(showsResult ? this.state.result : parseEntry(entry));
    }
    const usesDisplay = entry === '' && showsResult;
    const right = usesDisplay ? this.state.result : parseEntry(entry);
    const { value, error } = apply(accumulator, operator, right);
    if (error) return this.fail(error);

    const rightText = usesDisplay ? this.state.display : formatEntry(entry);
    const expression = `${leftText || formatAmount(accumulator, 'auto')} ${operator} ${rightText}`;
    this.internal = { ...INITIAL_INTERNAL, showsResult: true };
    this.state = {
      display: formatAmount(value, 'auto'),
      expression: `${expression} =`,
      result: value,
      history: [{ id: this.nextId++, expression, result: value }, ...this.state.history].slice(0, MAX_HISTORY),
      error: null,
    };
    return this.state;
  }

  private fail(message: string): CalcState {
    this.internal = { ...INITIAL_INTERNAL, showsResult: true };
    this.state = { ...this.state, display: '0', expression: '', result: money(0), error: message };
    return this.state;
  }

  private render(): CalcState {
    const { entry, accumulator, operator, leftText } = this.internal;
    const expression = operator && accumulator !== null ? `${leftText || formatAmount(accumulator, 'auto')} ${operator}` : '';
    this.state = { ...this.state, display: formatEntry(entry), expression, result: parseEntry(entry), error: null };
    return this.state;
  }
}

/** Tecla equivalente a una pulsación de teclado físico, o `null`. */
export function keyFromKeyboard(key: string): CalcKey | null {
  if (key >= '0' && key <= '9') return key as CalcKey;
  switch (key) {
    case ',':
    case '.':
      return ',';
    case '+':
      return '+';
    case '-':
      return '−';
    case '*':
    case 'x':
    case 'X':
      return '×';
    case '/':
      return '÷';
    case 'Enter':
    case '=':
      return '=';
    case 'Backspace':
      return 'backspace';
    case 'Delete':
      return 'C';
    case '%':
      return '%';
    default:
      return null;
  }
}
