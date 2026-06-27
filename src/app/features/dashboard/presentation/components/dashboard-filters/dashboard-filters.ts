import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';

export interface OptionItem {
  label: string;
  value: string | null;
}

@Component({
  selector: 'app-dashboard-filters',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, DatePickerModule, ButtonModule],
  templateUrl: './dashboard-filters.html',
  styleUrl: './dashboard-filters.scss',
})
export class DashboardFilters {
  eventOptions = input.required<OptionItem[]>();
  roleOptions = input.required<OptionItem[]>();

  selectedEventId = input<string | null>(null);
  selectedRole = input<string | null>(null);
  selectedDateRange = input<Date[] | null>(null);

  eventIdChange = output<string | null>();
  roleChange = output<string | null>();
  dateRangeChange = output<Date[] | null>();
  resetFilters = output<void>();

  onEventChange(value: string | null): void {
    this.eventIdChange.emit(value);
  }

  onRoleChange(value: string | null): void {
    this.roleChange.emit(value);
  }

  onDateChange(value: Date[] | null): void {
    this.dateRangeChange.emit(value);
  }

  onReset(): void {
    this.resetFilters.emit();
  }
}
