import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { ButtonModule } from 'primeng/button';

import { DashboardApi } from '../../../data/dashboard.api';
import { DashboardEvent, DashboardRegistration } from '../../../domain/dashboard.model';
import { DashboardRepository } from '../../../domain/dashboard.repository';
import {
  capacityFillRate,
  computeCashFlow,
  countByStatus,
  dailyTrend,
  draftEvents,
  filterEvents,
  filterRegistrations,
  proofsToReview,
  roleDistribution,
  roleLabel,
  statusDistribution,
  upcomingEvents,
} from '../../../domain/dashboard-stats';
import { DashboardAttention } from '../../components/dashboard-attention/dashboard-attention';
import { DashboardFilters } from '../../components/dashboard-filters/dashboard-filters';
import { DashboardMetrics } from '../../components/dashboard-metrics/dashboard-metrics';
import { DashboardTrend } from '../../components/dashboard-trend/dashboard-trend';

const ROLE_COLORS: Record<string, string> = {
  ATTENDEE: 'bg-google-blue',
  SPEAKER: 'bg-google-yellow',
  ORGANIZER: 'bg-google-red',
  STAFF: 'bg-google-red',
  VOLUNTEER: 'bg-google-green',
  SPONSOR: 'bg-google-green',
  MENTOR: 'bg-google-yellow-dark',
  PARTNER: 'bg-google-blue-dark',
};

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-google-green',
  PENDING: 'bg-google-yellow',
  CANCELLED: 'bg-google-red',
};

const RING_RADIUS = 46;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    ButtonModule,
    DecimalPipe,
    DecimalPipe,
    PercentPipe,
    DashboardAttention,
    DashboardFilters,
    DashboardMetrics,
    DashboardTrend,
  ],
  providers: [{ provide: DashboardRepository, useClass: DashboardApi }],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  private readonly dashboardRepo = inject(DashboardRepository);

  readonly Math = Math;
  readonly ringLength = RING_LENGTH;
  readonly ringRadius = RING_RADIUS;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly events = signal<DashboardEvent[]>([]);
  readonly registrations = signal<DashboardRegistration[]>([]);
  readonly now = signal(new Date());

  readonly filterEventId = signal<string | null>(null);
  readonly filterRole = signal<string | null>(null);
  readonly filterDateRange = signal<Date[] | null>(null);

  readonly roleOptions = [
    { label: 'Todos los roles', value: null as string | null },
    ...[
      'ATTENDEE',
      'SPEAKER',
      'SPONSOR',
      'MENTOR',
      'PARTNER',
      'STAFF',
      'ORGANIZER',
      'VOLUNTEER',
    ].map((value) => ({
      label: roleLabel(value),
      value,
    })),
  ];

  readonly eventOptions = computed(() => [
    { label: 'Todos los eventos', value: null as string | null },
    ...this.events().map((e) => ({ label: e.title, value: e.id })),
  ]);

  private readonly filters = computed(() => ({
    eventId: this.filterEventId(),
    role: this.filterRole(),
    dateRange: this.filterDateRange(),
  }));

  // "Requiere atención" es operativo: no depende de los filtros.
  readonly proofs = computed(() => proofsToReview(this.events(), this.registrations()));
  readonly drafts = computed(() => draftEvents(this.events()));
  readonly upcoming = computed(() =>
    upcomingEvents(this.events(), this.registrations(), this.now()),
  );

  readonly filteredEvents = computed(() => filterEvents(this.events(), this.filters()));
  readonly filteredRegistrations = computed(() =>
    filterRegistrations(this.registrations(), this.filteredEvents(), this.filters()),
  );

  readonly cashFlow = computed(() => computeCashFlow(this.filteredRegistrations()));
  readonly confirmedCount = computed(() =>
    countByStatus(this.filteredRegistrations(), 'CONFIRMED'),
  );
  readonly pendingCount = computed(() => countByStatus(this.filteredRegistrations(), 'PENDING'));
  readonly fillRate = computed(() =>
    capacityFillRate(this.filteredEvents(), this.filteredRegistrations()),
  );
  readonly trend = computed(() => dailyTrend(this.filteredRegistrations(), this.now()));
  readonly trendTotal = computed(() => this.trend().reduce((sum, d) => sum + d.count, 0));

  readonly roles = computed(() =>
    roleDistribution(this.filteredRegistrations()).map((i) => ({
      ...i,
      colorClass: ROLE_COLORS[i.key] ?? 'bg-neutral-400',
    })),
  );
  readonly statuses = computed(() =>
    statusDistribution(this.filteredRegistrations()).map((i) => ({
      ...i,
      colorClass: STATUS_COLORS[i.key] ?? 'bg-neutral-400',
    })),
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [events, regs] = await Promise.all([
        this.dashboardRepo.getEvents(),
        this.dashboardRepo.getRegistrations(),
      ]);
      this.events.set(events);
      this.registrations.set(regs);
      this.now.set(new Date());
    } catch (err) {
      console.error(err);
      this.error.set('No se pudo cargar el inicio. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  resetFilters(): void {
    this.filterEventId.set(null);
    this.filterRole.set(null);
    this.filterDateRange.set(null);
  }
}
