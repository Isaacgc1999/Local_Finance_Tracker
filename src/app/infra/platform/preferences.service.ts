import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { setCurrency } from '../../core/format/money-format';
import { DEFAULT_SETTINGS, type Settings } from '../../core/types/settings';
import { DbConnection } from '../../data/db/db-connection';
import { AppStatusFacade } from '../../facades/app-status.facade';

/**
 * Preferencias del usuario disponibles en cualquier punto de la interfaz,
 * como signals. Se cargan solas cuando la base de datos está lista y se
 * refrescan con cada `touch()`, de modo que cambiar el formato de fecha o la
 * moneda en Ajustes se ve en el resto de pantallas sin recargar.
 *
 * La moneda se empuja además al formateador (`setCurrency`), que es quien la
 * aplica en todos los importes.
 *
 * Escribir es cosa de `SettingsFacade`: aquí solo se lee.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly db = inject(DbConnection);
  private readonly status = inject(AppStatusFacade);

  private readonly settingsSig = signal<Settings>(DEFAULT_SETTINGS);

  readonly settings = this.settingsSig.asReadonly();
  readonly dateFormat = computed(() => this.settingsSig().dateFormat);
  readonly currency = computed(() => this.settingsSig().currency);
  readonly lastBackupAt = computed(() => this.settingsSig().lastBackupAt);

  constructor() {
    effect(() => {
      this.status.dataVersion();
      if (!this.db.ready()) return;
      untracked(() => void this.reload());
    });
  }

  async reload(): Promise<void> {
    const repos = this.db.repos();
    if (!repos) return;
    const loaded = await repos.settings.getAll();
    if (!loaded.ok) return;
    this.settingsSig.set(loaded.value);
    setCurrency(loaded.value.currency);
  }
}
