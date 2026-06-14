import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { EventsRepository } from '../../../domain/events.repository';
import { EventsApi } from '../../../data/events.api';
import { Event } from '../../../domain/event.model';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
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
  private readonly router = inject(Router);

  readonly events = signal<Event[]>([]);
  readonly loadingEvents = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);

  // Global search filters
  readonly globalFilter = signal<string>('');

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

  viewAttendees(event: Event): void {
    this.router.navigate(['/events', event.id, 'attendees']);
  }

  getEventStatusSeverity(event: Event): 'success' | 'secondary' {
    return event.isPublished ? 'success' : 'secondary';
  }
}
