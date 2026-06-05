import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const session = await auth.getSession();
  if (!session) {
    await router.navigateByUrl('/auth/login');
    return false;
  }

  return true;
};
