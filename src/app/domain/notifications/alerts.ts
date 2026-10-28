import { type IsoDate, addDays, daysBetween, monthKey } from '../../core/types/iso-date';
import type { Money } from '../../core/types/money';
import type { Recurrence } from '../../core/types/recurrence';
import { nextOccurrence } from '../recurrence/recurrence.service';

/** Un aviso del sistema. `key` lo identifica para no enviarlo dos veces. */
export interface Alert {
  readonly key: string;
  readonly title: string;
  readonly body: string;
}

export interface AlertGoal {
  readonly id: string;
  readonly name: string;
  readonly targetDate: IsoDate;
  readonly status: 'active' | 'achieved' | 'archived';
  readonly achieved: boolean;
  readonly remaining: Money;
}

export interface AlertHolding {
  readonly name: string;
  readonly lastUpdate: IsoDate | null;
}

export interface AlertInput {
  readonly today: IsoDate;
  readonly format: (amount: Money) => string;
  /** Reglas recurrentes; se avisa de las salidas que tocan mañana. */
  readonly recurrences: readonly Recurrence[];
  /** Mes financiero en curso cuando se usa el mes de nómina; `null` con el mes natural. */
  readonly paydayMonth: { readonly label: IsoDate; readonly from: IsoDate; readonly name: string } | null;
  /** Gasto del mes en curso frente al presupuesto total; `null` sin presupuesto. */
  readonly budget: { readonly label: IsoDate; readonly outflow: Money; readonly target: Money; readonly projectedClose: Money | null } | null;
  readonly goals: readonly AlertGoal[];
  readonly holdings: readonly AlertHolding[];
  readonly lastBackupAt: string | null;
}

/** Días antes de la fecha límite de un objetivo a los que se avisa. */
export const GOAL_DEADLINE_NOTICE_DAYS = 7;
/** Días sin actualizar a partir de los que se recuerda poner el valor de las inversiones. */
export const STALE_HOLDING_DAYS = 30;
/** Días sin copia de seguridad a partir de los que se recuerda hacer una. */
export const STALE_BACKUP_DAYS = 30;

/**
 * Avisos que tocan hoy. Función pura: quien llama filtra los ya enviados
 * (por `key`) y los manda al sistema. Las claves llevan la fecha o el mes
 * para que el mismo aviso vuelva a salir solo cuando corresponde.
 */
export function pendingAlerts(input: AlertInput): readonly Alert[] {
  const { today, format } = input;
  const out: Alert[] = [];
  const tomorrow = addDays(today, 1);

  const charges = input.recurrences.filter((r) => r.type !== 'income' && nextOccurrence(r, today) === tomorrow);
  if (charges.length === 1) {
    const r = charges[0]!;
    out.push({ key: `charge:${r.id}:${tomorrow}`, title: 'Cargo mañana', body: `${r.concept}: ${format(r.amountCents)}.` });
  } else if (charges.length > 1) {
    const total = charges.reduce((s, r) => s + r.amountCents, 0) as Money;
    out.push({
      key: `charges:${tomorrow}`,
      title: `${charges.length} cargos mañana`,
      body: `${charges.map((r) => r.concept).join(', ')}. Total ${format(total)}.`,
    });
  }

  const p = input.paydayMonth;
  if (p && daysBetween(p.from, today) >= 0 && daysBetween(p.from, today) <= 2) {
    out.push({ key: `payday:${monthKey(p.label)}`, title: 'Nómina recibida', body: `Empieza tu mes de ${p.name}. Buen momento para apartar el ahorro.` });
  }

  const b = input.budget;
  if (b && b.target > 0) {
    const month = monthKey(b.label);
    const used = b.outflow / b.target;
    if (used >= 1) {
      out.push({ key: `budget100:${month}`, title: 'Presupuesto superado', body: `Llevas ${format(b.outflow)} de ${format(b.target)} este mes.` });
    } else if (used >= 0.8) {
      out.push({ key: `budget80:${month}`, title: 'Presupuesto al 80 %', body: `Llevas ${format(b.outflow)} de ${format(b.target)}; quedan ${format((b.target - b.outflow) as Money)}.` });
    } else if (b.projectedClose !== null && b.projectedClose > b.target) {
      out.push({ key: `budgetpace:${month}`, title: 'Vas por encima del ritmo', body: `A este paso cerrarás el mes en ${format(b.projectedClose)}, por encima de ${format(b.target)}.` });
    }
  }

  for (const g of input.goals) {
    if (g.status !== 'active') continue;
    if (g.achieved) {
      out.push({ key: `goal-reached:${g.id}`, title: 'Objetivo conseguido', body: `Ya tienes todo lo de «${g.name}». Márcalo como conseguido.` });
      continue;
    }
    const left = daysBetween(today, g.targetDate);
    if (left >= 0 && left <= GOAL_DEADLINE_NOTICE_DAYS) {
      out.push({
        key: `goal-deadline:${g.id}:${g.targetDate}`,
        title: left === 0 ? 'Hoy vence un objetivo' : `Quedan ${left} días para un objetivo`,
        body: `A «${g.name}» le faltan ${format(g.remaining)}.`,
      });
    }
  }

  const stale = input.holdings.filter((h) => h.lastUpdate !== null && daysBetween(h.lastUpdate, today) > STALE_HOLDING_DAYS);
  if (stale.length > 0) {
    out.push({
      key: `holdings-stale:${monthKey(today)}`,
      title: 'Actualiza tus inversiones',
      body: stale.length === 1 ? `«${stale[0]!.name}» lleva más de ${STALE_HOLDING_DAYS} días sin valor nuevo.` : `${stale.length} inversiones llevan más de ${STALE_HOLDING_DAYS} días sin valor nuevo.`,
    });
  }

  const backupDay = input.lastBackupAt ? (input.lastBackupAt.slice(0, 10) as IsoDate) : null;
  if (backupDay === null || daysBetween(backupDay, today) > STALE_BACKUP_DAYS) {
    out.push({
      key: `backup:${monthKey(today)}`,
      title: 'Haz una copia de seguridad',
      body: backupDay === null ? 'Aún no has hecho ninguna: Ajustes → Crear copia de seguridad.' : `La última es de hace más de ${STALE_BACKUP_DAYS} días.`,
    });
  }

  return out;
}
