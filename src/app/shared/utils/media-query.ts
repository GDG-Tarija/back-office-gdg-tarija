import { DestroyRef, Signal, inject, signal } from '@angular/core';

/** Señal que refleja un media query. Llamar en contexto de inyección (constructor o campo). */
export function mediaQuerySignal(query: string): Signal<boolean> {
  const mql = typeof matchMedia === 'function' ? matchMedia(query) : null;
  const matches = signal(mql?.matches ?? false);
  if (mql) {
    const onChange = (e: MediaQueryListEvent) => matches.set(e.matches);
    mql.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
  }
  return matches.asReadonly();
}

/** ≤ 768 px: las tablas se muestran como tarjetas (ver `EventsPage`). */
export const MOBILE_QUERY = '(max-width: 768px)';
