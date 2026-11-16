import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { SelectModule } from 'primeng/select';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { UsersApi } from '../../../../users/data/users.api';
import { BackofficeUser } from '../../../../users/domain/backoffice-user.model';
import { displayName } from '../../../../users/domain/user-rules';
import { UsersRepository } from '../../../../users/domain/users.repository';
import { toUserMessage } from '../../../data/postgres-error.mapper';
import { StaffAssignment } from '../../../domain/staff-assignment.model';
import { StaffAssignmentsRepository } from '../../../domain/staff-assignments.repository';

/**
 * Staff de check-in del evento. Solo se eligen personas que ya tienen acceso al back-office como
 * STAFF (la base lo exige con una FK): asignar a un evento nunca da acceso por sí solo.
 */
@Component({
  selector: 'app-staff-assignment-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, SelectModule],
  providers: [{ provide: UsersRepository, useClass: UsersApi }],
  templateUrl: './staff-assignment-editor.html',
})
export class StaffAssignmentEditor implements OnInit {
  private readonly repo = inject(StaffAssignmentsRepository);
  private readonly usersRepo = inject(UsersRepository);
  private readonly feedback = inject(FeedbackService);

  readonly eventId = input.required<string>();

  readonly assignments = signal<StaffAssignment[]>([]);
  readonly staffUsers = signal<BackofficeUser[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly selectedEmail = signal<string | null>(null);
  readonly adding = signal(false);
  readonly removingId = signal<string | null>(null);

  readonly options = computed(() => {
    const taken = new Set(this.assignments().map((a) => a.staffEmail));
    return this.staffUsers()
      .filter((u) => !taken.has(u.email))
      .map((u) => ({ label: displayName(u), email: u.email, value: u.email }));
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [assignments, users] = await Promise.all([
        this.repo.list(this.eventId()),
        this.usersRepo.list(),
      ]);
      this.assignments.set(assignments);
      this.staffUsers.set(users.filter((u) => u.role === 'STAFF'));
    } catch (err) {
      this.loadError.set(toUserMessage(err, 'No se pudo cargar el staff del evento.', 'staff'));
    } finally {
      this.loading.set(false);
    }
  }

  nameOf(email: string): string | null {
    const user = this.staffUsers().find((u) => u.email === email);
    const name = user ? displayName(user) : null;
    return name && name !== email ? name : null;
  }

  async add(): Promise<void> {
    const email = this.selectedEmail();
    if (!email || this.adding()) return;
    this.actionError.set(null);
    this.adding.set(true);
    try {
      const saved = await this.repo.add(this.eventId(), email);
      this.assignments.update((list) => [...list, saved]);
      this.selectedEmail.set(null);
      this.feedback.success(
        `${this.nameOf(email) ?? email} ya puede hacer check-in en este evento.`,
      );
    } catch (err) {
      this.actionError.set(toUserMessage(err, 'No se pudo asignar a la persona.', 'staff'));
    } finally {
      this.adding.set(false);
    }
  }

  async remove(a: StaffAssignment): Promise<void> {
    if (this.removingId()) return;
    const who = this.nameOf(a.staffEmail) ?? a.staffEmail;
    const ok = await this.feedback.confirm({
      titulo: 'Quitar staff',
      mensaje: `${who} dejará de poder hacer check-in en este evento.`,
      aceptar: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    this.actionError.set(null);
    this.removingId.set(a.id);
    try {
      await this.repo.remove(a.id);
      this.assignments.update((list) => list.filter((x) => x.id !== a.id));
      this.feedback.success(`${who} quitado del evento.`);
    } catch (err) {
      this.actionError.set(toUserMessage(err, 'No se pudo quitar la asignación.', 'staff'));
    } finally {
      this.removingId.set(null);
    }
  }
}
