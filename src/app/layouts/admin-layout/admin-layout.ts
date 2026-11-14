import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';

import { LOGOS } from '../../core/config/logos';
import { AuthService } from '../../core/auth/services/auth.service';
import { ThemeService } from '../../core/services/theme';

const DESKTOP_QUERY = '(min-width: 768px)';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmDialogModule, ToastModule],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  host: { '(document:keydown.escape)': 'closeOnEscape()' },
})
export class AdminLayout {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly injector = inject(Injector);

  readonly logo = LOGOS.horizontal;
  readonly isSidebarOpen = signal(false);
  readonly isDesktop = signal(this.matchDesktop());

  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly main = viewChild<ElementRef<HTMLElement>>('main');

  /** En móvil el drawer cerrado no debe ser alcanzable por teclado ni lector de pantalla. */
  readonly drawerInert = computed(() => !this.isDesktop() && !this.isSidebarOpen());
  readonly isSuperadmin = computed(() => this.auth.role() === 'SUPERADMIN');
  readonly homeLink = computed(() => (this.isSuperadmin() ? '/dashboard' : '/checkin'));

  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    if (role === 'SUPERADMIN') return 'Super Admin';
    if (role === 'STAFF') return 'Staff';
    return null;
  });

  constructor() {
    if (typeof matchMedia === 'function') {
      const query = matchMedia(DESKTOP_QUERY);
      query.addEventListener('change', (e) => {
        this.isDesktop.set(e.matches);
        if (e.matches) this.isSidebarOpen.set(false);
      });
    }
  }

  toggleSidebar(): void {
    if (this.isSidebarOpen()) this.closeSidebar();
    else this.openSidebar();
  }

  openSidebar(): void {
    this.isSidebarOpen.set(true);
    afterNextRender(() => this.closeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  closeSidebar(returnFocus = true): void {
    if (!this.isSidebarOpen()) return;
    this.isSidebarOpen.set(false);
    if (returnFocus) this.menuButton()?.nativeElement.focus();
  }

  closeSidebarOnMobile(): void {
    this.closeSidebar();
  }

  closeOnEscape(): void {
    if (!this.isDesktop()) this.closeSidebar();
  }

  skipToContent(event: Event): void {
    event.preventDefault();
    this.main()?.nativeElement.focus();
  }

  private matchDesktop(): boolean {
    return typeof matchMedia !== 'function' || matchMedia(DESKTOP_QUERY).matches;
  }
}
