import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { map, startWith } from 'rxjs';

import { type AppError, type ValidationError, describeError } from '../core/errors/app-error';
import { FREQUENCY_LABEL } from '../core/types/recurrence';
import { formatDayMonth } from '../core/format/date-format';
import { formatMoney } from '../core/format/money-format';
import type { Account } from '../core/types/account';
import type { Category } from '../core/types/category';
import type { CategoryRule } from '../core/types/category-rule';
import type { AssetClass, Event, EventDraft, EventMeta, EventType, Nature } from '../core/types/event';
import { type IsoDate, day, isIsoDate, todayIso, weekdayIso } from '../core/types/iso-date';
import type { Money } from '../core/types/money';
import type { Frequency, RecurrenceDraft } from '../core/types/recurrence';
import { type Result, err, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import type { ConceptUsage } from '../data/repositories/events.repository';
import { type CategorySuggestion, compileRules, suggestCategory } from '../domain/categorization/category-rules';
import { FORM_STRATEGIES, type FieldKey } from '../domain/events/event-form-strategy';
import { EventService, validateEventDraft } from '../domain/events/event.service';
import { type AttachmentInfo, attachmentInfo, pickAndStoreAttachment, removeStoredAttachment } from '../infra/fs/attachments';
import { AppStatusFacade } from './app-status.facade';
import { EventsFacade } from './events.facade';

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
  accountId: FormControl<string | null>;
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

/** Conceptos recientes que alimentan el autocompletado y la sugerencia por historial. */
const RECENT_CONCEPTS = 300;

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
  private readonly events = inject(EventsFacade);

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
    accountId: this.fb.control<string | null>(null),
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
  private readonly accountsSig = signal<readonly Account[]>([]);
  private readonly submittedSig = signal(false);
  private readonly savingSig = signal(false);
  private readonly attachmentSig = signal<AttachmentInfo | null>(null);
  private readonly saveErrorSig = signal<string>('');
  private readonly rulesSig = signal<readonly CategoryRule[]>([]);
  private readonly conceptsSig = signal<readonly ConceptUsage[]>([]);
  private readonly suggestionSig = signal<CategorySuggestion | null>(null);
  /** El usuario ha elegido categoría a mano en este formulario: la sugerencia deja de pisarla. */
  private readonly categoryPickedSig = signal(false);

  readonly type = this.typeSig.asReadonly();
  readonly editing = this.editingSig.asReadonly();
  readonly mode = computed(() => (this.editingSig() ? 'edit' : 'create'));
  readonly strategy = computed(() => FORM_STRATEGIES[this.typeSig()]);
  readonly submitted = this.submittedSig.asReadonly();
  readonly saving = this.savingSig.asReadonly();
  readonly attachment = this.attachmentSig.asReadonly();
  readonly saveError = this.saveErrorSig.asReadonly();
  /** Categoría propuesta para el concepto escrito (regla o último uso), si la hay. */
  readonly suggestion = this.suggestionSig.asReadonly();

  /** Conceptos ya usados con un tipo compatible, para el `<datalist>` del concepto. */
  readonly conceptOptions = computed<readonly string[]>(() => this.conceptsSig().map((c) => c.concept));

  /** «Sugerida por la regla «netflix»» o «Como la última vez que apuntaste «Farmacia»». */
  readonly suggestionLabel = computed(() => {
    const s = this.suggestionSig();
    if (!s || this.value().categoryId !== s.categoryId) return '';
    return s.source === 'rule' && s.rule ? `Sugerida por la regla «${s.rule.pattern}».` : 'Como la última vez con este concepto.';
  });

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

  /**
   * Cuentas que ofrece el selector: las activas y, al editar, también la del
   * movimiento aunque esté archivada, para no perderla al guardar.
   */
  readonly accounts = computed(() => {
    const current = this.editingSig()?.accountId ?? null;
    return this.accountsSig().filter((a) => !a.archived || a.id === current);
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

  constructor() {
    // Al escribir el concepto de un movimiento nuevo se propone la categoría:
    // manda la regla y, si no hay, la del último movimiento con ese concepto.
    // Una categoría elegida a mano no se toca.
    effect(() => {
      const concept = this.value().concept;
      const rules = this.rulesSig();
      const history = this.conceptsSig();
      untracked(() => this.suggestFor(concept, rules, history));
    });
  }

  visible(field: FieldKey): boolean {
    return this.strategy().fields.includes(field);
  }

  /** Elección manual de categoría (chips): se recuerda para no pisarla con la sugerencia. */
  pickCategory(id: string | null): void {
    this.categoryPickedSig.set(true);
    this.form.controls.categoryId.setValue(id);
  }

  async init(params: { readonly id?: string | undefined; readonly presetAmountCents?: string | undefined }): Promise<void> {
    await Promise.all([this.loadCategories(), this.loadAccounts(), this.loadSuggestions()]);
    if (params.id) {
      await this.loadEvent(params.id);
      return;
    }
    this.setType('expense');
    // Con cuentas, el movimiento nuevo va a la primera activa; se puede cambiar o dejar sin cuenta.
    this.form.controls.accountId.setValue(this.accounts()[0]?.id ?? null);
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
      const { date, categoryId, accountId } = this.form.getRawValue();
      this.form.reset({ date, categoryId, accountId, nature: 'variable', frequency: 'monthly' });
      this.attachmentSig.set(null);
      this.submittedSig.set(false);
      this.categoryPickedSig.set(false);
      this.suggestionSig.set(null);
      void this.loadSuggestions();
    }
    return result;
  }

  /**
   * Elimina el movimiento en edición con «Deshacer» (ver
   * `EventsFacade.scheduleDelete`) y vuelve al listado, donde ya no aparece.
   * El recibo adjunto solo se borra del disco si el borrado se confirma.
   */
  remove(): void {
    const current = this.editingSig();
    if (!current) return;
    const attachment = current.attachmentPath;
    this.events.scheduleDelete([current], attachment ? () => removeStoredAttachment(attachment).then(() => undefined) : undefined);
    void this.router.navigate(['/events']);
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
      accountId: v.accountId,
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
      accountId: draft.accountId,
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

  private suggestFor(concept: string, rules: readonly CategoryRule[], history: readonly ConceptUsage[]): void {
    if (this.editingSig() || !this.strategy().categoryKind) return;
    const suggestion = concept.trim().length >= 2 ? suggestCategory(compileRules(rules), concept, history) : null;
    const previous = this.suggestionSig();
    if (suggestion?.categoryId === previous?.categoryId && suggestion?.source === previous?.source) return;
    this.suggestionSig.set(suggestion);
    if (this.categoryPickedSig()) return;
    const control = this.form.controls.categoryId;
    const allowed = new Set(this.categories().map((c) => c.id));
    if (suggestion && allowed.has(suggestion.categoryId)) {
      if (control.value !== suggestion.categoryId) control.setValue(suggestion.categoryId);
    } else if (previous && control.value === previous.categoryId) {
      // Se borró o cambió el concepto: la categoría que vino de la sugerencia se retira.
      control.setValue(null);
    }
  }

  private async loadSuggestions(): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const [rules, concepts] = await Promise.all([repos.value.categoryRules.findAll(), repos.value.events.recentConcepts(RECENT_CONCEPTS)]);
    if (rules.ok) this.rulesSig.set(rules.value);
    if (concepts.ok) this.conceptsSig.set(concepts.value);
  }

  private async loadAccounts(): Promise<void> {
    const repos = this.db.require();
    if (!repos.ok) return;
    const result = await repos.value.accounts.findAll();
    if (result.ok) this.accountsSig.set(result.value);
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
      accountId: e.accountId,
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
