import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { TagModule } from 'primeng/tag';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { composeTitle } from '../../../../../core/services/page-title.strategy';
import { Event } from '../../../domain/event.model';
import { EVENT_TIMING_LABELS, eventTiming } from '../../../domain/event-list';

export type EventSection = 'overview' | 'manage' | 'attendees' | 'store';

const SECTION_LABELS: Record<EventSection, string> = {
  overview: 'Resumen',
  manage: 'Configuración',
  attendees: 'Asistentes',
  store: 'Tienda',
};

/**
 * Cabecera compartida de las pantallas de un evento: migas, nombre, fecha, estado y salto entre
 * Resumen · Configuración · Asistentes · Tienda · Check-in. El contenido proyectado son acciones de la página.
 */
@Component({
  selector: 'app-event-header',
  standalone: true,
  imports: [RouterLink, DatePipe, TagModule],
  templateUrl: './event-header.html',
  // Bloque: el `space-y-*` de la página (margen inferior en Tailwind v4) no separa un elemento inline.
  host: { class: 'block' },
})
export class EventHeader {
  private readonly auth = inject(AuthService);
  private readonly title = inject(Title);

  readonly event = input<Event | null>(null);
  readonly section = input.required<EventSection>();

  readonly isSuperadmin = computed(() => this.auth.role() === 'SUPERADMIN');
  readonly sectionLabel = computed(() => SECTION_LABELS[this.section()]);
  /** Portada del evento (Resumen), igual para todos los roles. */
  readonly hubLink = computed(() => {
    const id = this.event()?.id;
    return id ? ['/events', id] : ['/events'];
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
