import { Component, input } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { StatCard } from '../../../../../shared/components/stat-card/stat-card';

@Component({
  selector: 'app-dashboard-metrics',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, StatCard],
  templateUrl: './dashboard-metrics.html',
  styleUrl: './dashboard-metrics.scss',
})
export class DashboardMetrics {
  totalEventsCount = input.required<number>();
  totalRegistrationsCount = input.required<number>();
  confirmedAttendeesCount = input.required<number>();
  totalCashFlow = input.required<number>();
  approvedCashFlow = input.required<number>();
  pendingCashFlow = input.required<number>();
}
