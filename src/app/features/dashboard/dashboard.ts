import { Component, inject } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

import { AuthService } from '../../core/auth/services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  readonly auth = inject(AuthService);
}
