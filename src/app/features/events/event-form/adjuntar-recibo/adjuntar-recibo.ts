import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { formatBytes } from '../../../../core/format/bytes-format';
import type { AttachmentInfo } from '../../../../infra/fs/attachments';

/**
 * «Adjuntar recibo» del handoff: zona punteada («Arrastra un archivo o pulsa
 * para buscar · PNG, JPG o PDF · máx. 8 MB») y fila del fichero adjunto con
 * nombre, peso y ✕. En móvil, un único botón punteado de 48px.
 */
@Component({
  selector: 'ft-adjuntar-recibo',
  templateUrl: './adjuntar-recibo.html',
  styleUrl: './adjuntar-recibo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjuntarRecibo {
  readonly attachment = input<AttachmentInfo | null>(null);
  readonly compact = input<boolean>(false);
  readonly attach = output<void>();
  readonly detach = output<void>();

  protected peso(bytes: number): string {
    return bytes > 0 ? formatBytes(bytes) : '';
  }
}
