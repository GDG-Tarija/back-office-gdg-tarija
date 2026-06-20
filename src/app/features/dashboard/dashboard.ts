import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { AuthService } from '../../core/auth/services/auth.service';
import { DashboardRepository } from './domain/dashboard.repository';
import { DashboardApi } from './data/dashboard.api';
import {
  DashboardEvent,
  DashboardRegistration,
  RecentRegistration,
} from './domain/dashboard.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CardModule,
    SelectModule,
    DatePickerModule,
    ProgressSpinnerModule,
    TagModule,
    CurrencyPipe,
    PercentPipe,
  ],
  providers: [{ provide: DashboardRepository, useClass: DashboardApi }],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  readonly auth = inject(AuthService);
  private readonly dashboardRepo = inject(DashboardRepository);

  // States
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // Data signals
  readonly events = signal<DashboardEvent[]>([]);
  readonly registrations = signal<DashboardRegistration[]>([]);
  readonly recentRegistrations = signal<RecentRegistration[]>([]);

  // Filter signals
  readonly filterEventId = signal<string | null>(null);
  readonly filterRole = signal<string | null>(null);
  readonly filterDateRange = signal<Date[] | null>(null);

  // Constants
  readonly roleOptions = [
    { label: 'Todos los roles', value: null as string | null },
    { label: 'Asistente', value: 'ATTENDEE' },
    { label: 'Expositor', value: 'SPEAKER' },
    { label: 'Organizador', value: 'ORGANIZER' },
    { label: 'Voluntario', value: 'VOLUNTEER' },
  ];

  ngOnInit(): void {
    this.loadDashboardData();
  }

  async loadDashboardData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [eventsData, regsData, recentRegsData] = await Promise.all([
        this.dashboardRepo.getEvents(),
        this.dashboardRepo.getRegistrations(),
        this.dashboardRepo.getRecentRegistrations(10),
      ]);

      this.events.set(eventsData);
      this.registrations.set(regsData);
      this.recentRegistrations.set(recentRegsData);
    } catch (err) {
      console.error(err);
      this.error.set('Error al cargar la información del panel administrativo.');
    } finally {
      this.loading.set(false);
    }
  }

  // Event list for select dropdown
  readonly eventOptions = computed(() => {
    const list = this.events();
    return [
      { label: 'Todos los eventos', value: null as string | null },
      ...list.map((e) => ({ label: e.title, value: e.id })),
    ];
  });

  // Filtered lists
  readonly filteredEvents = computed(() => {
    let list = this.events();
    const eventId = this.filterEventId();
    if (eventId) {
      list = list.filter((e) => e.id === eventId);
    }

    const dates = this.filterDateRange();
    if (dates && dates.length > 0 && dates[0]) {
      const start = new Date(dates[0]);
      start.setHours(0, 0, 0, 0);

      let end: Date | null = null;
      if (dates[1]) {
        end = new Date(dates[1]);
        end.setHours(23, 59, 59, 999);
      }

      list = list.filter((e) => {
        const d = e.dateStart;
        if (end) {
          return d >= start && d <= end;
        }
        return d >= start;
      });
    }

    return list;
  });

  readonly filteredRegistrations = computed(() => {
    let list = this.registrations();
    const eventId = this.filterEventId();
    if (eventId) {
      list = list.filter((r) => r.eventId === eventId);
    }

    const role = this.filterRole();
    if (role) {
      list = list.filter((r) => r.role === role);
    }

    const dates = this.filterDateRange();
    if (dates && dates.length > 0 && dates[0]) {
      const start = new Date(dates[0]);
      start.setHours(0, 0, 0, 0);

      let end: Date | null = null;
      if (dates[1]) {
        end = new Date(dates[1]);
        end.setHours(23, 59, 59, 999);
      }

      list = list.filter((r) => {
        const d = r.createdAt;
        if (end) {
          return d >= start && d <= end;
        }
        return d >= start;
      });
    }

    return list;
  });

  // Dynamic calculated metrics
  readonly totalEventsCount = computed(() => this.filteredEvents().length);
  readonly totalRegistrationsCount = computed(() => this.filteredRegistrations().length);

  readonly confirmedAttendeesCount = computed(() => {
    return this.filteredRegistrations().filter((r) => r.status === 'CONFIRMED').length;
  });

  readonly pendingAttendeesCount = computed(() => {
    return this.filteredRegistrations().filter((r) => r.status === 'PENDING').length;
  });

  readonly approvedCashFlow = computed(() => {
    return this.filteredRegistrations()
      .filter((r) => r.status === 'CONFIRMED')
      .reduce((sum, r) => sum + r.price, 0);
  });

  readonly pendingCashFlow = computed(() => {
    return this.filteredRegistrations()
      .filter((r) => r.status === 'PENDING')
      .reduce((sum, r) => sum + r.price, 0);
  });

  readonly totalCashFlow = computed(() => this.approvedCashFlow() + this.pendingCashFlow());

  readonly capacityFillRate = computed(() => {
    const evs = this.filteredEvents();
    if (evs.length === 0) return 0;

    const totalCapacity = evs.reduce((sum, e) => sum + e.capacity, 0);
    if (totalCapacity === 0) return 0;

    const eventIds = new Set(evs.map((e) => e.id));
    const regs = this.registrations().filter(
      (r) => eventIds.has(r.eventId) && r.status !== 'CANCELLED',
    );

    return regs.length / totalCapacity; // Returns decimal (0 to 1) for PercentPipe
  });

  // Distributions
  readonly roleDistribution = computed(() => {
    const regs = this.filteredRegistrations();
    if (regs.length === 0) return [];

    const counts: Record<string, number> = {
      ATTENDEE: 0,
      SPEAKER: 0,
      ORGANIZER: 0,
      VOLUNTEER: 0,
    };

    regs.forEach((r) => {
      const role = r.role?.toUpperCase() || 'ATTENDEE';
      if (counts[role] !== undefined) {
        counts[role]++;
      } else {
        counts['ATTENDEE']++;
      }
    });

    const total = regs.length;
    return [
      {
        label: 'Asistentes',
        value: counts['ATTENDEE'],
        percentage: counts['ATTENDEE'] / total,
        colorClass: 'bg-google-blue dark:bg-google-blue/80',
        textClass: 'text-google-blue',
      },
      {
        label: 'Expositores',
        value: counts['SPEAKER'],
        percentage: counts['SPEAKER'] / total,
        colorClass: 'bg-google-yellow dark:bg-google-yellow/80',
        textClass: 'text-google-yellow',
      },
      {
        label: 'Organizadores',
        value: counts['ORGANIZER'],
        percentage: counts['ORGANIZER'] / total,
        colorClass: 'bg-google-red dark:bg-google-red/80',
        textClass: 'text-google-red',
      },
      {
        label: 'Voluntarios',
        value: counts['VOLUNTEER'],
        percentage: counts['VOLUNTEER'] / total,
        colorClass: 'bg-google-green dark:bg-google-green/80',
        textClass: 'text-google-green',
      },
    ].filter((item) => item.value > 0);
  });

  readonly statusDistribution = computed(() => {
    const regs = this.filteredRegistrations();
    if (regs.length === 0) return [];

    const counts: Record<string, number> = {
      CONFIRMED: 0,
      PENDING: 0,
      CANCELLED: 0,
    };

    regs.forEach((r) => {
      const status = r.status?.toUpperCase() || 'PENDING';
      if (counts[status] !== undefined) {
        counts[status]++;
      } else {
        counts['PENDING']++;
      }
    });

    const total = regs.length;
    return [
      {
        label: 'Confirmados',
        value: counts['CONFIRMED'],
        percentage: counts['CONFIRMED'] / total,
        severity: 'success' as const,
        colorClass: 'bg-google-green dark:bg-google-green/80',
      },
      {
        label: 'Pendientes',
        value: counts['PENDING'],
        percentage: counts['PENDING'] / total,
        severity: 'warn' as const,
        colorClass: 'bg-google-yellow dark:bg-google-yellow/80',
      },
      {
        label: 'Cancelados',
        value: counts['CANCELLED'],
        percentage: counts['CANCELLED'] / total,
        severity: 'danger' as const,
        colorClass: 'bg-google-red dark:bg-google-red/80',
      },
    ].filter((item) => item.value > 0);
  });

  // Daily trend grouping (Chronological, last 7 active days ending at latest registration)
  readonly dailyTrend = computed(() => {
    const regs = this.filteredRegistrations();
    if (regs.length === 0) {
      // Fallback to last 7 days ending today
      const list = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        list.push({
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          count: 0,
          timestamp: d.getTime(),
        });
      }
      return list;
    }

    // Find latest registration date
    let maxDate = new Date(0);
    regs.forEach((r) => {
      if (r.createdAt > maxDate) {
        maxDate = new Date(r.createdAt);
      }
    });
    if (maxDate.getTime() === 0) {
      maxDate = new Date();
    }

    // Create 7 days ending at maxDate
    const dayMap = new Map<string, { label: string; count: number; timestamp: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(maxDate);
      d.setDate(maxDate.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;
      dayMap.set(key, { label: dayLabel, count: 0, timestamp: d.getTime() });
    }

    // Populate counts
    regs.forEach((r) => {
      const d = r.createdAt;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayMap.has(key)) {
        const item = dayMap.get(key)!;
        item.count++;
      }
    });

    return Array.from(dayMap.values());
  });

  readonly maxTrendValue = computed(() => {
    const trend = this.dailyTrend();
    if (trend.length === 0) return 10;
    return Math.max(...trend.map((t) => t.count), 10);
  });

  // SVG Bar Chart Coordinates
  readonly barCoords = computed(() => {
    const trend = this.dailyTrend();
    const max = this.maxTrendValue();
    if (trend.length === 0) return [];

    const startX = 40;
    const width = 420;
    const height = 100;
    const baselineY = 120;

    const n = trend.length;
    const barWidth = 24;

    return trend.map((t, idx) => {
      const xCenter = n > 1 ? startX + (idx / (n - 1)) * width : startX + width / 2;
      const x = xCenter - barWidth / 2;
      const barHeight = (t.count / max) * height;
      const y = baselineY - barHeight;
      return {
        x,
        y,
        width: barWidth,
        height: barHeight,
        label: t.label,
        count: t.count,
      };
    });
  });

  // Helpers for table roles & statuses
  getRoleSeverity(role: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (role?.toUpperCase()) {
      case 'ORGANIZER':
        return 'danger';
      case 'SPEAKER':
        return 'warn';
      case 'VOLUNTEER':
        return 'info';
      default:
        return 'secondary';
    }
  }

  getStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return 'success';
      case 'PENDING':
        return 'warn';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  translateRole(role: string): string {
    switch (role?.toUpperCase()) {
      case 'ORGANIZER':
        return 'Organizador';
      case 'SPEAKER':
        return 'Expositor';
      case 'VOLUNTEER':
        return 'Voluntario';
      case 'ATTENDEE':
        return 'Asistente';
      default:
        return role || 'Asistente';
    }
  }

  translateStatus(status: string): string {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return 'Confirmado';
      case 'PENDING':
        return 'Pendiente';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return status || 'Desconocido';
    }
  }

  // Reset all filters
  resetFilters(): void {
    this.filterEventId.set(null);
    this.filterRole.set(null);
    this.filterDateRange.set(null);
  }
}
