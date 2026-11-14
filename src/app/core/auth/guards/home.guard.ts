import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/** Inicio (dashboard) solo para SUPERADMIN; STAFF entra directo a /checkin. UX-only: la seguridad es RLS. */
export const homeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  let role = auth.role();
  if (!role) {
    role = await auth.resolveRole();
    if (role) auth.role.set(role);
  }

  if (role === 'SUPERADMIN') return true;
  return router.createUrlTree(['/checkin']);
};
