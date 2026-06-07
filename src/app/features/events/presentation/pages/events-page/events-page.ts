import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { EventsRepository } from '../../../domain/events.repository';
import { EventsApi } from '../../../data/events.api';
import { Event, Attendee } from '../../../domain/event.model';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ProgressSpinnerModule,
    TagModule,
    DatePipe,
  ],
  providers: [{ provide: EventsRepository, useClass: EventsApi }],
  templateUrl: './events-page.html',
  styleUrl: './events-page.scss',
})
export class EventsPage implements OnInit {
  private readonly eventsRepo = inject(EventsRepository);

  readonly events = signal<Event[]>([]);
  readonly loadingEvents = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);

  readonly selectedEvent = signal<Event | null>(null);
  readonly attendees = signal<Attendee[]>([]);
  readonly loadingAttendees = signal<boolean>(false);
  readonly showAttendeesDialog = signal<boolean>(false);

  // Global search filters
  readonly globalFilter = signal<string>('');
  readonly attendeeGlobalFilter = signal<string>('');

  ngOnInit(): void {
    this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    this.loadingEvents.set(true);
    this.errorMsg.set(null);
    try {
      const data = await this.eventsRepo.getEvents();
      this.events.set(data);
    } catch (err) {
      console.error(err);
      this.errorMsg.set('No se pudieron cargar los eventos. Por favor intente más tarde.');
    } finally {
      this.loadingEvents.set(false);
    }
  }

  async viewAttendees(event: Event): Promise<void> {
    this.selectedEvent.set(event);
    this.attendees.set([]);
    this.loadingAttendees.set(true);
    this.showAttendeesDialog.set(true);
    this.attendeeGlobalFilter.set('');

    try {
      const data = await this.eventsRepo.getAttendees(event.id);
      this.attendees.set(data);
    } catch (err) {
      console.error(err);
    } finally {
      this.loadingAttendees.set(false);
    }
  }

  getEventStatusSeverity(event: Event): 'success' | 'secondary' {
    return event.isPublished ? 'success' : 'secondary';
  }

  getRoleSeverity(role: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (role?.toUpperCase()) {
      case 'ORGANIZER':
        return 'danger';
      case 'SPEAKER':
        return 'warn';
      case 'VOLUNTEER':
        return 'info';
      default:
        return 'secondary';
    }
  }

  getStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return 'success';
      case 'PENDING':
        return 'warn';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  translateRole(role: string): string {
    switch (role?.toUpperCase()) {
      case 'ORGANIZER':
        return 'Organizador';
      case 'SPEAKER':
        return 'Expositor';
      case 'VOLUNTEER':
        return 'Voluntario';
      case 'ATTENDEE':
        return 'Asistente';
      default:
        return role || 'Asistente';
    }
  }

  translateStatus(status: string): string {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return 'Confirmado';
      case 'PENDING':
        return 'Pendiente';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return status || 'Desconocido';
    }
  }
}
