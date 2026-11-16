import { DatePipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, RouterLink } from '@angular/router';

import { TagModule } from 'primeng/tag';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { PUBLIC_SITE_URL, publicEventUrl } from '../../../../../core/config/public-site';
import { BsPipe } from '../../../../../shared/pipes/bs.pipe';
import { AuditApi } from '../../../../activity/data/audit.api';
import { AuditEntry, EMPTY_AUDIT_FILTERS } from '../../../../activity/domain/audit-entry.model';
import { AuditRepository } from '../../../../activity/domain/audit.repository';
import { AuditTimeline } from '../../../../activity/presentation/components/audit-timeline/audit-timeline';
import { EventsApi } from '../../../data/events.api';
import { TicketTypesApi } from '../../../data/ticket-types.api';
import { attendeeFullName, attendeeInitials, entryLabel } from '../../../domain/attendee-payment';
import { eventTypeLabel } from '../../../domain/event-list';
import {
  PackageOccupancy,
  buildEventOverview,
  latestRegistrations,
  packageOccupancy,
} from '../../../domain/event-overview';
import { Attendee, Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { plural } from '../../../domain/plural';
import {
  registrationStatusLabel,
  registrationStatusSeverity,
} from '../../../domain/registration-status';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';
import { CredentialGenerator } from '../../components/credential-generator/credential-generator';
import { EventHeader } from '../../components/event-header/event-header';

type AttentionTone = 'warning' | 'info' | 'neutral';

interface AttentionItem {
  icon: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  /** Sin enlace cuando el rol no puede resolverlo (p. ej. STAFF ante un cupo lleno). */
  link: string[] | null;
  queryParams?: Params;
}

const TONE_CLASSES: Record<AttentionTone, string> = {
  warning: 'bg-warning-bg text-warning-text',
  info: 'bg-info-bg text-info-text',
  neutral: 'bg-neutral-100 text-text-secondary dark:bg-neutral-800 dark:text-neutral-300',
};

/**
 * Portada de un evento (/events/:id): cómo va y qué falta, con salto a Configuración, Asistentes y
 * Check-in. Es el destino al abrir un evento desde la lista, para todos los roles.
 */
@Component({
  selector: 'app-event-overview-page',
  standalone: true,
  imports: [
    DatePipe,
    PercentPipe,
    RouterLink,
    TagModule,
    BsPipe,
    AuditTimeline,
    CredentialGenerator,
    EventHeader,
  ],
  providers: [
    { provide: EventsRepository, useClass: EventsApi },
    { provide: TicketTypesRepository, useClass: TicketTypesApi },
    { provide: AuditRepository, useClass: AuditApi },
  ],
  templateUrl: './event-overview-page.html',
})
export class EventOverviewPage {
  private readonly route = inject(ActivatedRoute);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly ticketsRepo = inject(TicketTypesRepository);
  private readonly auditRepo = inject(AuditRepository);
  private readonly auth = inject(AuthService);
  private readonly credentialGenerator = viewChild(CredentialGenerator);

  readonly isSuperadmin = computed(() => this.auth.role() === 'SUPERADMIN');

  readonly event = signal<Event | null>(null);
  readonly attendees = signal<Attendee[]>([]);
  readonly packages = signal<PackageOccupancy[]>([]);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  /** Solo SUPERADMIN: los últimos movimientos del evento (la base no se los da a STAFF). */
  readonly activity = signal<AuditEntry[]>([]);
  readonly activityError = signal<string | null>(null);

  readonly overview = computed(() => {
    const event = this.event();
    return event ? buildEventOverview(event, this.attendees()) : null;
  });
  readonly latest = computed(() => latestRegistrations(this.attendees(), 5));
  readonly publicUrl = computed(() => {
    const event = this.event();
    return event ? publicEventUrl(event.slug) : null;
  });
  /** Dominio del sitio público sin el protocolo: más corto y legible en el panel. */
  readonly publicHost = PUBLIC_SITE_URL.replace(/^https?:\/\//, '');

  readonly attention = computed<AttentionItem[]>(() => {
    const event = this.event();
    const o = this.overview();
    if (!event || !o) return [];
    const attendees = ['/events', event.id, 'attendees'];
    const config = ['/events', event.id, 'edit'];
    const items: AttentionItem[] = [];

    if (o.proofsToReview > 0) {
      items.push({
        icon: 'receipt_long',
        tone: 'warning',
        title: `${plural(o.proofsToReview, 'comprobante', 'comprobantes')} por revisar`,
        detail: 'Pendientes de pago que ya subieron su comprobante.',
        link: attendees,
        queryParams: { estado: 'pendiente', comprobante: 'con' },
      });
    }
    if (o.pendingWithoutProof > 0) {
      items.push({
        icon: 'schedule',
        tone: 'neutral',
        title: `${plural(o.pendingWithoutProof, 'pendiente', 'pendientes')} de pago sin comprobante`,
        detail: 'Ocupan cupo, pero todavía no subieron el comprobante.',
        link: attendees,
        queryParams: { estado: 'pendiente', comprobante: 'sin' },
      });
    }
    if (!event.isPublished && this.isSuperadmin()) {
      items.push({
        icon: 'edit_note',
        tone: 'info',
        title: 'El evento es un borrador',
        detail: 'Nadie puede inscribirse hasta que lo publiques.',
        link: config,
        queryParams: { tab: 'publicacion' },
      });
    }
    if (o.capacity > 0 && o.remaining === 0) {
      items.push({
        icon: 'event_busy',
        tone: 'warning',
        title: 'Cupo lleno',
        detail: 'No quedan cupos libres para nuevas inscripciones.',
        link: this.isSuperadmin() ? config : null,
        queryParams: this.isSuperadmin() ? { tab: 'paquetes' } : undefined,
      });
    }
    return items;
  });

  readonly typeLabel = eventTypeLabel;
  readonly fullName = attendeeFullName;
  readonly initials = attendeeInitials;
  readonly entry = entryLabel;
  readonly statusLabel = registrationStatusLabel;
  readonly statusSeverity = registrationStatusSeverity;
  readonly plural = plural;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id');
      if (id) void this.load(id);
    });
  }

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    try {
      const event = await this.eventsRepo.getEventById(id);
      if (!event) {
        this.event.set(null);
        this.notFound.set(true);
        return;
      }
      const [attendees, tickets, counts] = await Promise.all([
        this.eventsRepo.getAttendees(id),
        this.ticketsRepo.list(id),
        this.ticketsRepo.getActiveRegistrationCounts(id),
      ]);
      this.event.set(event);
      this.attendees.set(attendees);
      this.packages.set(packageOccupancy(tickets, counts));
      if (this.isSuperadmin()) void this.loadActivity(id);
    } catch (err) {
      console.error(err);
      this.error.set('No pudimos cargar el evento. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Accesoria: si falla, el resumen se ve igual y el panel lo explica. */
  private async loadActivity(eventId: string): Promise<void> {
    this.activityError.set(null);
    try {
      const page = await this.auditRepo.list({ ...EMPTY_AUDIT_FILTERS, eventId }, 6, 0);
      this.activity.set(page.entries);
    } catch {
      this.activityError.set('No se pudo cargar la actividad reciente.');
    }
  }

  retry(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) void this.load(id);
  }

  toneClass(tone: AttentionTone): string {
    return TONE_CLASSES[tone];
  }

  openCredentials(): void {
    const event = this.event();
    if (event) void this.credentialGenerator()?.open(event);
  }
}
