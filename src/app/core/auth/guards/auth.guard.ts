import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { BackofficeRole } from '../../models/role.model';
import { REDIRECT_KEY } from '../redirect';
import { ACCESS_CHECK_URL, RoleLookupError } from '../role-lookup-error';
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

  let role: BackofficeRole | null;
  try {
    role = await auth.resolveRole();
  } catch (err) {
    if (!(err instanceof RoleLookupError)) throw err;
    // Error de red o servidor: se conserva la sesión y se ofrece reintentar.
    sessionStorage.setItem(REDIRECT_KEY, state.url);
    return router.createUrlTree([ACCESS_CHECK_URL]);
  }
  if (!role) {
    await auth.denyAccess(session.user?.email);
    return false;
  }
  auth.role.set(role);

  return true;
};
