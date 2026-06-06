import { Component, inject } from '@angular/core';

import { ButtonModule } from 'primeng/button';

import { LOGOS } from '../../../core/config/logos';
import { AuthService } from '../../../core/auth/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ButtonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);

  readonly logo = LOGOS.horizontal;
  readonly loading = this.auth.loading;
  readonly error = this.auth.authError;

  loginWithGoogle(): void {
    this.auth.signInWithGoogle();
  }
}
