import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { EventsRepository } from '../../../domain/events.repository';
import { EventsApi } from '../../../data/events.api';
import { Event, Attendee } from '../../../domain/event.model';

@Component({
  selector: 'app-attendees-page',
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
    CurrencyPipe,
  ],
  providers: [{ provide: EventsRepository, useClass: EventsApi }],
  templateUrl: './attendees-page.html',
  styleUrl: './attendees-page.scss',
})
export class AttendeesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsRepo = inject(EventsRepository);

  readonly event = signal<Event | null>(null);
  readonly attendees = signal<Attendee[]>([]);
  readonly loading = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);

  // Global table search filter
  readonly globalFilter = signal<string>('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadData(id);
    } else {
      this.errorMsg.set('Identificador de evento no válido.');
    }
  }

  async loadData(eventId: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);

    try {
      const [eventData, attendeesData] = await Promise.all([
        this.eventsRepo.getEventById(eventId),
        this.eventsRepo.getAttendees(eventId),
      ]);

      if (!eventData) {
        this.errorMsg.set('El evento solicitado no existe o fue eliminado.');
        return;
      }

      this.event.set(eventData);
      this.attendees.set(attendeesData);
    } catch (err) {
      console.error(err);
      this.errorMsg.set('Ocurrió un error al cargar la información. Intente de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/events']);
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

  formatResponseKey(key: string | number | symbol): string {
    const keyStr = String(key);
    const commonKeys: Record<string, string> = {
      t_shirt_size: 'Talla de polera',
      tshirt: 'Talla de polera',
      tshirt_size: 'Talla de polera',
      polera: 'Talla de polera',
      camiseta: 'Talla de camiseta',
      occupation: 'Ocupación',
      organization: 'Institución / Organización',
      university: 'Universidad / Colegio',
      company: 'Empresa',
      dietary: 'Requerimientos alimentarios',
      food_restrictions: 'Restricciones alimenticias',
      city: 'Ciudad de residencia',
      experience: 'Nivel de experiencia',
      interest: 'Área de interés',
      how_did_you_know: '¿Cómo te enteraste?',
      how_heard: '¿Cómo te enteraste?',
      first_time: '¿Es tu primera vez?',
      github: 'Usuario de GitHub',
      linkedin: 'Perfil de LinkedIn',
    };

    const translation = commonKeys[keyStr.toLowerCase()];
    if (translation) {
      return translation;
    }

    return keyStr
      .replace(/[-_]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  hasCustomResponses(attendee: Attendee): boolean {
    return !!attendee.customResponses && Object.keys(attendee.customResponses).length > 0;
  }

  isImageProof(url: string | null): boolean {
    if (!url) return false;
    const cleanedUrl = url.split('?')[0].toLowerCase();
    return (
      cleanedUrl.endsWith('.jpg') ||
      cleanedUrl.endsWith('.jpeg') ||
      cleanedUrl.endsWith('.png') ||
      cleanedUrl.endsWith('.webp') ||
      cleanedUrl.endsWith('.gif') ||
      cleanedUrl.endsWith('.svg') ||
      url.includes('/storage/v1/object/public/')
    );
  }

  openProof(url: string | null): void {
    if (url) {
      window.open(url, '_blank');
    }
  }
}
