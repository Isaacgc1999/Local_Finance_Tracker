import { validationError } from '../errors/app-error';
import { type Result, err, ok } from './result';

/**
 * Fecha de calendario como texto ISO 'YYYY-MM-DD'. Es el único formato de
 * fecha que existe en la capa de datos y en el dominio; `Date` solo aparece
 * dentro de este fichero. Todo el cálculo se hace en UTC sobre componentes
 * para que el horario de verano no mueva ningún día.
 */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function build(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as IsoDate;
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parseIsoDate(value: string, field = 'date'): Result<IsoDate> {
  return isIsoDate(value) ? ok(value) : err(validationError(field, 'Fecha no válida.'));
}

/** Construye una fecha. Lanza solo ante un error de programación (fecha imposible). */
export function isoDate(year: number, month: number, day: number): IsoDate {
  const s = build(year, month, day);
  if (!isIsoDate(s)) throw new TypeError(`Fecha inválida: ${s}`);
  return s;
}

export function year(d: IsoDate): number {
  return Number(d.slice(0, 4));
}

export function month(d: IsoDate): number {
  return Number(d.slice(5, 7));
}

export function day(d: IsoDate): number {
  return Number(d.slice(8, 10));
}

function utc(d: IsoDate): number {
  return Date.UTC(year(d), month(d) - 1, day(d));
}

function fromUtc(ms: number): IsoDate {
  const dt = new Date(ms);
  return build(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Fecha local de hoy (la del reloj del usuario, no UTC). */
export function todayIso(now: Date = new Date()): IsoDate {
  return build(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Marca temporal completa para `created_at` / `updated_at` / `generated_at`. */
export function nowIsoTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromUtc(utc(d) + n * 86_400_000);
}

export function addWeeks(d: IsoDate, n: number): IsoDate {
  return addDays(d, n * 7);
}

/**
 * Suma meses conservando el día pedido y recortándolo al último día del mes
 * de destino (31 → 30, 31 → 28/29). Política del motor de recurrencias.
 */
export function addMonthsClamped(d: IsoDate, n: number, dayOfMonth: number = day(d)): IsoDate {
  const total = year(d) * 12 + (month(d) - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return build(y, m, Math.min(dayOfMonth, daysInMonth(y, m)));
}

/** Suma años conservando mes y día, recortando el 29 de febrero. */
export function addYearsClamped(d: IsoDate, n: number, dayOfMonth: number = day(d)): IsoDate {
  const y = year(d) + n;
  const m = month(d);
  return build(y, m, Math.min(dayOfMonth, daysInMonth(y, m)));
}

export function startOfMonth(d: IsoDate): IsoDate {
  return build(year(d), month(d), 1);
}

export function endOfMonth(d: IsoDate): IsoDate {
  return build(year(d), month(d), daysInMonth(year(d), month(d)));
}

export function startOfYear(d: IsoDate): IsoDate {
  return build(year(d), 1, 1);
}

export function endOfYear(d: IsoDate): IsoDate {
  return build(year(d), 12, 31);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function weekdayIso(d: IsoDate): number {
  const wd = new Date(utc(d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function startOfIsoWeek(d: IsoDate): IsoDate {
  return addDays(d, 1 - weekdayIso(d));
}

export function endOfIsoWeek(d: IsoDate): IsoDate {
  return addDays(d, 7 - weekdayIso(d));
}

/**
 * Semana ISO 8601 (lunes a domingo; la semana 1 es la que contiene el primer
 * jueves del año). Aritmética pura sobre días UTC: sin Date ni librerías.
 */
export function isoWeek(d: IsoDate): { readonly year: number; readonly week: number } {
  const thursday = utc(d) + (4 - weekdayIso(d)) * 86_400_000;
  const isoYear = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.floor((thursday - jan1) / 86_400_000 / 7) + 1;
  return { year: isoYear, week };
}

/** Días de calendario de `a` a `b` (negativo si `b` es anterior). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function compareIso(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Inclusivo por ambos extremos. */
export function isBetween(d: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return d >= from && d <= to;
}

/** 'YYYY-MM' para agrupar por mes. */
export function monthKey(d: IsoDate): string {
  return d.slice(0, 7);
}

/** 'YYYY-Www' para agrupar por semana ISO. */
export function isoWeekKey(d: IsoDate): string {
  const { year: y, week } = isoWeek(d);
  return `${pad(y, 4)}-W${pad(week, 2)}`;
}

export interface DateRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export function monthRange(d: IsoDate): DateRange {
  return { from: startOfMonth(d), to: endOfMonth(d) };
}

export function isoWeekRange(d: IsoDate): DateRange {
  return { from: startOfIsoWeek(d), to: endOfIsoWeek(d) };
}

export function rangeLengthDays(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}
