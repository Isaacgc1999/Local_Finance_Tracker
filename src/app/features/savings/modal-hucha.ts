import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';

import { formatAmount, parseMoney } from '../../core/format/money-format';
import { money } from '../../core/types/money';
import { POT_KIND_HINT, POT_KIND_LABEL, type PotKind, type SavingsPot } from '../../core/types/savings';
import { SavingsFacade } from '../../facades/savings.facade';
import { Modal } from '../../shared/components/modal/modal';
import { SegmentedControl, type SegmentOption } from '../../shared/components/segmented-control/segmented-control';
import { CATEGORY_COLORS } from '../settings/lista-categorias/modal-categoria';

type ManualKind = Exclude<PotKind, 'goal'>;

const TIPOS: readonly SegmentOption<ManualKind>[] = (['emergency', 'general'] as const).map((value) => ({ value, label: POT_KIND_LABEL[value] }));

/**
 * Alta y edición de una hucha de Ahorros. Las de «Ahorro específico» nacen
 * con su objetivo (sección Objetivos); aquí se crean las de emergencia y las
 * generales, y se ajusta su meta opcional.
 */
@Component({
  selector: 'ft-modal-hucha',
  imports: [Modal, SegmentedControl],
  template: `
    <ft-modal [(open)]="abierto" [titulo]="titulo()" (cerrar)="abierto.set(false)">
      @if (!esDeObjetivo()) {
        <div class="ft-field">
          <span class="ft-field__label">Tipo</span>
          <ft-segmented-control layout="stretch" tone="subtle" label="Tipo de hucha" [options]="tipos" [value]="tipo()" (valueChange)="$event && tipo.set($event)" />
          <span class="pista">{{ pista() }}</span>
        </div>
      }
      <label class="ft-field">
        <span class="ft-field__label">Nombre</span>
        <input class="ft-input" maxlength="60" placeholder="Colchón, Vacaciones, Hacienda…" [value]="nombre()" (input)="nombre.set($any($event.target).value)" [disabled]="esDeObjetivo()" />
      </label>
      @if (!esDeObjetivo()) {
        <label class="ft-field">
          <span class="ft-field__label">Meta<span class="ft-field__label-hint"> · opcional</span></span>
          <input class="ft-input num" inputmode="decimal" placeholder="0,00" [value]="metaTexto()" (input)="metaTexto.set($any($event.target).value)" />
        </label>
        <div class="ft-field">
          <span class="ft-field__label">Color</span>
          <div class="colores" role="radiogroup" aria-label="Color de la hucha">
            @for (c of colores; track c) {
              <button type="button" role="radio" class="muestra" [class.activa]="c === color()" [attr.aria-checked]="c === color()" [attr.aria-label]="'Color ' + c" [style.background]="c + '1F'" [style.border-color]="c" (click)="color.set(c)"></button>
            }
          </div>
        </div>
      } @else {
        <p class="pista">Esta hucha es la del objetivo «{{ hucha()?.name }}». Su nombre y su meta se cambian desde Objetivos.</p>
      }
      @if (error()) {
        <p class="confirmar">{{ error() }}</p>
      } @else if (confirmando()) {
        <p class="confirmar">Se borrará la hucha con sus apuntes. Los movimientos de ahorro que la usaban pasan a «Ahorro general». Pulsa «Borrar» otra vez para confirmarlo.</p>
      }
      <div acciones class="acciones">
        @if (hucha() && !esDeObjetivo()) {
          <button type="button" class="ft-btn ft-btn--secondary borrar" (click)="borrar()">Borrar</button>
        }
        <button type="button" class="ft-btn ft-btn--secondary" (click)="abierto.set(false)">Cancelar</button>
        @if (!esDeObjetivo()) {
          <button type="button" class="ft-btn ft-btn--primary" (click)="guardar()">Guardar</button>
        }
      </div>
    </ft-modal>
  `,
  styles: `
    .pista { font: var(--ft-font-meta); line-height: 1.6; color: var(--ft-text-3); }
    .confirmar { font: var(--ft-font-meta); line-height: 1.6; color: var(--ft-expense); }
    .colores { display: flex; gap: 10px; flex-wrap: wrap; }
    .muestra { width: var(--ft-swatch); height: var(--ft-swatch); border-radius: var(--ft-radius-control); border: 1px solid; cursor: pointer; }
    .muestra.activa { box-shadow: var(--ft-focus-ring); }
    .acciones { display: flex; gap: 10px; width: 100%; justify-content: flex-end; flex-wrap: wrap; }
    .borrar { margin-right: auto; color: var(--ft-expense); border-color: var(--ft-expense); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalHucha {
  readonly abierto = model<boolean>(false);
  readonly hucha = input<SavingsPot | null>(null);

  private readonly facade = inject(SavingsFacade);

  protected readonly tipos = TIPOS;
  protected readonly colores = CATEGORY_COLORS;
  protected readonly tipo = signal<ManualKind>('general');
  protected readonly nombre = signal('');
  protected readonly metaTexto = signal('');
  protected readonly color = signal<string>('#FBBF24');
  protected readonly error = signal('');
  protected readonly confirmando = signal(false);

  protected readonly esDeObjetivo = computed(() => this.hucha()?.kind === 'goal');
  protected readonly titulo = computed(() => (this.hucha() ? 'Editar hucha' : 'Nueva hucha'));
  protected readonly pista = computed(() => POT_KIND_HINT[this.tipo()]);

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const h = this.hucha();
      this.tipo.set(h && h.kind !== 'goal' ? h.kind : 'general');
      this.nombre.set(h?.name ?? '');
      this.metaTexto.set(h?.targetCents ? formatAmount(h.targetCents, 'never') : '');
      this.color.set(h?.color ?? '#FBBF24');
      this.error.set('');
      this.confirmando.set(false);
    });
  }

  protected async guardar(): Promise<void> {
    if (!this.nombre().trim()) return this.error.set('Ponle un nombre.');
    const texto = this.metaTexto().trim();
    let meta = null;
    if (texto) {
      const parsed = parseMoney(texto);
      if (!parsed.ok || parsed.value <= 0) return this.error.set('La meta no es un importe válido.');
      meta = money(parsed.value);
    }
    const actual = this.hucha();
    const result = actual
      ? await this.facade.updatePot(actual.id, { name: this.nombre(), color: this.color(), targetCents: meta })
      : await this.facade.createPot({ name: this.nombre(), kind: this.tipo(), color: this.color(), targetCents: meta, goalId: null, archived: false, sortOrder: 50 });
    if (result.ok) this.abierto.set(false);
  }

  protected async borrar(): Promise<void> {
    const actual = this.hucha();
    if (!actual) return;
    if (!this.confirmando()) return this.confirmando.set(true);
    const result = await this.facade.deletePot(actual.id);
    if (result.ok) this.abierto.set(false);
  }
}
