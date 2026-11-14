import { Pipe, PipeTransform } from '@angular/core';

import { formatBs } from '../utils/money';

@Pipe({ name: 'bs' })
export class BsPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatBs(value);
  }
}
