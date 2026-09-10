import { Pipe, type PipeTransform } from '@angular/core';

import {
  type DateFormat,
  formatDate,
  formatDayMonth,
  formatDayMonthYear,
  formatMonthYear,
} from '../../core/format/date-format';
import type { IsoDate } from '../../core/types/iso-date';

export type FechaStyle = 'corta' | 'dia-mes' | 'dia-mes-anno' | 'mes-anno' | 'mes-anno-corto';

/** `{{ fecha | ftFecha:'dia-mes' }}` → «9 sep». */
@Pipe({ name: 'ftFecha' })
export class FechaPipe implements PipeTransform {
  transform(value: IsoDate | null | undefined, style: FechaStyle = 'corta', format: DateFormat = 'DD/MM/YYYY'): string {
    if (!value) return '—';
    switch (style) {
      case 'dia-mes':
        return formatDayMonth(value);
      case 'dia-mes-anno':
        return formatDayMonthYear(value);
      case 'mes-anno':
        return formatMonthYear(value);
      case 'mes-anno-corto':
        return formatMonthYear(value, 'short');
      default:
        return formatDate(value, format);
    }
  }
}
