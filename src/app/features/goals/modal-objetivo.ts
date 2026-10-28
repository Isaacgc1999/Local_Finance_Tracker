import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';

import { formatAmount, formatMoney, parseMoney } from '../../core/format/money-format';
import {
  CONTRIBUTION_FREQUENCIES,
  type ContributionFrequency,
  FREQUENCY_LABEL,
  FREQUENCY_PER,
  GOAL_KINDS,
  GOAL_KIND_COLOR,
  GOAL_KIND_LABEL,
  GOAL_KIND_PLACEHOLDER,
  type Goal,
  type GoalKind,
} from '../../core/types/goal';
import { type IsoDate, addMonthsClamped, isIsoDate, todayIso } from '../../core/types/iso-date';
import { type Money, ZERO, money } from '../../core/types/money';
import { computeGoalPlan } from '../../domain/goals/goal-plan';
import { GoalsFacade } from '../../facades/goals.facade';
import { Modal } from '../../shared/components/modal/modal';
import { SegmentedControl, type SegmentOption } from '../../shared/components/segmented-control/segmented-control';
import { timeLeftLong, timeLeftShort } from './goal-format';

const TIPOS: readonly SegmentOption<GoalKind>[] = GOAL_KINDS.map((value) => ({ value, label: GOAL_KIND_LABEL[value] }));
const FRECUENCIAS: readonly SegmentOption<ContributionFrequency>[] = CONTRIBUTION_FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABEL[value] }));

/**
 * Alta y edición de un objetivo. Mientras se escribe, calcula al momento
 * cuánto tiempo hay y cuánto toca apartar al día, a la semana, al mes y al
 * año, para ajustar la fecha o el importe antes de guardar.
 */
@Component({
  selector: 'ft-modal-objetivo',
  imports: [Modal, SegmentedControl],
  templateUrl: './modal-objetivo.html',
  styleUrl: './goals-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalObjetivo {
  readonly abierto = model<boolean>(false);
  readonly objetivo = input<Goal | null>(null);
  /** Lo ya ahorrado del objetivo que se edita (para la vista previa). */
  readonly ahorrado = input<Money>(ZERO);

  private readonly facade = inject(GoalsFacade);

  protected readonly tipos = TIPOS;
  protected readonly frecuencias = FRECUENCIAS;
  protected readonly perLabel = FREQUENCY_PER;
  protected readonly freqLabel = FREQUENCY_LABEL;
  protected readonly ordenFrecuencias = CONTRIBUTION_FREQUENCIES;

  protected readonly tipo = signal<GoalKind>('purchase');
  protected readonly nombre = signal('');
  protected readonly importeTexto = signal('');
  protected readonly yaTexto = signal('');
  protected readonly inicio = signal<string>(todayIso());
  protected readonly fin = signal<string>(addMonthsClamped(todayIso(), 12));
  protected readonly frecuencia = signal<ContributionFrequency>('monthly');
  protected readonly notas = signal('');
  protected readonly guardando = signal(false);
  protected readonly errorTexto = signal('');
  protected readonly confirmandoBorrado = signal(false);

  protected readonly edicion = computed(() => this.objetivo() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar objetivo' : 'Nuevo objetivo'));
  protected readonly placeholder = computed(() => GOAL_KIND_PLACEHOLDER[this.tipo()]);

  private readonly importe = computed(() => parseOptional(this.importeTexto()));
  private readonly ya = computed(() => (this.edicion() ? this.ahorrado() : (parseOptional(this.yaTexto()) ?? ZERO)));

  /** Cálculo rápido con lo que hay escrito. */
  protected readonly vista = computed(() => {
    const target = this.importe();
    const inicio = this.inicio();
    const fin = this.fin();
    if (!target || target <= 0 || !isIsoDate(inicio) || !isIsoDate(fin) || fin <= inicio) return null;
    const hoy = todayIso();
    const plan = computeGoalPlan({ targetCents: target, startDate: inicio, targetDate: fin, status: 'active' }, this.ya(), hoy < inicio ? inicio : hoy);
    return {
      plan,
      tiempo: timeLeftShort(plan.timeLeft),
      tiempoLargo: timeLeftLong(plan.timeLeft),
      filas: CONTRIBUTION_FREQUENCIES.map((f) => ({ f, label: FREQUENCY_LABEL[f], valor: formatMoney(plan.per[f]) })),
      falta: formatMoney(plan.remaining),
    };
  });

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const g = this.objetivo();
      this.tipo.set(g?.kind ?? 'purchase');
      this.nombre.set(g?.name ?? '');
      this.importeTexto.set(g ? formatAmount(g.targetCents, 'never') : '');
      this.yaTexto.set('');
      this.inicio.set(g?.startDate ?? todayIso());
      this.fin.set(g?.targetDate ?? addMonthsClamped(todayIso(), 12));
      this.frecuencia.set(g?.frequency ?? 'monthly');
      this.notas.set(g?.notes ?? '');
      this.errorTexto.set('');
      this.confirmandoBorrado.set(false);
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected async guardar(): Promise<void> {
    const target = this.importe();
    if (!target || target <= 0) return this.errorTexto.set('Escribe el importe del objetivo.');
    const inicio = this.inicio();
    const fin = this.fin();
    if (!isIsoDate(inicio) || !isIsoDate(fin)) return this.errorTexto.set('Revisa las fechas.');
    const ya = this.edicion() ? ZERO : parseOptional(this.yaTexto());
    if (!this.edicion() && this.yaTexto().trim() && ya === null) return this.errorTexto.set('Lo ya ahorrado no es un importe válido.');
    this.guardando.set(true);
    const datos = {
      name: this.nombre(),
      kind: this.tipo(),
      targetCents: target,
      startDate: inicio as IsoDate,
      targetDate: fin as IsoDate,
      frequency: this.frecuencia(),
      color: GOAL_KIND_COLOR[this.tipo()],
      notes: this.notas().trim() || null,
    };
    const actual = this.objetivo();
    const result = actual ? await this.facade.update(actual.id, datos) : await this.facade.create({ ...datos, status: 'active' }, ya ?? ZERO);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
    else this.errorTexto.set(result.error.kind === 'validation' ? result.error.message : 'No se pudo guardar.');
  }

  protected async borrar(): Promise<void> {
    const actual = this.objetivo();
    if (!actual) return;
    if (!this.confirmandoBorrado()) {
      this.confirmandoBorrado.set(true);
      return;
    }
    this.guardando.set(true);
    const result = await this.facade.remove(actual.id);
    this.guardando.set(false);
    if (result.ok) this.abierto.set(false);
  }
}

function parseOptional(text: string): Money | null {
  const t = text.trim();
  if (!t) return null;
  const parsed = parseMoney(t);
  return parsed.ok ? money(Math.abs(parsed.value)) : null;
}
