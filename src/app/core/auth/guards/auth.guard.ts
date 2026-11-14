import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { REDIRECT_KEY } from '../redirect';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const session = await auth.getSession();
  if (!session) {
    // El callback de OAuth vuelve a esta URL tras iniciar sesión (deep link).
    sessionStorage.setItem(REDIRECT_KEY, state.url);
    await router.navigateByUrl('/auth/login');
    return false;
  }

  const role = await auth.resolveRole();
  if (!role) {
    await auth.denyAccess(session.user?.email);
    return false;
  }
  auth.role.set(role);

  return true;
};
