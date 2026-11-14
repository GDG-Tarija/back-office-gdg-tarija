import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { REDIRECT_KEY, safeRedirect } from '../../../core/auth/redirect';
import { AuthService } from '../../../core/auth/services/auth.service';

/** Se llega aquí cuando no se pudo consultar el rol (red/servidor): la sesión sigue abierta. */
@Component({
  selector: 'app-access-check',
  template: `
    <div class="mx-auto w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8">
      <h1 class="text-2xl font-extrabold tracking-tight text-text-primary">
        No pudimos verificar tu acceso
      </h1>
      <p class="mt-2 text-sm text-text-secondary" role="alert">
        No pudimos verificar tu acceso. Revisa tu conexión y reintenta.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          class="inline-flex min-h-11 items-center rounded-full bg-google-blue px-5 font-semibold text-white disabled:opacity-60"
          [disabled]="retrying()"
          (click)="retry()"
        >
          {{ retrying() ? 'Reintentando…' : 'Reintentar' }}
        </button>
        <button
          type="button"
          class="inline-flex min-h-11 items-center rounded-full border border-neutral-300 px-5 font-semibold"
          (click)="signOut()"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  `,
})
export class AccessCheck {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly retrying = signal(false);

  async retry(): Promise<void> {
    this.retrying.set(true);
    const target = safeRedirect(sessionStorage.getItem(REDIRECT_KEY));
    // Si el rol sigue sin poder leerse, el guard devuelve aquí mismo.
    await this.router.navigateByUrl(target);
    this.retrying.set(false);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
