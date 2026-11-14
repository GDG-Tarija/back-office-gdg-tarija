import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { REDIRECT_KEY, safeRedirect } from '../../../core/auth/redirect';
import { ACCESS_CHECK_URL, RoleLookupError } from '../../../core/auth/role-lookup-error';
import { AuthService } from '../../../core/auth/services/auth.service';

@Component({
  selector: 'app-callback',
  imports: [ProgressSpinnerModule],
  template: `
    <section class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface-main p-6">
      <p-progress-spinner ariaLabel="Completando inicio de sesión" />
      <p class="text-sm font-medium text-text-secondary">Completando inicio de sesión...</p>
    </section>
  `,
})
export class Callback implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.auth
      .getSession()
      .then(async (session) => {
        if (session) {
          try {
            if (!(await this.auth.resolveRole())) {
              await this.auth.denyAccess(session.user?.email);
              return;
            }
          } catch (err) {
            if (!(err instanceof RoleLookupError)) throw err;
            await this.router.navigateByUrl(ACCESS_CHECK_URL);
            return;
          }
        }
        const redirectTo = safeRedirect(sessionStorage.getItem(REDIRECT_KEY));
        sessionStorage.removeItem(REDIRECT_KEY);
        await this.router.navigateByUrl(redirectTo);
      })
      .catch(() => this.router.navigateByUrl('/auth/login'));
  }
}
