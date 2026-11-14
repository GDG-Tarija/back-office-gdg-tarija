import { formatNumber } from '@angular/common';

import { APP_LOCALE } from '../../core/config/locale';

/** "Bs 10" si es entero, "Bs 12,50" si tiene centavos. Espacio fino no separable. */
export function formatBs(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '';
  const digits = Number.isInteger(amount) ? '1.0-0' : '1.2-2';
  return `Bs\u00A0${formatNumber(amount, APP_LOCALE, digits)}`;
}
