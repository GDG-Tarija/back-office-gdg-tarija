import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MenuItem } from 'primeng/api';
import { Menu, MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { BackofficeRole } from '../../../../../core/models/role.model';
import { FeedbackService } from '../../../../../core/services/feedback.service';
import { filterIconClass, filterSelectClass } from '../../../../../shared/utils/filter-field';
import { MOBILE_QUERY, mediaQuerySignal } from '../../../../../shared/utils/media-query';
import { toUserMessage } from '../../../../events/data/postgres-error.mapper';
import { UsersApi } from '../../../data/users.api';
import { BackofficeUser } from '../../../domain/backoffice-user.model';
import {
  ROLE_OPTIONS,
  canChangeRole,
  canRemove,
  displayName,
  filterUsers,
  initials,
  roleOption,
} from '../../../domain/user-rules';
import { UsersRepository } from '../../../domain/users.repository';
import { AddUserDialog } from '../../components/add-user-dialog/add-user-dialog';
import { UserEventsDialog } from '../../components/user-events-dialog/user-events-dialog';

/** Quién entra al back-office y con qué rol (solo SUPERADMIN). */
@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    FormsModule,
    MenuModule,
    SelectModule,
    TableModule,
    TagModule,
    AddUserDialog,
    UserEventsDialog,
  ],
  providers: [{ provide: UsersRepository, useClass: UsersApi }],
  templateUrl: './users-page.html',
})
export class UsersPage implements OnInit {
  private readonly repo = inject(UsersRepository);
  private readonly auth = inject(AuthService);
  private readonly feedback = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly rowMenu = viewChild.required<Menu>('rowMenu');

  readonly isMobile = mediaQuerySignal(MOBILE_QUERY);

  readonly users = signal<BackofficeUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly query = signal('');
  readonly roleFilter = signal<BackofficeRole | null>(null);
  readonly addOpen = signal(false);
  readonly eventsFor = signal<BackofficeUser | null>(null);
  readonly busyEmail = signal<string | null>(null);
  readonly menuItems = signal<MenuItem[]>([]);

  readonly roleFilterOptions = [
    { label: 'Todos los roles', value: null as BackofficeRole | null },
    ...ROLE_OPTIONS.map((o) => ({ label: o.label, value: o.value as BackofficeRole | null })),
  ];

  readonly currentEmail = computed(() => this.auth.user()?.email ?? null);
  readonly visible = computed(() =>
    filterUsers(this.users(), { query: this.query(), role: this.roleFilter() }),
  );
  readonly filtersActive = computed(() => !!this.query().trim() || this.roleFilter() !== null);
  readonly existingEmails = computed(() => this.users().map((u) => u.email));

  readonly selectClass = (active: boolean) => filterSelectClass(active);
  readonly iconClass = filterIconClass;
  readonly displayName = displayName;
  readonly initials = initials;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.users.set(await this.repo.list());
    } catch (err) {
      this.error.set(toUserMessage(err, 'No pudimos cargar los usuarios. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters(): void {
    this.query.set('');
    this.roleFilter.set(null);
  }

  isSelf(u: BackofficeUser): boolean {
    return u.email === this.currentEmail()?.toLowerCase();
  }

  roleLabel(u: BackofficeUser): string {
    return roleOption(u.role).label;
  }

  roleSeverity(u: BackofficeUser): 'info' | 'secondary' {
    return u.role === 'SUPERADMIN' ? 'info' : 'secondary';
  }

  openMenu(u: BackofficeUser, trigger: MouseEvent): void {
    const target: BackofficeRole = u.role === 'SUPERADMIN' ? 'STAFF' : 'SUPERADMIN';
    const roleCheck = canChangeRole(u, this.currentEmail());
    const removeCheck = canRemove(u, this.currentEmail(), this.users());
    const items: MenuItem[] = [];
    if (u.role === 'STAFF') {
      items.push({
        label: 'Eventos asignados',
        icon: 'event_available',
        command: () => this.eventsFor.set(u),
      });
    }
    if (u.userId) {
      items.push({
        label: 'Ver actividad',
        icon: 'history',
        command: () =>
          void this.router.navigate(['/activity'], { queryParams: { persona: u.userId } }),
      });
    }
    items.push(
      {
        label: `Cambiar a ${roleOption(target).label}`,
        icon: roleOption(target).icon,
        disabled: !roleCheck.ok,
        state: { hint: roleCheck.ok ? null : roleCheck.reason },
        command: () => void this.changeRole(u, target),
      },
      {
        label: 'Quitar acceso',
        icon: 'person_remove',
        disabled: !removeCheck.ok,
        state: { hint: removeCheck.ok ? null : removeCheck.reason, danger: true },
        command: () => void this.remove(u),
      },
    );
    this.menuItems.set(items);
    this.rowMenu().toggle(trigger);
  }

  async changeRole(u: BackofficeUser, target: BackofficeRole): Promise<void> {
    const name = displayName(u);
    const label = roleOption(target).label;
    const ok = await this.feedback.confirm({
      titulo: 'Cambiar rol',
      mensaje:
        target === 'SUPERADMIN'
          ? `${name} podrá ver y gestionar todo: eventos, inscripciones, pagos y usuarios.`
          : `${name} solo podrá ver asistentes y hacer check-in en los eventos que tenga asignados.`,
      aceptar: `Cambiar a ${label}`,
    });
    if (!ok) return;
    this.busyEmail.set(u.email);
    try {
      await this.repo.setRole(u.email, target);
      this.feedback.success(`${name} ahora es ${label}.`);
      await this.load();
    } catch (err) {
      this.feedback.error(toUserMessage(err, 'No se pudo cambiar el rol.', 'staff'));
    } finally {
      this.busyEmail.set(null);
    }
  }

  async remove(u: BackofficeUser): Promise<void> {
    const name = displayName(u);
    const events = u.assignedEvents.length;
    const ok = await this.feedback.confirm({
      titulo: 'Quitar acceso',
      mensaje:
        `${name} ya no podrá entrar al back-office` +
        (events > 0
          ? ` y dejará de estar asignado a ${events === 1 ? '1 evento' : `${events} eventos`}`
          : '') +
        '. Lo que hizo queda en el historial.',
      aceptar: 'Quitar acceso',
      peligro: true,
    });
    if (!ok) return;
    this.busyEmail.set(u.email);
    try {
      await this.repo.remove(u.email);
      this.feedback.success(`${name} ya no tiene acceso al back-office.`);
      await this.load();
    } catch (err) {
      this.feedback.error(toUserMessage(err, 'No se pudo quitar el acceso.', 'staff'));
    } finally {
      this.busyEmail.set(null);
    }
  }

  onAdded(email: string): void {
    this.addOpen.set(false);
    this.feedback.success(`${email} ya puede entrar con Google.`);
    void this.load();
  }

  onEventsClosed({ changed }: { changed: boolean }): void {
    this.eventsFor.set(null);
    if (changed) void this.load();
  }
}
