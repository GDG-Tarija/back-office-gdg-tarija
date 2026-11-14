import { Component, HostListener, inject } from '@angular/core';

import { LOGOS } from '../../../core/config/logos';
import { AuthService } from '../../../core/auth/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);

  readonly logo = LOGOS.horizontal;
  readonly loading = this.auth.loading;
  readonly error = this.auth.authError;

  @HostListener('window:pageshow', ['$event'])
  onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) this.auth.resetLoading();
  }

  loginWithGoogle(): void {
    this.auth.signInWithGoogle();
  }
}
