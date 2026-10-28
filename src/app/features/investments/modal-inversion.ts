import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';

import { parseMoney } from '../../core/format/money-format';
import { HOLDING_CLASSES, HOLDING_CLASS_LABEL, type HoldingClass, type Investment } from '../../core/types/investment';
import { isIsoDate, todayIso } from '../../core/types/iso-date';
import { money } from '../../core/types/money';
import { InvestmentsFacade } from '../../facades/investments.facade';
import { FT_COLORS } from '../../shared/charts/palette';
import { Modal } from '../../shared/components/modal/modal';

/**
 * Alta y edición de una inversión: nombre, quién está detrás, tipo, ticker o
 * ISIN, participaciones y, al darla de alta, su valor de mercado y lo
 * aportado. El valor se actualiza después con «Actualizar valor».
 */
@Component({
  selector: 'ft-modal-inversion',
  imports: [Modal],
  templateUrl: './modal-inversion.html',
  styleUrl: './investments-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalInversion {
  readonly abierto = model<boolean>(false);
  readonly inversion = input<Investment | null>(null);

  private readonly facade = inject(InvestmentsFacade);

  protected readonly clases = HOLDING_CLASSES.map((value) => ({ value, label: HOLDING_CLASS_LABEL[value] }));

  protected readonly nombre = signal('');
  protected readonly emisor = signal('');
  protected readonly clase = signal<HoldingClass>('index_fund');
  protected readonly ticker = signal('');
  protected readonly unidades = signal('');
  protected readonly valorTexto = signal('');
  protected readonly aportadoTexto = signal('');
  protected readonly fecha = signal<string>(todayIso());
  protected readonly error = signal('');
  protected readonly confirmando = signal(false);
  protected readonly guardando = signal(false);

  protected readonly edicion = computed(() => this.inversion() !== null);
  protected readonly titulo = computed(() => (this.edicion() ? 'Editar inversión' : 'Nueva inversión'));

  constructor() {
    effect(() => {
      if (!this.abierto()) return;
      const i = this.inversion();
      this.nombre.set(i?.name ?? '');
      this.emisor.set(i?.issuer ?? '');
      this.clase.set(i?.assetClass ?? 'index_fund');
      this.ticker.set(i?.ticker ?? '');
      this.unidades.set(i?.units !== null && i?.units !== undefined ? String(i.units).replace('.', ',') : '');
      this.valorTexto.set('');
      this.aportadoTexto.set('');
      this.fecha.set(todayIso());
      this.error.set('');
      this.confirmando.set(false);
    });
  }

  protected setClase(event: Event): void {
    this.clase.set((event.target as HTMLSelectElement).value as HoldingClass);
  }

  protected async guardar(): Promise<void> {
    if (!this.nombre().trim()) return this.error.set('Ponle un nombre.');
    const unidadesTexto = this.unidades().trim().replace(/\./g, '').replace(',', '.');
    const units = unidadesTexto ? Number(unidadesTexto) : null;
    if (units !== null && (!Number.isFinite(units) || units < 0)) return this.error.set('Las participaciones no son un número válido.');
    const datos = {
      name: this.nombre(),
      issuer: this.emisor().trim() || null,
      assetClass: this.clase(),
      ticker: this.ticker().trim().toUpperCase() || null,
      units,
    };
    const actual = this.inversion();
    this.guardando.set(true);
    try {
      if (actual) {
        const r = await this.facade.update(actual.id, datos);
        if (r.ok) this.abierto.set(false);
        return;
      }
      const valor = parseMoney(this.valorTexto());
      if (!valor.ok || valor.value < 0) return this.error.set('Escribe el valor de mercado actual.');
      const aportadoTxt = this.aportadoTexto().trim();
      const aportado = aportadoTxt ? parseMoney(aportadoTxt) : valor;
      if (!aportado.ok || aportado.value < 0) return this.error.set('La cantidad invertida no es un importe válido.');
      const fecha = this.fecha();
      if (!isIsoDate(fecha)) return this.error.set('Fecha no válida.');
      const color = FT_COLORS.series[this.facade.investments().length % FT_COLORS.series.length] ?? FT_COLORS.investment;
      const r = await this.facade.create({ ...datos, color, archived: false, sortOrder: this.facade.investments().length }, money(valor.value), money(aportado.value), fecha);
      if (r.ok) this.abierto.set(false);
    } finally {
      this.guardando.set(false);
    }
  }

  protected async archivar(): Promise<void> {
    const actual = this.inversion();
    if (!actual) return;
    const r = await this.facade.update(actual.id, { archived: !actual.archived });
    if (r.ok) this.abierto.set(false);
  }

  protected async borrar(): Promise<void> {
    const actual = this.inversion();
    if (!actual) return;
    if (!this.confirmando()) return this.confirmando.set(true);
    const r = await this.facade.remove(actual.id);
    if (r.ok) this.abierto.set(false);
  }
}
