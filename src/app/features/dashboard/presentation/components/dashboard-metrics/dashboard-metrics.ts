import { Component, input } from '@angular/core';

import { BsPipe } from '../../../../../shared/pipes/bs.pipe';
import { StatCard } from '../../../../../shared/components/stat-card/stat-card';

@Component({
  selector: 'app-dashboard-metrics',
  standalone: true,
  imports: [BsPipe, StatCard],
  templateUrl: './dashboard-metrics.html',
})
export class DashboardMetrics {
  totalEventsCount = input.required<number>();
  totalRegistrationsCount = input.required<number>();
  confirmedCount = input.required<number>();
  pendingCount = input.required<number>();
  collected = input.required<number>();
  receivable = input.required<number>();
}
