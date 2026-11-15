import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DashboardEvent } from '../../../domain/dashboard.model';
import { ProofsToReview, UpcomingEvent } from '../../../domain/dashboard-stats';

@Component({
  selector: 'app-dashboard-attention',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard-attention.html',
})
export class DashboardAttention {
  proofs = input.required<ProofsToReview[]>();
  drafts = input.required<DashboardEvent[]>();
  upcoming = input.required<UpcomingEvent[]>();

  readonly maxDrafts = 5;

  totalProofs(): number {
    return this.proofs().reduce((sum, p) => sum + p.count, 0);
  }

  isEmpty(): boolean {
    return this.proofs().length === 0 && this.drafts().length === 0 && this.upcoming().length === 0;
  }

  fillPercent(u: UpcomingEvent): number {
    return u.event.capacity > 0 ? Math.min((u.registered / u.event.capacity) * 100, 100) : 0;
  }
}
