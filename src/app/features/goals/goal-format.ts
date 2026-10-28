import { formatMoney } from '../../core/format/money-format';
import type { GoalHealth, TimeLeft } from '../../domain/goals/goal-plan';
import type { Money } from '../../core/types/money';

const n1 = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** «450 días · 14,8 meses · 1,2 años». */
export function timeLeftShort(t: TimeLeft): string {
  if (t.days <= 0) return 'Fecha alcanzada';
  return `${t.days === 1 ? '1 día' : `${t.days} días`} · ${n1(t.months)} meses · ${n1(t.years)} años`;
}

/** «1 año, 2 meses y 24 días». */
export function timeLeftLong(t: TimeLeft): string {
  const { years, months, days } = t.parts;
  const parts: string[] = [];
  if (years) parts.push(years === 1 ? '1 año' : `${years} años`);
  if (months) parts.push(months === 1 ? '1 mes' : `${months} meses`);
  if (days || parts.length === 0) parts.push(days === 1 ? '1 día' : `${days} días`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

export const HEALTH_LABEL: Readonly<Record<GoalHealth, string>> = {
  achieved: 'Conseguido',
  ahead: 'Por delante',
  on_track: 'En el plan',
  behind: 'Por detrás',
  overdue: 'Fuera de plazo',
};

/** «Llevas 120,00 € más de lo previsto a día de hoy». */
export function healthText(health: GoalHealth, vsPlan: Money, remaining: Money): string {
  switch (health) {
    case 'achieved':
      return 'Ya tienes todo el importe.';
    case 'ahead':
      return `Llevas ${formatMoney(vsPlan)} más de lo previsto a día de hoy.`;
    case 'on_track':
      return 'Vas al ritmo previsto.';
    case 'behind':
      return `Te faltan ${formatMoney((-vsPlan) as Money)} para ir al ritmo previsto.`;
    case 'overdue':
      return `La fecha ya pasó y faltan ${formatMoney(remaining)}. Mueve la fecha o el importe.`;
  }
}
