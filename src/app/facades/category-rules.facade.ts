import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { type AppError, describeError } from '../core/errors/app-error';
import { SYSTEM_CATEGORY, type Category } from '../core/types/category';
import type { CategoryRule, CategoryRuleDraft, CategoryRulePatch } from '../core/types/category-rule';
import { type Result, ok } from '../core/types/result';
import { DbConnection } from '../data/db/db-connection';
import { compileRules, matchRule } from '../domain/categorization/category-rules';
import { AppStatusFacade } from './app-status.facade';

/** Una regla con el nombre de su categoría, para la lista de Ajustes. */
export interface RuleRow {
  readonly rule: CategoryRule;
  readonly category: Category | null;
  readonly hitsLabel: string;
}

/** Resultado de «Aplicar reglas a los movimientos existentes». */
export interface ApplyOutcome {
  readonly candidates: number;
  readonly updated: number;
}

/**
 * Categorías «cajón de sastre» que la importación asigna cuando ninguna
 * regla coincide. Aplicar reglas en bloque solo toca movimientos sin
 * categoría o con una de estas: una categoría elegida a mano no se pisa.
 */
export const FALLBACK_CATEGORY_IDS: readonly string[] = [SYSTEM_CATEGORY.otros, SYSTEM_CATEGORY.otrosIngresos];

/**
 * Reglas de categorización automática: alta, edición, borrado y aplicación
 * en bloque. Recarga con `dataVersion`, como el resto de facades, porque una
 * categoría borrada se lleva sus reglas por delante.
 */
@Injectable({ providedIn: 'root' })
export class CategoryRulesFacade {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  private readonly rulesSig = signal<readonly CategoryRule[]>([]);
  private readonly categoriesSig = signal<readonly Category[]>([]);
  private readonly loadingSig = signal(true);
  private readonly errorSig = signal<AppError | null>(null);
  private readonly applyingSig = signal(false);

  readonly rules = this.rulesSig.asReadonly();
  readonly categories = this.categoriesSig.asReadonly();
  readonly loading = this.loadingSig.asReadonly();
  readonly error = this.errorSig.asReadonly();
  readonly applying = this.applyingSig.asReadonly();

  readonly categoryById = computed(() => new Map(this.categoriesSig().map((c) => [c.id, c])));

  readonly rows = computed<readonly RuleRow[]>(() => {
    const byId = this.categoryById();
    return this.rulesSig().map((rule) => ({
      rule,
      category: byId.get(rule.categoryId) ?? null,
      hitsLabel: rule.hits === 0 ? 'Sin usar' : rule.hits === 1 ? '1 movimiento' : `${rule.hits} movimientos`,
    }));
  });

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.load());
    });
  }

  /** Categoría que las reglas actuales darían a un concepto, o `null`. */
  categoryFor(concept: string): CategoryRule | null {
    return matchRule(compileRules(this.rulesSig()), concept);
  }

  async create(draft: CategoryRuleDraft): Promise<Result<CategoryRule>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const created = await repos.value.categoryRules.insert({ ...draft, sortOrder: draft.sortOrder ?? this.rulesSig().length });
    if (created.ok) {
      this.status.touch();
      this.status.notify('Regla guardada.', 'income');
    }
    return this.report(created);
  }

  async update(id: string, patch: CategoryRulePatch): Promise<Result<CategoryRule>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const updated = await repos.value.categoryRules.update(id, patch);
    if (updated.ok) {
      this.status.touch();
      this.status.notify('Regla actualizada.');
    }
    return this.report(updated);
  }

  /** Crea la regla o cambia de categoría la que ya tenía ese texto (recategorización en bloque). */
  async remember(pattern: string, categoryId: string): Promise<Result<CategoryRule>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const saved = await repos.value.categoryRules.upsertByPattern({ pattern, categoryId, sortOrder: this.rulesSig().length });
    if (saved.ok) this.status.touch();
    return this.report(saved);
  }

  async delete(id: string): Promise<Result<void>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    const deleted = await repos.value.categoryRules.delete(id);
    if (deleted.ok) {
      this.status.touch();
      this.status.notify('Regla borrada.');
    }
    return this.report(deleted);
  }

  /**
   * Pasa las reglas por los movimientos sin categoría o con la categoría por
   * defecto de la importación. Devuelve cuántos candidatos había y cuántos
   * cambiaron. Nunca toca una categoría elegida a mano.
   */
  async applyToExisting(): Promise<Result<ApplyOutcome>> {
    const repos = this.db.require();
    if (!repos.ok) return repos;
    this.applyingSig.set(true);
    try {
      const candidates = await repos.value.events.findCategorizable(FALLBACK_CATEGORY_IDS);
      if (!candidates.ok) return this.report(candidates);
      const compiled = compileRules(this.rulesSig());
      const byCategory = new Map<string, string[]>();
      const hits = new Map<string, number>();
      for (const e of candidates.value) {
        const rule = matchRule(compiled, e.concept);
        if (!rule || rule.categoryId === e.categoryId) continue;
        const list = byCategory.get(rule.categoryId) ?? [];
        list.push(e.id);
        byCategory.set(rule.categoryId, list);
        hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
      }
      let updated = 0;
      for (const [categoryId, ids] of byCategory) {
        const result = await repos.value.events.updateCategoryMany(ids, categoryId);
        if (!result.ok) return this.report(result);
        updated += result.value.updated;
      }
      if (updated > 0) {
        await repos.value.categoryRules.addHits(hits);
        this.status.touch();
      }
      const outcome = { candidates: candidates.value.length, updated };
      this.status.notify(
        updated === 0
          ? 'Ninguna regla coincide con los movimientos sin clasificar.'
          : updated === 1
            ? 'Se ha recategorizado 1 movimiento.'
            : `Se han recategorizado ${updated} movimientos.`,
        updated > 0 ? 'income' : 'neutral',
      );
      return ok(outcome);
    } finally {
      this.applyingSig.set(false);
    }
  }

  private async load(): Promise<void> {
    const repos = this.db.repos();
    if (!repos) return;
    this.loadingSig.set(true);
    const [rules, categories] = await Promise.all([repos.categoryRules.findAll(), repos.categories.findAll()]);
    this.loadingSig.set(false);
    if (!rules.ok) {
      this.errorSig.set(rules.error);
      return;
    }
    this.errorSig.set(null);
    this.rulesSig.set(rules.value);
    if (categories.ok) this.categoriesSig.set(categories.value);
  }

  private report<T>(result: Result<T>): Result<T> {
    if (!result.ok) this.status.notify(describeError(result.error), 'expense');
    return result;
  }
}
