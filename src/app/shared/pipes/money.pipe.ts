import { Pipe, type PipeTransform } from '@angular/core';

import { formatMoney, type MoneyFormatOptions } from '../../core/format/money-format';
import type { Money } from '../../core/types/money';

/** `{{ importe | ftMoney }}` → «1.234,56 €»; `{{ importe | ftMoney:'always' }}` → «+1.234,56 €». */
@Pipe({ name: 'ftMoney' })
export class MoneyPipe implements PipeTransform {
  transform(value: Money | null | undefined, sign: MoneyFormatOptions['sign'] = 'auto', symbol = true): string {
    if (value === null || value === undefined) return '—';
    return formatMoney(value, { sign, symbol });
  }
}
