import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatBadgeSeverity = 'blue' | 'red' | 'green' | 'yellow' | 'neutral';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stat-card.html',
  styleUrl: './stat-card.scss',
})
export class StatCard {
  title = input.required<string>();
  value = input.required<string | number>();
  icon = input.required<string>();
  badge = input<string | null>(null);
  badgeSeverity = input<StatBadgeSeverity>('neutral');
  iconSeverity = input<StatBadgeSeverity>('blue');

  getIconClasses(): string {
    switch (this.iconSeverity()) {
      case 'blue':
        return 'bg-google-blue-light/60 dark:bg-google-blue/20 text-google-blue';
      case 'red':
        return 'bg-google-red-light/60 dark:bg-google-red/20 text-google-red';
      case 'green':
        return 'bg-google-green-light/60 dark:bg-google-green/20 text-google-green';
      case 'yellow':
        return 'bg-google-yellow-light/60 dark:bg-google-yellow/20 text-google-yellow';
      default:
        return 'bg-neutral-100 dark:bg-neutral-800 text-text-secondary dark:text-neutral-300';
    }
  }

  getBadgeClasses(): string {
    switch (this.badgeSeverity()) {
      case 'blue':
        return 'bg-google-blue-light/60 dark:bg-google-blue/20 text-google-blue';
      case 'red':
        return 'bg-google-red-light/60 dark:bg-google-red/20 text-google-red';
      case 'green':
        return 'bg-google-green-light/60 dark:bg-google-green/20 text-google-green';
      case 'yellow':
        return 'bg-google-yellow-light/60 dark:bg-google-yellow/20 text-google-yellow';
      default:
        return 'bg-neutral-100 dark:bg-neutral-800 text-text-secondary dark:text-neutral-400';
    }
  }
}
