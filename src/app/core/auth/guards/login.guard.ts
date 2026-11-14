import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/** /auth/login no tiene sentido con sesión activa: lleva al inicio (que decide según el rol). */
export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const session = await auth.getSession();
  return session ? router.createUrlTree(['/dashboard']) : true;
};
