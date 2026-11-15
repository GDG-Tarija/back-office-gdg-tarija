import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BsPipe } from '../../../../../shared/pipes/bs.pipe';

@Component({
  selector: 'app-dashboard-metrics',
  standalone: true,
  imports: [BsPipe, RouterLink],
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
