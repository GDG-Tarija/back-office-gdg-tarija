import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/** Solo SUPERADMIN. UX-only: la seguridad real son las políticas RLS. */
export const superadminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  let role = auth.role();
  if (!role) {
    role = await auth.resolveRole();
    if (role) auth.role.set(role);
  }

  if (role === 'SUPERADMIN') return true;
  return router.createUrlTree(['/events'], { queryParams: { forbidden: '1' } });
};
