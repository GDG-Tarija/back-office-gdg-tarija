import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { EventsRepository } from '../../../domain/events.repository';
import { EventsApi } from '../../../data/events.api';
import { Event } from '../../../domain/event.model';
import { CredentialGenerator } from '../../components/credential-generator/credential-generator';

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
    TooltipModule,
    DatePipe,
    CredentialGenerator,
  ],
  providers: [{ provide: EventsRepository, useClass: EventsApi }],
  templateUrl: './events-page.html',
  styleUrl: './events-page.scss',
})
export class EventsPage implements OnInit {
  private readonly eventsRepo = inject(EventsRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  /** Solo SUPERADMIN ve crear/editar (RLS sigue siendo la seguridad real). */
  readonly isSuperadmin = computed(() => this.auth.role() === 'SUPERADMIN');
  readonly forbidden = this.route.snapshot.queryParamMap.get('forbidden') === '1';
  readonly credentialGenerator = viewChild<CredentialGenerator>(CredentialGenerator);

  readonly events = signal<Event[]>([]);
  readonly loadingEvents = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);
  readonly copiedId = signal<string | null>(null);

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

  copyToClipboard(id: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).then(() => {
        this.copiedId.set(id);
        setTimeout(() => {
          if (this.copiedId() === id) {
            this.copiedId.set(null);
          }
        }, 2000);
      });
    }
  }

  createEvent(): void {
    this.router.navigate(['/events', 'new']);
  }

  editEvent(event: Event): void {
    this.router.navigate(['/events', event.id, 'edit']);
  }

  viewAttendees(event: Event): void {
    this.router.navigate(['/events', event.id, 'attendees']);
  }

  getEventStatusSeverity(event: Event): 'success' | 'secondary' {
    return event.isPublished ? 'success' : 'secondary';
  }

  openCredentialGenerator(event: Event): void {
    this.credentialGenerator()?.open(event);
  }
}
