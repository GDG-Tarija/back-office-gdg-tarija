import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, TitleStrategy, withInMemoryScrolling } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { CheckinApi } from './features/checkin/data/checkin.api';
import { CheckinRepository } from './features/checkin/domain/checkin.repository';
import { supabaseProvider } from './core/supabase/supabase.client';
import { provideAppLocale } from './core/config/locale';
import { PRIMENG_ES } from './core/config/primeng-es';
import { GdgPreset } from './core/config/primeng-preset';
import { PageTitleStrategy } from './core/services/page-title.strategy';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
      }),
    ),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideAnimationsAsync(),
    provideAppLocale(),
    providePrimeNG({
      translation: PRIMENG_ES,
      theme: {
        preset: GdgPreset,
        options: {
          // El orden de capas lo declara src/styles/_layers.css (theme, base, primeng, components, utilities).
          // Sin `order`, PrimeNG declara su capa primero y queda bajo el preflight de Tailwind.
          cssLayer: { name: 'primeng', order: 'theme, base, primeng, components, utilities' },
          darkModeSelector: '[data-theme="dark"]',
        },
      },
    }),
    MessageService,
    ConfirmationService,
    supabaseProvider,
    // Contrato de check-in compartido (p. ej. asignaciones de STAFF en la lista de eventos).
    { provide: CheckinRepository, useExisting: CheckinApi },
  ],
};
