import { type AppError, type ValidationError, validationError } from '../../core/errors/app-error';
import type { Event, EventDraft, EventPatch } from '../../core/types/event';
import { type IsoDate, isIsoDate } from '../../core/types/iso-date';
import type { Recurrence, RecurrenceDraft } from '../../core/types/recurrence';
import { type Result, err, ok } from '../../core/types/result';
import type { Repositories } from '../../data/repositories';
import { dueInstances } from '../recurrence/recurrence.service';

/**
 * Validación del borrador según el handoff («importe > 0, categoría
 * obligatoria en gasto, ticker obligatorio en inversión») y las reglas del
 * modelo. Devuelve todos los errores a la vez para pintarlos en el formulario.
 */
export function validateEventDraft(draft: EventDraft): Result<EventDraft, readonly ValidationError[]> {
  const errors: ValidationError[] = [];
  if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0) {
    errors.push(validationError('amount', 'El importe tiene que ser mayor que cero.'));
  }
  if (!isIsoDate(draft.date)) errors.push(validationError('date', 'Fecha no válida.'));
  if (!draft.concept.trim()) errors.push(validationError('concept', 'El concepto es obligatorio.'));
  if (draft.type === 'expense' && !draft.categoryId) {
    errors.push(validationError('category', 'Elige una categoría.'));
  }
  if (draft.type !== 'expense' && draft.nature !== null) {
    errors.push(validationError('nature', 'La naturaleza solo aplica a gastos.'));
  }
  if (draft.type === 'investment' && !(draft.meta?.type === 'investment' && draft.meta.ticker.trim())) {
    errors.push(validationError('ticker', 'Indica el activo o ticker.'));
  }
  return errors.length ? err(errors) : ok({ ...draft, concept: draft.concept.trim() });
}

export type CreateResult = { readonly event: Event; readonly recurrence: Recurrence | null };

/** Casos de uso sobre movimientos. Depende de los repositorios, no de Angular. */
export class EventService {
  constructor(private readonly repos: Repositories) {}

  /**
   * Crea el movimiento y, si viene una regla, la regla. El movimiento pasa a
   * ser la primera instancia materializada de la regla (misma fecha).
   */
  async create(draft: EventDraft, recurrence: RecurrenceDraft | null = null): Promise<Result<CreateResult, AppError | readonly ValidationError[]>> {
    const valid = validateEventDraft(draft);
    if (!valid.ok) return valid;

    let rule: Recurrence | null = null;
    if (recurrence) {
      const inserted = await this.repos.recurrences.insert({ ...recurrence, startDate: valid.value.date });
      if (!inserted.ok) return inserted;
      rule = inserted.value;
    }

    const event = await this.repos.events.insert({ ...valid.value, recurrenceId: rule?.id ?? null });
    if (!event.ok) {
      if (rule) await this.repos.recurrences.delete(rule.id); // compensación: sin regla huérfana
      return event;
    }
    return ok({ event: event.value, recurrence: rule });
  }

  async update(current: Event, patch: EventPatch): Promise<Result<Event, AppError | readonly ValidationError[]>> {
    const valid = validateEventDraft({ ...current, ...patch });
    if (!valid.ok) return valid;
    return this.repos.events.update(current.id, { ...patch, concept: valid.value.concept });
  }

  remove(id: string): Promise<Result<void>> {
    return this.repos.events.delete(id);
  }

  /**
   * Materializa las ocurrencias vencidas de todas las reglas activas hasta
   * `today`. Idempotente (índice único regla+fecha); nunca toca filas existentes.
   */
  async materializeDue(today: IsoDate): Promise<Result<{ readonly inserted: number }>> {
    const rules = await this.repos.recurrences.findAll({ activeOnly: true });
    if (!rules.ok) return rules;
    let inserted = 0;
    for (const rule of rules.value) {
      if (rule.startDate > today) continue;
      const done = await this.repos.events.materializedDates(rule.id, { from: rule.startDate, to: today });
      if (!done.ok) return done;
      const drafts = dueInstances(rule, today, done.value);
      if (drafts.length === 0) continue;
      const result = await this.repos.events.insertManyIfAbsent(drafts);
      if (!result.ok) return result;
      inserted += result.value.inserted;
    }
    return ok({ inserted });
  }
}
