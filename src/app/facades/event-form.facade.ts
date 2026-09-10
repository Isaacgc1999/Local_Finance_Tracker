import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { map, startWith } from 'rxjs';

import { type AppError, type ValidationError, describeError } from '../core/errors/app-error';
import { FREQUENCY_LABEL } from '../core/types/recurrence';
import { formatDayMonth } from '../core/format/date-format';
import { formatMoney } from '../core/format/money-format';
import type { Category } from '../core/types/category';
import type { AssetClass, Event, EventDraft, EventMeta, EventType, Nature } from '../core/types/event';
import { type IsoDate, day, isIsoDate, todayIso, weekdayIso } from '../core/types/iso-date';
import type { Money } from '../core/types/money';
import type { Frequency, RecurrenceDraft } from '../core/types/recurrence';
import { type Result, err, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { FORM_STRATEGIES, type FieldKey } from '../domain/events/event-form-strategy';
import { EventService, validateEventDraft } from '../domain/events/event.service';
import { type AttachmentInfo, attachmentInfo, pickAndStoreAttachment, removeStoredAttachment } from '../infra/fs/attachments';
import { AppStatusFacade } from './app-status.facade';

export interface EventFormControls {
  amount: FormControl<Money | null>;
  date: FormControl<string>;
  categoryId: FormControl<string | null>;
  nature: FormControl<Nature>;
  paymentMethod: FormControl<string>;
  concept: FormControl<string>;
  notes: FormControl<string>;
  source: FormControl<string>;
  issuer: FormControl<string>;
  account: FormControl<string>;
  goal: FormControl<string>;
  ticker: FormControl<string>;
  platform: FormControl<string>;
  assetClass: FormControl<AssetClass | null>;
  recurrent: FormControl<boolean>;
  frequency: FormControl<Frequency>;
  endDate: FormControl<string>;
}

export type EventFormValue = ReturnType<FormGroup<EventFormControls>['getRawValue']>;

/** Campos opcionales que la estrategia activa o desactiva. */
const OPTIONAL_FIELDS: readonly (keyof EventFormControls)[] = [
  'categoryId',
  'nature',
  'paymentMethod',
  'notes',
  'source',
  'issuer',
  'account',
  'goal',
  'ticker',
  'platform',
  'assetClass',
];

const FIELD_TO_CONTROL: Partial<Record<FieldKey, keyof EventFormControls>> = {
  category: 'categoryId',
  nature: 'nature',
  paymentMethod: 'paymentMethod',
  notes: 'notes',
  source: 'source',
  issuer: 'issuer',
  account: 'account',
  goal: 'goal',
  ticker: 'ticker',
  platform: 'platform',
  assetClass: 'assetClass',
};

/**
 * Estado del formulario de evento: un FormGroup tipado (Reactive Forms, ver
 * ADR-002) cuyo valor se expone como signal; la estrategia del tipo decide
 * qué controles están activos. Se provee por instancia de formulario.
 */
@Injectable()
export class EventFormFacade {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);
  private readonly router = inject(Router);

  readonly form: FormGroup<EventFormControls> = this.fb.group({
    amount: this.fb.control<Money | null>(null),
    date: this.fb.control<string>(todayIso()),
    categoryId: this.fb.control<string | null>(null),
    nature: this.fb.control<Nature>('variable'),
    paymentMethod: this.fb.control(''),
    concept: this.fb.control(''),
    notes: this.fb.control(''),
    source: this.fb.control(''),
    issuer: this.fb.control(''),
    account: this.fb.control(''),
    goal: this.fb.control(''),
    ticker: this.fb.control(''),
    platform: this.fb.control(''),
    assetClass: this.fb.control<AssetClass | null>(null),
    recurrent: this.fb.control(false),
    frequency: this.fb.control<Frequency>('monthly'),
    endDate: this.fb.control(''),
  });

  private readonly typeSig = signal<EventType>('expense');
  private readonly editingSig = signal<Event | null>(null);
  private readonly categoriesSig = signal<readonly Category[]>([]);
  private readonly submittedSig = signal(false);
  private readonly savingSig = signal(false);
  private readonly attachmentSig = signal<AttachmentInfo | null>(null);
  private readonly saveErrorSig = signal<string>('');

  readonly type = this.typeSig.asReadonly();
  readonly editing = this.editingSig.asReadonly();
  readonly mode = computed(() => (this.editingSig() ? 'edit' : 'create'));
  readonly strategy = computed(() => FORM_STRATEGIES[this.typeSig()]);
  readonly submitted = this.submittedSig.asReadonly();
  readonly saving = this.savingSig.asReadonly();
  readonly attachment = this.attachmentSig.asReadonly();
  readonly saveError = this.saveErrorSig.asReadonly();

  /** Valor bruto del formulario como signal (incluye controles desactivados). */
  readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { requireSync: true },
  );

  readonly categories = computed(() => {
    const kind = this.strategy().categoryKind;
    return kind ? this.categoriesSig().filter((c) => c.kind === kind || c.kind === 'both') : [];
  });

  readonly recurrenceEnabled = computed(() => {
    const mode = this.strategy().recurrence;
    return mode === 'always' || (mode === 'toggle' && this.value().recurrent);
  });

  /** «Mensual · el día 14 · sin fecha de fin» (pie del bloque de aportación periódica). */
  readonly recurrenceSummary = computed(() => {
    const v = this.value();
    const date = isIsoDate(v.date) ? v.date : todayIso();
    const cuando =
      v.frequency === 'weekly'
        ? `cada ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][weekdayIso(date) - 1]}`
        : v.frequency === 'yearly'
          ? `cada ${formatDayMonth(date)}`
          : `el día ${day(date)}`;
    const fin = isIsoDate(v.endDate) ? `hasta el ${formatDayMonth(v.endDate)}` : 'sin fecha de fin';
    return `${FREQUENCY_LABEL[v.frequency]} · ${cuando} · ${fin}`;
  });

  /** Errores de validación por campo, solo tras intentar guardar. */
  readonly errors = computed<ReadonlyMap<string, string>>(() => {
    if (!this.submittedSig()) return new Map();
    const draft = this.buildDraft(this.value());
    const result = validateEventDraft(draft);
    return result.ok ? new Map() : new Map(result.error.map((e) => [e.field, e.message]));
  });

  /** Botón «Usar 62,81 en nuevo evento» de la calculadora: importe precargado. */
  readonly presetLabel = computed(() => {
    const a = this.value().amount;
    return a ? formatMoney(a) : '';
  });

  visible(field: FieldKey): boolean {
    return this.strategy().fields.includes(field);
  }

  async init(params: { readonly id?: string | undefined; readonly presetAmountCents?: string | undefined }): Promise<void> {
    await this.loadCategories();
    if (params.id) {
      await this.loadEvent(params.id);
      return;
    }
    this.setType('expense');
    const preset = Number(params.presetAmountCents);
    if (params.presetAmountCents && Number.isSafeInteger(preset) && preset > 0) {
      this.form.controls.amount.setValue(preset as Money);
    }
  }

  setType(type: EventType): void {
    if (this.editingSig()) return; // el tipo no se cambia al editar
    this.typeSig.set(type);
    this.applyStrategy(type);
  }

  async save(): Promise<Result<Event>> {
    return this.persist();
  }

  /** Guarda y reinicia conservando tipo, fecha y categoría (README + reglas). */
  async saveAndAddAnother(): Promise<Result<Event>> {
    const result = await this.persist({ stay: true });
    if (result.ok) {
      const { date, categoryId } = this.form.getRawValue();
      this.form.reset({ date, categoryId, nature: 'variable', frequency: 'monthly' });
      this.attachmentSig.set(null);
      this.submittedSig.set(false);
    }
    return result;
  }

  async remove(): Promise<Result<void>> {
    const current = this.editingSig();
    const repos = this.db.require();
    if (!current || !repos.ok) return err(repos.ok ? { kind: 'not_found', entity: 'el movimiento', id: '' } : repos.error);
    this.savingSig.set(true);
    const result = await new EventService(repos.value).remove(current.id);
    this.savingSig.set(false);
    if (result.ok) {
      if (current.attachmentPath) await removeStoredAttachment(current.attachmentPath);
      this.status.touch();
      this.status.notify('Movimiento eliminado.');
      void this.router.navigate(['/events']);
    } else {
      this.saveErrorSig.set(describeError(result.error));
    }
    return result;
  }

  cancel(): void {
    void this.router.navigate(['/events']);
  }

  async attach(): Promise<void> {
    const picked = await pickAndStoreAttachment();
    if (!picked.ok) {
      this.status.notify(describeError(picked.error), 'expense');
      return;
    }
    if (picked.value) this.attachmentSig.set(picked.value);
  }

  async detach(): Promise<void> {
    const current = this.attachmentSig();
    this.attachmentSig.set(null);
    if (current && current.path !== this.editingSig()?.attachmentPath) await removeStoredAttachment(current.path);
  }

  // ── internos ──────────────────────────────────────────────────────────

  private async persist(options: { readonly stay?: boolean } = {}): Promise<Result<Event>> {
    this.submittedSig.set(true);
    this.saveErrorSig.set('');
    const repos = this.db.require();
    if (!repos.ok) return this.failed(repos.error);

    const value = this.value();
    const draft = this.buildDraft(value);
    const service = new EventService(repos.value);
    const editing = this.editingSig();

    this.savingSig.set(true);
    const result = editing
      ? await service.update(editing, draft)
      : await service.create(draft, this.recurrenceEnabled() ? this.buildRecurrence(value, draft) : null);
    this.savingSig.set(false);

    if (!result.ok) return this.failed(result.error);
    const event = 'event' in result.value ? result.value.event : result.value;
    this.status.touch();
    this.status.notify(editing ? 'Cambios guardados.' : 'Movimiento guardado.', 'income');
    if (!options.stay) void this.router.navigate(['/events']);
    return ok(event);
  }

  private failed(error: AppError | readonly ValidationError[]): Result<Event> {
    if (Array.isArray(error)) {
      const first = error[0] as ValidationError | undefined;
      return err(first ?? { kind: 'validation', field: 'form', message: 'Revisa los campos.' });
    }
    const appError = error as AppError;
    this.saveErrorSig.set(describeError(appError));
    return err(appError);
  }

  private buildDraft(v: EventFormValue): EventDraft {
    const type = this.typeSig();
    const clean = (s: string) => (s.trim() ? s.trim() : null);
    return {
      type,
      amountCents: (v.amount ?? 0) as Money,
      date: (isIsoDate(v.date) ? v.date : '') as IsoDate,
      concept: v.concept,
      categoryId: this.visible('category') ? v.categoryId : null,
      nature: type === 'expense' ? v.nature : null,
      paymentMethod: this.visible('paymentMethod') ? clean(v.paymentMethod) : null,
      notes: this.visible('notes') ? clean(v.notes) : null,
      attachmentPath: this.attachmentSig()?.path ?? null,
      recurrenceId: this.editingSig()?.recurrenceId ?? null,
      meta: this.buildMeta(type, v),
    };
  }

  private buildMeta(type: EventType, v: EventFormValue): EventMeta {
    const opt = (s: string) => (s.trim() ? { value: s.trim() } : null);
    switch (type) {
      case 'expense':
        return { type };
      case 'income':
        return opt(v.source) ? { type, source: v.source.trim() } : { type };
      case 'subscription':
        return { type, service: v.concept.trim() };
      case 'direct_debit':
        return opt(v.issuer) ? { type, issuer: v.issuer.trim() } : { type };
      case 'saving':
        return {
          type,
          ...(opt(v.account) ? { account: v.account.trim() } : {}),
          ...(opt(v.goal) ? { goal: v.goal.trim() } : {}),
        };
      case 'investment':
        return {
          type,
          ticker: v.ticker.trim(),
          ...(opt(v.platform) ? { platform: v.platform.trim() } : {}),
          ...(v.assetClass ? { assetClass: v.assetClass } : {}),
        };
    }
  }

  private buildRecurrence(v: EventFormValue, draft: EventDraft): RecurrenceDraft {
    const date = isIsoDate(draft.date) ? draft.date : todayIso();
    return {
      type: draft.type,
      amountCents: draft.amountCents,
      categoryId: draft.categoryId,
      concept: draft.concept,
      frequency: v.frequency,
      interval: 1,
      dayOfMonth: v.frequency === 'weekly' ? null : day(date),
      weekday: v.frequency === 'weekly' ? weekdayIso(date) : null,
      startDate: date,
      endDate: isIsoDate(v.endDate) ? v.endDate : null,
      active: true,
      paymentMethod: draft.paymentMethod,
      meta: draft.meta,
    };
  }

  private applyStrategy(type: EventType): void {
    const strategy = FORM_STRATEGIES[type];
    const active = new Set<keyof EventFormControls>();
    for (const field of strategy.fields) {
      const control = FIELD_TO_CONTROL[field];
      if (control) active.add(control);
    }
    for (const name of OPTIONAL_FIELDS) {
      const control = this.form.controls[name];
      if (active.has(name)) control.enable({ emitEvent: false });
      else control.disable({ emitEvent: false });
    }
    const recurrence = this.form.controls.recurrent;
    if (strategy.recurrence === 'none') recurrence.disable({ emitEvent: false });
    else recurrence.enable({ emitEvent: false });
    if (strategy.recurrence === 'always') recurrence.setValue(true, { emitEvent: false });
    this.form.updateValueAndValidity();
  }

  private async loadCategories(): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const result = await repos.value.categories.findAll();
    if (result.ok) this.categoriesSig.set(result.value);
  }

  private async loadEvent(id: string): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const found = await repos.value.events.findById(id);
    if (!found.ok || !found.value) {
      this.status.notify('No se encuentra ese movimiento.', 'expense');
      void this.router.navigate(['/events']);
      return;
    }
    const e = found.value;
    this.typeSig.set(e.type);
    this.applyStrategy(e.type);
    this.editingSig.set(e);
    this.form.patchValue({
      amount: e.amountCents,
      date: e.date,
      categoryId: e.categoryId,
      nature: e.nature ?? 'variable',
      paymentMethod: e.paymentMethod ?? '',
      concept: e.concept,
      notes: e.notes ?? '',
      source: e.meta?.type === 'income' ? (e.meta.source ?? '') : '',
      issuer: e.meta?.type === 'direct_debit' ? (e.meta.issuer ?? '') : '',
      account: e.meta?.type === 'saving' ? (e.meta.account ?? '') : '',
      goal: e.meta?.type === 'saving' ? (e.meta.goal ?? '') : '',
      ticker: e.meta?.type === 'investment' ? e.meta.ticker : '',
      platform: e.meta?.type === 'investment' ? (e.meta.platform ?? '') : '',
      assetClass: e.meta?.type === 'investment' ? (e.meta.assetClass ?? null) : null,
      recurrent: false,
    });
    // Al editar una instancia, la regla no se toca desde aquí.
    this.form.controls.recurrent.disable({ emitEvent: false });
    if (e.attachmentPath) {
      const info = await attachmentInfo(e.attachmentPath);
      this.attachmentSig.set(info.ok ? info.value : { path: e.attachmentPath, name: e.attachmentPath, bytes: 0 });
    }
  }
}
