import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ProgressSpinnerModule } from 'primeng/progressspinner';

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
        if (session && !this.auth.isWhitelisted(session.user?.email)) {
          await this.auth.signOutWithError(
            'Tu correo no está autorizado para acceder a este panel.',
          );
          return;
        }
        const redirectTo = this.getSafeRedirect(sessionStorage.getItem('redirect_to'));
        sessionStorage.removeItem('redirect_to');
        await this.router.navigateByUrl(redirectTo);
      })
      .catch(() => this.router.navigateByUrl('/auth/login'));
  }

  private getSafeRedirect(value: string | null): string {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
    if (value.startsWith('/auth/')) return '/dashboard';

    return value;
  }
}
