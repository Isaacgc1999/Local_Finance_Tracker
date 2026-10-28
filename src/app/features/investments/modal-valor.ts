import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';

import { formatDayMonthYear } from '../../core/format/date-format';
import { formatAmount, formatMoney, parseMoney } from '../../core/format/money-format';
import { isIsoDate, todayIso } from '../../core/types/iso-date';
import { type Money, money } from '../../core/types/money';
import type { Holding } from '../../domain/investments/portfolio';
import { InvestmentsFacade } from '../../facades/investments.facade';
import { Modal } from '../../shared/components/modal/modal';

/**
 * «Actualizar valor»: nuevo valor de mercado (o precio × participaciones) y
 * lo aportado hasta hoy. Cada actualización queda en la historia, que
 * alimenta el gráfico; una del mismo día sustituye a la anterior.
 */
@Component({
  selector: 'ft-modal-valor',
  imports: [Modal],
  template: `
    <ft-modal [(open)]="abierto" [titulo]="titulo()" subtitulo="Mira el valor en tu bróker o banco y apúntalo aquí." (cerrar)="abierto.set(false)">
      <div class="fila-3">
        <label class="ft-field">
          <span class="ft-field__label">Valor de mercado</span>
          <input class="ft-input num" inputmode="decimal" placeholder="0,00" [value]="valorTexto()" (input)="valorTexto.set($any($event.target).value)" />
        </label>
        <label class="ft-field">
          <span class="ft-field__label">Dinero invertido</span>
          <input class="ft-input num" inputmode="decimal" placeholder="0,00" [value]="aportadoTexto()" (input)="aportadoTexto.set($any($event.target).value)" />
        </label>
        <label class="ft-field">
          <span class="ft-field__label">Fecha</span>
          <input class="ft-input num" type="date" [value]="fecha()" (input)="fecha.set($any($event.target).value)" />
        </label>
      </div>
      @if (unidades(); as u) {
        <label class="ft-field">
          <span class="ft-field__label">O precio por participación<span class="ft-field__label-hint"> · {{ unidadesLabel() }} participaciones</span></span>
          <input class="ft-input num" inputmode="decimal" placeholder="0,00" [value]="precioTexto()" (input)="onPrecio($any($event.target).value)" />
        </label>
      }
      @if (resultado(); as r) {
        <p class="resultado num" [class.ft-c-income]="r.gain > 0" [class.ft-c-expense]="r.gain < 0">{{ r.texto }}</p>
      }
      @if (historial().length > 0) {
        <div class="ft-field">
          <span class="ft-field__label">Historia</span>
          <ul class="historial">
            @for (v of historial(); track v.id) {
              <li>
                <span class="num">{{ fechaLarga(v.date) }}</span>
                <span class="num">{{ money(v.marketValueCents) }}</span>
                <span class="num">invertido {{ money(v.investedCents) }}</span>
                <button type="button" [attr.aria-label]="'Borrar valor del ' + fechaLarga(v.date)" (click)="borrarValor(v.id)">✕</button>
              </li>
            }
          </ul>
        </div>
      }
      @if (error()) {
        <p class="confirmar">{{ error() }}</p>
      }
      <div acciones class="acciones">
        <button type="button" class="ft-btn ft-btn--secondary" (click)="abierto.set(false)">Cancelar</button>
        <button type="button" class="ft-btn ft-btn--primary" (click)="guardar()">Guardar valor</button>
      </div>
    </ft-modal>
  `,
  styleUrl: './investments-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalValor {
  readonly abierto = model<boolean>(false);
  readonly holding = input<Holding | null>(null);

  private readonly facade = inject(InvestmentsFacade);

  protected readonly valorTexto = signal('');
  protected readonly aportadoTexto = signal('');
  protected readonly precioTexto = signal('');
  protected readonly fecha = signal<string>(todayIso());
  protected readonly error = signal('');

  protected readonly titulo = computed(() => `Actualizar · ${this.holding()?.investment.name ?? ''}`);
  protected readonly unidades = computed(() => this.holding()?.investment.units ?? null);
  protected readonly unidadesLabel = computed(() => (this.unidades() ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 6 }));
  protected readonly historial = computed(() => {
    const h = this.holding();
    return h ? this.facade.historyOf(h.investment.id).slice(0, 12) : [];
  });

  protected readonly resultado = computed(() => {
    const v = parseMoney(this.valorTexto());
    const a = parseMoney(this.aportadoTexto());
    if (!v.ok || !a.ok) return null;
    const gain = v.value - a.value;
    const pct = a.value > 0 ? ` (${((gain / a.value) * 100).toLocaleString('es-ES', { maximumFractionDigits: 2, signDisplay: 'always' })} %)` : '';
    return { gain, texto: `${gain >= 0 ? 'Ganancia' : 'Pérdida'}: ${formatMoney(gain as Money, { sign: 'always' })}${pct}` };
  });

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const h = this.holding();
      this.valorTexto.set(h ? formatAmount(h.marketValue, 'never') : '');
      this.aportadoTexto.set(h ? formatAmount(h.invested, 'never') : '');
      this.precioTexto.set('');
      this.fecha.set(todayIso());
      this.error.set('');
    });
  }

  protected money(v: Money): string {
    return formatMoney(v);
  }

  protected fechaLarga(d: string): string {
    return isIsoDate(d) ? formatDayMonthYear(d) : d;
  }

  protected onPrecio(texto: string): void {
    this.precioTexto.set(texto);
    const u = this.unidades();
    const precio = parseMoney(texto);
    if (u && precio.ok) this.valorTexto.set(formatAmount(money(Math.round(precio.value * u)), 'never'));
  }

  protected async guardar(): Promise<void> {
    const h = this.holding();
    if (!h) return;
    const v = parseMoney(this.valorTexto());
    const a = parseMoney(this.aportadoTexto());
    if (!v.ok || v.value < 0) return this.error.set('Escribe el valor de mercado.');
    if (!a.ok || a.value < 0) return this.error.set('Escribe el dinero invertido.');
    const fecha = this.fecha();
    if (!isIsoDate(fecha)) return this.error.set('Fecha no válida.');
    const r = await this.facade.updateValue(h.investment.id, money(v.value), money(a.value), fecha);
    if (r.ok) this.abierto.set(false);
  }

  protected async borrarValor(id: string): Promise<void> {
    if (this.historial().length <= 1) return this.error.set('Es el único valor: para quitarla, borra la inversión.');
    await this.facade.deleteValuation(id);
  }
}
