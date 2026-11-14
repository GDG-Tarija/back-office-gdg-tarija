import { CanDeactivateFn } from '@angular/router';

/** Páginas con trabajo sin guardar: deciden si dejan salir hacia `nextUrl` (y pueden preguntar). */
export interface CanLeave {
  canLeave(nextUrl: string): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<CanLeave> = (
  component,
  _currentRoute,
  _currentState,
  nextState,
) => component.canLeave(nextState.url);
