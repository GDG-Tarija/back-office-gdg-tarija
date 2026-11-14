import { DATE_PIPE_DEFAULT_OPTIONS, registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { DEFAULT_CURRENCY_CODE, LOCALE_ID, Provider } from '@angular/core';

import { LA_PAZ_UTC_OFFSET } from '../../shared/utils/la-paz-time';

export const APP_LOCALE = 'es-BO';
export const APP_CURRENCY = 'BOB';

/**
 * Registra es-BO, fija moneda por defecto (el símbolo de BOB en es-BO es "Bs") y hace que todo
 * `| date` muestre hora de La Paz, no la del dispositivo.
 */
export function provideAppLocale(): Provider[] {
  registerLocaleData(localeEsBo, APP_LOCALE);
  return [
    { provide: LOCALE_ID, useValue: APP_LOCALE },
    { provide: DEFAULT_CURRENCY_CODE, useValue: APP_CURRENCY },
    { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { timezone: LA_PAZ_UTC_OFFSET } },
  ];
}
