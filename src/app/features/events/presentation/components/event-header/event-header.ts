import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { TagModule } from 'primeng/tag';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { composeTitle } from '../../../../../core/services/page-title.strategy';
import { Event } from '../../../domain/event.model';
import { EVENT_TIMING_LABELS, eventTiming } from '../../../domain/event-list';

export type EventSection = 'manage' | 'attendees';

const SECTION_LABELS: Record<EventSection, string> = {
  manage: 'Configuración',
  attendees: 'Asistentes',
};

/**
 * Cabecera compartida de las pantallas de un evento: migas, nombre, fecha, estado y salto entre
 * Configuración · Asistentes · Check-in. El contenido proyectado son acciones de la página.
 */
@Component({
  selector: 'app-event-header',
  standalone: true,
  imports: [RouterLink, DatePipe, TagModule],
  templateUrl: './event-header.html',
})
export class EventHeader {
  private readonly auth = inject(AuthService);
  private readonly title = inject(Title);

  readonly event = input<Event | null>(null);
  readonly section = input.required<EventSection>();

  readonly isSuperadmin = computed(() => this.auth.role() === 'SUPERADMIN');
  readonly sectionLabel = computed(() => SECTION_LABELS[this.section()]);
  /** Página principal del evento según el rol: Configuración para SUPERADMIN, Asistentes para STAFF. */
  readonly hubLink = computed(() => {
    const id = this.event()?.id;
    if (!id) return ['/events'];
    return ['/events', id, this.isSuperadmin() ? 'edit' : 'attendees'];
  });
  readonly timing = computed(() => {
    const e = this.event();
    return e ? EVENT_TIMING_LABELS[eventTiming(e, new Date())] : '';
  });

  constructor() {
    effect(() => {
      const name = this.event()?.title;
      if (name) this.title.setTitle(composeTitle(`${this.sectionLabel()} · ${name}`));
    });
  }
}
