import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

import { AuthService } from '../../core/auth/services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  readonly auth = inject(AuthService);
}
