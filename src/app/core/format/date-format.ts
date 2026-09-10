import {
  type DateRange,
  type IsoDate,
  day,
  endOfIsoWeek,
  isoWeek,
  month,
  weekdayIso,
  year,
} from '../types/iso-date';

export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD';

export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** Abreviaturas de metadatos y ejes («8 sep», «Abr»). */
export const MESES_CORTO = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** Abreviaturas de cabecera compacta («Sept. 2026», frame 768 del handoff). */
const MESES_TITULO_CORTO = [
  'Ene.',
  'Feb.',
  'Mar.',
  'Abr.',
  'May.',
  'Jun.',
  'Jul.',
  'Ago.',
  'Sept.',
  'Oct.',
  'Nov.',
  'Dic.',
] as const;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function mesCorto(d: IsoDate): string {
  return MESES_CORTO[month(d) - 1] ?? '';
}

/** «08/09/2026» o «2026-09-08» según el ajuste del usuario. */
export function formatDate(d: IsoDate, format: DateFormat = 'DD/MM/YYYY'): string {
  return format === 'YYYY-MM-DD' ? d : `${pad2(day(d))}/${pad2(month(d))}/${year(d)}`;
}

/** «9 sep» (pill «Hoy», meta de fila). */
export function formatDayMonth(d: IsoDate): string {
  return `${day(d)} ${mesCorto(d)}`;
}

/** «8 sep 2026». */
export function formatDayMonthYear(d: IsoDate): string {
  return `${day(d)} ${mesCorto(d)} ${year(d)}`;
}

/** «Septiembre 2026» (escritorio) o «Sept. 2026» (compacto). */
export function formatMonthYear(d: IsoDate, style: 'long' | 'short' = 'long'): string {
  const m = month(d) - 1;
  return style === 'short'
    ? `${MESES_TITULO_CORTO[m]} ${year(d)}`
    : `${capitalize(MESES[m] ?? '')} ${year(d)}`;
}

/** «Sep» para ejes de gráficos. */
export function formatMonthAxis(d: IsoDate): string {
  return capitalize(mesCorto(d));
}

/** «01/04/2026 — 30/09/2026». En compacto «01/04 — 30/09/2026». */
export function formatRange(range: DateRange, format: DateFormat = 'DD/MM/YYYY', compact = false): string {
  if (compact && format === 'DD/MM/YYYY') {
    return `${pad2(day(range.from))}/${pad2(month(range.from))} — ${formatDate(range.to, format)}`;
  }
  return `${formatDate(range.from, format)} — ${formatDate(range.to, format)}`;
}

/** «Semana 36 · 1–7 sep 2026» (o «31 ago–6 sep 2026» si cruza de mes). */
export function formatWeekLabel(weekStart: IsoDate): string {
  const weekEnd = endOfIsoWeek(weekStart);
  const { week } = isoWeek(weekStart);
  const sameMonth = month(weekStart) === month(weekEnd) && year(weekStart) === year(weekEnd);
  const days = sameMonth
    ? `${day(weekStart)}–${day(weekEnd)} ${mesCorto(weekEnd)} ${year(weekEnd)}`
    : `${formatDayMonth(weekStart)}–${formatDayMonth(weekEnd)} ${year(weekEnd)}`;
  return `Semana ${week} · ${days}`;
}

/** Marca temporal ISO completa → «8 sep, 23:14» (hora local). */
export function formatDateTime(isoTimestamp: string): string {
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return '—';
  const mes = MESES_CORTO[dt.getMonth()] ?? '';
  return `${dt.getDate()} ${mes}, ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

/** «hace 2 h», «hace 5 min», «ahora», «hace 3 d». */
export function formatRelative(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMin = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} d`;
}

/** «en 5 días», «hoy», «mañana». */
export function formatInDays(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}

/** Duración en segundos → «34 s», «1 min 12 s». */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

/** «Martes 8 sep» para cabeceras de grupo por día. */
export function formatWeekdayDayMonth(d: IsoDate): string {
  const nombre = DIAS_SEMANA[weekdayIso(d) - 1] ?? '';
  return `${capitalize(nombre)} ${formatDayMonth(d)}`;
}
