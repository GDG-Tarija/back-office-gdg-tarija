import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
// Signal Forms es experimental en Angular 21.2; ver nota en event-basics-form.
import { FormField, form } from '@angular/forms/signals';

import { InputTextModule } from 'primeng/inputtext';

import { validateStaffEmail } from '../../../domain/event-validators';
import { StaffAssignment } from '../../../domain/staff-assignment.model';
import { StaffAssignmentsRepository } from '../../../domain/staff-assignments.repository';

@Component({
  selector: 'app-staff-assignment-editor',
  standalone: true,
  imports: [FormField, InputTextModule],
  templateUrl: './staff-assignment-editor.html',
})
export class StaffAssignmentEditor implements OnInit {
  private readonly repo = inject(StaffAssignmentsRepository);

  readonly eventId = input.required<string>();

  readonly assignments = signal<StaffAssignment[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly adding = signal(false);
  readonly submitted = signal(false);
  readonly removingId = signal<string | null>(null);
  readonly model = signal({ email: '' });
  readonly f = form(this.model);

  readonly validation = computed(() =>
    validateStaffEmail(
      this.model().email,
      this.assignments().map((a) => a.staffEmail),
    ),
  );

  readonly emailError = computed(() =>
    this.submitted() ? (this.validation().errors[0]?.message ?? null) : null,
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.assignments.set(await this.repo.list(this.eventId()));
    } catch (err) {
      this.loadError.set(
        err instanceof Error ? err.message : 'No se pudieron cargar las asignaciones.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async add(): Promise<void> {
    this.submitted.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    if (this.validation().errors.length > 0 || this.adding()) return;
    const email = this.model().email.trim().toLowerCase();
    this.adding.set(true);
    try {
      const saved = await this.repo.add(this.eventId(), email);
      this.assignments.update((list) => [...list, saved]);
      this.model.set({ email: '' });
      this.submitted.set(false);
      this.notice.set(`${saved.staffEmail} asignado al evento.`);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'No se pudo asignar el correo.');
    } finally {
      this.adding.set(false);
    }
  }

  async remove(a: StaffAssignment): Promise<void> {
    if (this.removingId()) return;
    this.notice.set(null);
    this.actionError.set(null);
    this.removingId.set(a.id);
    try {
      await this.repo.remove(a.id);
      this.assignments.update((list) => list.filter((x) => x.id !== a.id));
      this.notice.set(`${a.staffEmail} quitado del evento.`);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'No se pudo quitar la asignación.');
    } finally {
      this.removingId.set(null);
    }
  }
}
