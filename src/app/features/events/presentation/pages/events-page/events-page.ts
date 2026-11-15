import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { MOBILE_QUERY, mediaQuerySignal } from '../../../../../shared/utils/media-query';
import { CheckinRepository } from '../../../../checkin/domain/checkin.repository';
import { eventsVisibleTo } from '../../../../checkin/domain/event-preselection';
import { EventsApi } from '../../../data/events.api';
import { Event } from '../../../domain/event.model';
import {
  EVENT_TIMING_LABELS,
  EventListFilters,
  EventStatusFilter,
  EventTimeFilter,
  eventFiltersToParams,
  eventTiming,
  eventTypeLabel,
  filterEvents,
  hasActiveEventFilters,
  parseEventFilters,
  sortEventsForList,
} from '../../../domain/event-list';
import { EventsRepository } from '../../../domain/events.repository';
import { CredentialGenerator } from '../../components/credential-generator/credential-generator';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    ButtonModule,
    MenuModule,
    PaginatorModule,
    SelectModule,
    TableModule,
    TagModule,
    CredentialGenerator,
  ],
  providers: [{ provide: EventsRepository, useClass: EventsApi }],
  templateUrl: './events-page.html',
  styleUrl: './events-page.scss',
})
export class EventsPage implements OnInit {
  private readonly eventsRepo = inject(EventsRepository);
  private readonly checkinRepo = inject(CheckinRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly rowMenu = viewChild.required<Menu>('rowMenu');

  /** Solo SUPERADMIN ve crear/editar (RLS sigue siendo la seguridad real). */
  readonly isSuperadmin = computed(() => this.auth.role() === 'SUPERADMIN');
  readonly forbidden = signal(this.route.snapshot.queryParamMap.get('forbidden') === '1');
  readonly credentialGenerator = viewChild<CredentialGenerator>(CredentialGenerator);

  /**
   * Patrón "tabla → tarjetas": en ≤ 768 px cada fila se pinta como tarjeta (`<ul>` de `<li>`)
   * en vez de `p-table`, con los mismos datos y la misma acción principal. Se decide con esta
   * señal (no con CSS) para no duplicar el DOM. Asistentes reutiliza `mediaQuerySignal`.
   */
  readonly isMobile = mediaQuerySignal(MOBILE_QUERY);

  readonly events = signal<Event[]>([]);
  readonly registered = signal<Record<string, number> | null>(null);
  readonly loadingEvents = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly now = signal(new Date());

  readonly filters = signal<EventListFilters>(parseEventFilters(this.route.snapshot.queryParamMap));
  readonly first = signal(0);
  readonly rows = 10;

  readonly rowMenuItems = signal<MenuItem[]>([]);

  readonly statusOptions: { label: string; value: EventStatusFilter }[] = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Borradores', value: 'DRAFT' },
    { label: 'Publicados', value: 'PUBLISHED' },
  ];
  readonly timeOptions: { label: string; value: EventTimeFilter }[] = [
    { label: 'Próximos', value: 'UPCOMING' },
    { label: 'Pasados', value: 'PAST' },
    { label: 'Todos', value: 'ALL' },
  ];

  readonly sorted = computed(() => sortEventsForList(this.events(), this.now()));
  readonly visible = computed(() => filterEvents(this.sorted(), this.filters(), this.now()));
  readonly page = computed(() => this.visible().slice(this.first(), this.first() + this.rows));
  readonly filtersActive = computed(() => hasActiveEventFilters(this.filters()));

  ngOnInit(): void {
    void this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    this.loadingEvents.set(true);
    this.errorMsg.set(null);
    try {
      this.now.set(new Date());
      const role = this.auth.role();
      // RLS deja a STAFF leer todos los publicados, pero solo tiene datos de los que tiene asignados.
      const [all, assigned] = await Promise.all([
        this.eventsRepo.getEvents(),
        role === 'STAFF' ? this.checkinRepo.getAssignedEventIds() : Promise.resolve([]),
      ]);
      this.events.set(eventsVisibleTo(role, all, assigned));
      // Los conteos son accesorios: si fallan, la lista se ve igual y muestra "—".
      this.eventsRepo
        .countActiveRegistrationsByEvent()
        .then((counts) => this.registered.set(counts))
        .catch(() => this.registered.set(null));
    } catch (err) {
      console.error(err);
      this.errorMsg.set('No pudimos cargar los eventos. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loadingEvents.set(false);
    }
  }

  setFilters(patch: Partial<EventListFilters>): void {
    const next = { ...this.filters(), ...patch };
    this.filters.set(next);
    this.first.set(0);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: eventFiltersToParams(next),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  clearFilters(): void {
    this.setFilters({ status: 'ALL', time: 'ALL', query: '' });
  }

  dismissForbidden(): void {
    this.forbidden.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { forbidden: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onPage(state: PaginatorState): void {
    this.first.set(state.first ?? 0);
  }

  /** Hub del evento: Configuración para SUPERADMIN, Asistentes para STAFF. */
  hubLink(event: Event): string[] {
    return ['/events', event.id, this.isSuperadmin() ? 'edit' : 'attendees'];
  }

  primaryLabel(): string {
    return this.isSuperadmin() ? 'Gestionar' : 'Asistentes';
  }

  typeLabel(event: Event): string {
    return eventTypeLabel(event.eventType);
  }

  timingLabel(event: Event): string {
    return EVENT_TIMING_LABELS[eventTiming(event, this.now())];
  }

  registeredLabel(event: Event): string {
    const count = this.registered()?.[event.id];
    if (this.registered() === null) return '—';
    return `${count ?? 0} / ${event.capacity}`;
  }

  openRowMenu(event: Event, trigger: MouseEvent): void {
    const items: MenuItem[] = [];
    if (this.isSuperadmin()) {
      items.push({
        label: 'Asistentes',
        icon: 'groups',
        command: () => void this.router.navigate(['/events', event.id, 'attendees']),
      });
    }
    items.push(
      {
        label: 'Check-in',
        icon: 'qr_code_scanner',
        command: () =>
          void this.router.navigate(['/checkin'], { queryParams: { event: event.id } }),
      },
      {
        label: 'Credenciales',
        icon: 'badge',
        command: () => this.credentialGenerator()?.open(event),
      },
    );
    this.rowMenuItems.set(items);
    this.rowMenu().toggle(trigger);
  }
}
