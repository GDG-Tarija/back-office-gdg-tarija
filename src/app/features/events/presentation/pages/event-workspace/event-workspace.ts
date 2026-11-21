import { Injectable, computed, inject, signal } from '@angular/core';

import { AssetsApi } from '../../../data/assets.api';
import { CouponsApi } from '../../../data/coupons.api';
import { EventsApi } from '../../../data/events.api';
import { SessionsApi } from '../../../data/sessions.api';
import { StaffAssignmentsApi } from '../../../data/staff-assignments.api';
import { TicketTypesApi } from '../../../data/ticket-types.api';
import { AssetsRepository } from '../../../domain/assets.repository';
import { CouponsRepository } from '../../../domain/coupons.repository';
import { buildPublishContext } from '../../../domain/event-form';
import { validatePublish } from '../../../domain/event-validators';
import { Event, EventInput } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { FormField } from '../../../domain/form-field.model';
import { Session } from '../../../domain/session.model';
import { SessionsRepository } from '../../../domain/sessions.repository';
import { StaffAssignmentsRepository } from '../../../domain/staff-assignments.repository';
import { TicketType } from '../../../domain/ticket-type.model';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';

/** Repositorios que necesitan las páginas y editores de un evento. */
export const EVENT_PAGE_PROVIDERS = [
  { provide: EventsRepository, useClass: EventsApi },
  { provide: AssetsRepository, useClass: AssetsApi },
  { provide: TicketTypesRepository, useClass: TicketTypesApi },
  { provide: SessionsRepository, useClass: SessionsApi },
  { provide: CouponsRepository, useClass: CouponsApi },
  { provide: StaffAssignmentsRepository, useClass: StaffAssignmentsApi },
];

/** Los editores de imágenes reemplazadas se confirman recién cuando el guardado tuvo éxito. */
export interface AssetCommitter {
  commitAssets(): Promise<void>;
}

/**
 * Estado compartido del evento que se crea o gestiona: datos, contexto de publicación
 * y operaciones comunes (guardar "Datos", publicar). Se provee por página.
 */
@Injectable()
export class EventWorkspace {
  private readonly eventsRepo = inject(EventsRepository);
  private readonly ticketsRepo = inject(TicketTypesRepository);
  private readonly sessionsRepo = inject(SessionsRepository);

  readonly event = signal<Event | null>(null);
  readonly whatsappGroupUrl = signal<string | null>(null);
  /** Con anuladas: bloquea borrar el evento y cambiar el slug. */
  readonly registrationCount = signal(0);
  /** Sin anuladas: lo que se le muestra a la persona como inscritas. */
  readonly activeRegistrationCount = signal(0);
  readonly tickets = signal<Pick<TicketType, 'name' | 'ticketCapacity' | 'phases'>[]>([]);
  readonly sessions = signal<Session[]>([]);

  readonly publishResult = computed(() => {
    const event = this.event();
    return event
      ? validatePublish(buildPublishContext(event, this.tickets(), this.sessions()))
      : null;
  });

  /** Carga el evento y lo necesario para el checklist. Devuelve false si no existe. */
  async load(id: string): Promise<boolean> {
    const [event, whatsappGroupUrl] = await Promise.all([
      this.eventsRepo.getEventById(id),
      this.eventsRepo.getWhatsappGroupUrl(id),
    ]);
    if (!event) return false;
    this.whatsappGroupUrl.set(whatsappGroupUrl);
    this.event.set(event);
    await this.refreshPublishData();
    return true;
  }

  async refreshPublishData(): Promise<void> {
    const event = this.event();
    if (!event) return;
    const [count, activeCount, tickets, sessions] = await Promise.all([
      this.eventsRepo.countRegistrations(event.id),
      this.eventsRepo.countActiveRegistrations(event.id),
      this.ticketsRepo.list(event.id),
      this.sessionsRepo.list(event.id),
    ]);
    this.registrationCount.set(count);
    this.activeRegistrationCount.set(activeCount);
    this.tickets.set(tickets);
    this.sessions.set(sessions);
  }

  /** Crea el borrador o actualiza "Datos"; confirma el borrado de imágenes reemplazadas. */
  async saveBasics(input: EventInput, assets?: AssetCommitter): Promise<Event> {
    const current = this.event();
    const saved = current
      ? await this.eventsRepo.update(current.id, input)
      : await this.eventsRepo.create(input);
    this.event.set(saved);
    if (input.whatsappGroupUrl !== undefined) {
      await this.eventsRepo.saveWhatsappGroupUrl(saved.id, input.whatsappGroupUrl);
      this.whatsappGroupUrl.set(input.whatsappGroupUrl);
    }
    await assets?.commitAssets();
    return saved;
  }

  async setPublished(published: boolean): Promise<Event> {
    const event = this.event();
    if (!event) throw new Error('Sin evento');
    const updated = await this.eventsRepo.setPublished(event.id, published);
    this.event.set(updated);
    return updated;
  }

  async remove(): Promise<void> {
    const event = this.event();
    if (event) await this.eventsRepo.delete(event.id);
  }

  setFormFields(formFields: FormField[]): void {
    this.event.update((e) => (e ? { ...e, formFields } : e));
  }
}
