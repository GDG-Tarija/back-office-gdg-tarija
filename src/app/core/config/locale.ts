import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { DEFAULT_CURRENCY_CODE, LOCALE_ID, Provider } from '@angular/core';

export const APP_LOCALE = 'es-BO';
export const APP_CURRENCY = 'BOB';

/** Registra es-BO y fija moneda por defecto (el símbolo de BOB en es-BO es "Bs"). */
export function provideAppLocale(): Provider[] {
  registerLocaleData(localeEsBo, APP_LOCALE);
  return [
    { provide: LOCALE_ID, useValue: APP_LOCALE },
    { provide: DEFAULT_CURRENCY_CODE, useValue: APP_CURRENCY },
  ];
}
