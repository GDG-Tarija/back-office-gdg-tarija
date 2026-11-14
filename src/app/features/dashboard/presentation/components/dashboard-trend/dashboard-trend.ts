import { Component, computed, input } from '@angular/core';

import { TrendDay } from '../../../domain/dashboard-stats';

@Component({
  selector: 'app-dashboard-trend',
  standalone: true,
  templateUrl: './dashboard-trend.html',
})
export class DashboardTrend {
  days = input.required<TrendDay[]>();

  readonly max = computed(() => Math.max(1, ...this.days().map((d) => d.count)));
  readonly summary = computed(
    () =>
      'Inscripciones por día: ' +
      this.days()
        .map((d) => `${d.label}: ${d.count}`)
        .join(', '),
  );

  heightPercent(count: number): number {
    return (count / this.max()) * 100;
  }
}
