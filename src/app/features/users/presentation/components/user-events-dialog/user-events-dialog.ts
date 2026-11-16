import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { SelectModule } from 'primeng/select';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { EventsApi } from '../../../../events/data/events.api';
import { toUserMessage } from '../../../../events/data/postgres-error.mapper';
import { StaffAssignmentsApi } from '../../../../events/data/staff-assignments.api';
import { sortEventsForList } from '../../../../events/domain/event-list';
import { Event } from '../../../../events/domain/event.model';
import { EventsRepository } from '../../../../events/domain/events.repository';
import { StaffAssignmentsRepository } from '../../../../events/domain/staff-assignments.repository';
import { AssignedEvent, BackofficeUser } from '../../../domain/backoffice-user.model';
import { displayName } from '../../../domain/user-rules';

/** Eventos en los que un Staff de check-in puede ver asistentes y hacer check-in. */
@Component({
  selector: 'app-user-events-dialog',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, SelectModule, DialogFrame],
  providers: [
    { provide: EventsRepository, useClass: EventsApi },
    { provide: StaffAssignmentsRepository, useClass: StaffAssignmentsApi },
  ],
  templateUrl: './user-events-dialog.html',
})
export class UserEventsDialog implements OnInit {
  private readonly eventsRepo = inject(EventsRepository);
  private readonly assignmentsRepo = inject(StaffAssignmentsRepository);
  private readonly feedback = inject(FeedbackService);

  readonly user = input.required<BackofficeUser>();
  /** `changed` = hubo altas o bajas: la lista de usuarios debe recargarse. */
  readonly closed = output<{ changed: boolean }>();

  readonly events = signal<Event[]>([]);
  readonly assigned = signal<AssignedEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectedEventId = signal<string | null>(null);
  readonly busy = signal(false);
  private changed = false;

  readonly name = computed(() => displayName(this.user()));
  readonly options = computed(() => {
    const taken = new Set(this.assigned().map((a) => a.eventId));
    return sortEventsForList(this.events(), new Date())
      .filter((e) => !taken.has(e.id))
      .map((e) => ({ label: e.title, value: e.id, dateStart: e.dateStart }));
  });

  ngOnInit(): void {
    this.assigned.set(this.user().assignedEvents);
    void this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    this.loading.set(true);
    try {
      this.events.set(await this.eventsRepo.getEvents());
    } catch (err) {
      this.error.set(toUserMessage(err, 'No se pudieron cargar los eventos.'));
    } finally {
      this.loading.set(false);
    }
  }

  async add(): Promise<void> {
    const eventId = this.selectedEventId();
    const event = this.events().find((e) => e.id === eventId);
    if (!event || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const saved = await this.assignmentsRepo.add(event.id, this.user().email);
      this.assigned.update((list) => [
        {
          assignmentId: saved.id,
          eventId: event.id,
          title: event.title,
          dateStart: event.dateStart,
        },
        ...list,
      ]);
      this.selectedEventId.set(null);
      this.changed = true;
      this.feedback.success(`${this.name()} ya puede hacer check-in en ${event.title}.`);
    } catch (err) {
      this.error.set(toUserMessage(err, 'No se pudo asignar el evento.', 'staff'));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(a: AssignedEvent): Promise<void> {
    if (this.busy()) return;
    const ok = await this.feedback.confirm({
      titulo: 'Quitar evento',
      mensaje: `${this.name()} dejará de ver asistentes y de hacer check-in en ${a.title}.`,
      aceptar: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.assignmentsRepo.remove(a.assignmentId);
      this.assigned.update((list) => list.filter((x) => x.assignmentId !== a.assignmentId));
      this.changed = true;
    } catch (err) {
      this.error.set(toUserMessage(err, 'No se pudo quitar el evento.', 'staff'));
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    this.closed.emit({ changed: this.changed });
  }
}
