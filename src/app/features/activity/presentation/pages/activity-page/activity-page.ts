import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { DatePickerModule } from 'primeng/datepicker';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';

import {
  filterDateClass,
  filterIconClass,
  filterSelectClass,
} from '../../../../../shared/utils/filter-field';
import { EventsApi } from '../../../../events/data/events.api';
import { toUserMessage } from '../../../../events/data/postgres-error.mapper';
import { sortEventsForList } from '../../../../events/domain/event-list';
import { EventsRepository } from '../../../../events/domain/events.repository';
import { UsersApi } from '../../../../users/data/users.api';
import { displayName } from '../../../../users/domain/user-rules';
import { UsersRepository } from '../../../../users/domain/users.repository';
import { AuditApi } from '../../../data/audit.api';
import { AuditCategory, AuditEntry, AuditFilters } from '../../../domain/audit-entry.model';
import { AuditRepository } from '../../../domain/audit.repository';
import { AUDIT_CATEGORY_OPTIONS } from '../../../domain/describe-audit';
import { AuditTimeline } from '../../components/audit-timeline/audit-timeline';

interface Option {
  label: string;
  value: string | null;
}

const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Quién hizo qué y cuándo, con filtros (solo SUPERADMIN). */
@Component({
  selector: 'app-activity-page',
  standalone: true,
  imports: [FormsModule, DatePickerModule, PaginatorModule, SelectModule, AuditTimeline],
  providers: [
    { provide: AuditRepository, useClass: AuditApi },
    { provide: UsersRepository, useClass: UsersApi },
    { provide: EventsRepository, useClass: EventsApi },
  ],
  templateUrl: './activity-page.html',
})
export class ActivityPage implements OnInit {
  private readonly repo = inject(AuditRepository);
  private readonly usersRepo = inject(UsersRepository);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pageSize = PAGE_SIZE;
  readonly entries = signal<AuditEntry[]>([]);
  readonly total = signal(0);
  readonly first = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly params = this.route.snapshot.queryParamMap;
  readonly eventId = signal<string | null>(this.params.get('evento'));
  readonly actorId = signal<string | null>(this.params.get('persona'));
  readonly category = signal<AuditCategory | null>(
    AUDIT_CATEGORY_OPTIONS.find((o) => o.value === this.params.get('tipo'))?.value ?? null,
  );
  readonly range = signal<Date[] | null>(null);

  readonly peopleOptions = signal<Option[]>([{ label: 'Todas las personas', value: null }]);
  readonly eventOptions = signal<Option[]>([{ label: 'Todos los eventos', value: null }]);
  readonly categoryOptions: Option[] = [
    { label: 'Todos los tipos', value: null },
    ...AUDIT_CATEGORY_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
  ];

  readonly filtersActive = computed(
    () => !!this.eventId() || !!this.actorId() || !!this.category() || !!this.range()?.[0],
  );

  readonly selectClass = (active: boolean) => filterSelectClass(active);
  readonly dateClass = (active: boolean) => filterDateClass(active);
  readonly iconClass = filterIconClass;

  ngOnInit(): void {
    void this.loadOptions();
    void this.load();
  }

  /** Las opciones son accesorias: si fallan, la actividad se ve igual. */
  private async loadOptions(): Promise<void> {
    const [users, events] = await Promise.allSettled([
      this.usersRepo.list(),
      this.eventsRepo.getEvents(),
    ]);
    if (users.status === 'fulfilled') {
      this.peopleOptions.set([
        { label: 'Todas las personas', value: null },
        ...users.value
          .filter((u) => u.userId)
          .map((u) => ({ label: displayName(u), value: u.userId })),
      ]);
    }
    if (events.status === 'fulfilled') {
      this.eventOptions.set([
        { label: 'Todos los eventos', value: null },
        ...sortEventsForList(events.value, new Date()).map((e) => ({
          label: e.title,
          value: e.id,
        })),
      ]);
    }
  }

  private filters(): AuditFilters {
    const [start, end] = this.range() ?? [];
    const from = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate()) : null;
    const last = end ?? start;
    const to = last
      ? new Date(new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime() + DAY_MS)
      : null;
    return {
      eventId: this.eventId(),
      actorId: this.actorId(),
      category: this.category(),
      registrationId: null,
      from,
      to,
    };
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.repo.list(this.filters(), PAGE_SIZE, this.first());
      this.entries.set(page.entries);
      this.total.set(page.total);
    } catch (err) {
      this.error.set(toUserMessage(err, 'No pudimos cargar la actividad. Inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }

  setEvent(value: string | null): void {
    this.eventId.set(value);
    this.applyFilters();
  }

  setActor(value: string | null): void {
    this.actorId.set(value);
    this.applyFilters();
  }

  setCategory(value: AuditCategory | null): void {
    this.category.set(value);
    this.applyFilters();
  }

  setRange(value: Date[] | null): void {
    this.range.set(value);
    // Con solo la fecha de inicio elegida todavía falta el fin: se espera al segundo clic.
    if (value && value[0] && !value[1]) return;
    this.applyFilters();
  }

  clearFilters(): void {
    this.eventId.set(null);
    this.actorId.set(null);
    this.category.set(null);
    this.range.set(null);
    this.applyFilters();
  }

  onPage(state: PaginatorState): void {
    this.first.set(state.first ?? 0);
    void this.load();
    document.querySelector('main')?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }

  private applyFilters(): void {
    this.first.set(0);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { evento: this.eventId(), persona: this.actorId(), tipo: this.category() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    void this.load();
  }
}
