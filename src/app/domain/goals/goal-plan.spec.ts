import { isoDate } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { computeGoalPlan, contributionPer, projectedDays, timeLeft, toMonthly } from './goal-plan';

const goal = {
  targetCents: money(1_200_000),
  startDate: isoDate(2026, 1, 1),
  targetDate: isoDate(2027, 1, 1),
  status: 'active' as const,
};

describe('goal-plan', () => {
  it('desglosa el tiempo que queda', () => {
    const t = timeLeft(isoDate(2026, 10, 28), isoDate(2028, 1, 21));
    expect(t.days).toBe(450);
    expect(t.months).toBe(14.8);
    expect(t.years).toBe(1.2);
    expect(t.parts.years).toBe(1);
    expect(t.parts.months).toBe(2);
  });

  it('reparte lo que falta por día, semana, mes y año redondeando hacia arriba', () => {
    const per = contributionPer(money(1_200_000), 365);
    expect(per.daily).toBe(3288);
    expect(per.weekly).toBe(23014);
    expect(per.monthly).toBe(100069);
    expect(per.yearly).toBe(1_200_000);
  });

  it('con menos de un periodo por delante, toca aportar todo lo que falta', () => {
    expect(contributionPer(money(50_000), 10).monthly).toBe(50_000);
  });

  it('sabe si vas por delante o por detrás del plan lineal', () => {
    const mid = isoDate(2026, 7, 2);
    expect(computeGoalPlan(goal, money(800_000), mid).health).toBe('ahead');
    expect(computeGoalPlan(goal, money(600_000), mid).health).toBe('on_track');
    expect(computeGoalPlan(goal, money(300_000), mid).health).toBe('behind');
    expect(computeGoalPlan(goal, money(1_200_000), mid).health).toBe('achieved');
    expect(computeGoalPlan(goal, money(10_000), isoDate(2027, 2, 1)).health).toBe('overdue');
  });

  it('calcula avance y lo que falta', () => {
    const plan = computeGoalPlan(goal, money(300_000), isoDate(2026, 4, 1));
    expect(plan.remaining).toBe(900_000);
    expect(plan.progressBp).toBe(2500);
  });

  it('proyecta cuándo se llega con un aporte dado y convierte a mensual', () => {
    expect(projectedDays(money(100_000), money(25_000), 'monthly')).toBe(122);
    expect(projectedDays(money(100_000), money(0), 'monthly')).toBeNull();
    expect(toMonthly(money(1000), 'weekly')).toBe(4348);
    expect(toMonthly(money(12000), 'yearly')).toBe(1000);
  });
});
