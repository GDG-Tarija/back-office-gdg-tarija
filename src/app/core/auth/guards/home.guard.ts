import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ACCESS_CHECK_URL, RoleLookupError } from '../role-lookup-error';
import { AuthService } from '../services/auth.service';

/** Inicio (dashboard) solo para SUPERADMIN; STAFF entra directo a /checkin. UX-only: la seguridad es RLS. */
export const homeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  let role = auth.role();
  if (!role) {
    try {
      role = await auth.resolveRole();
    } catch (err) {
      if (!(err instanceof RoleLookupError)) throw err;
      return router.createUrlTree([ACCESS_CHECK_URL]);
    }
    if (role) auth.role.set(role);
  }

  if (role === 'SUPERADMIN') return true;
  return router.createUrlTree(['/checkin']);
};
