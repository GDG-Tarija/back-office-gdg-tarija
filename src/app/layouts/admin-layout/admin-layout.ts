import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

import { ButtonModule } from 'primeng/button';

import { LOGOS } from '../../core/config/logos';
import { AuthService } from '../../core/auth/services/auth.service';
import { ThemeService } from '../../core/services/theme';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  readonly logo = LOGOS.horizontal;
  readonly isSidebarOpen = signal(false);

  toggleSidebar(): void {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }

  closeSidebarOnMobile(): void {
    this.isSidebarOpen.set(false);
  }
}
