import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AssetsApi } from '../../../data/assets.api';
import { EventsApi } from '../../../data/events.api';
import { SessionsApi } from '../../../data/sessions.api';
import { TicketTypesApi } from '../../../data/ticket-types.api';
import { CouponsApi } from '../../../data/coupons.api';
import { StaffAssignmentsApi } from '../../../data/staff-assignments.api';
import { CouponsRepository } from '../../../domain/coupons.repository';
import { StaffAssignmentsRepository } from '../../../domain/staff-assignments.repository';
import { AssetsRepository } from '../../../domain/assets.repository';
import { FormField } from '../../../domain/form-field.model';
import { Event, EventInput } from '../../../domain/event.model';
import { buildPublishContext } from '../../../domain/event-form';
import { validatePublish } from '../../../domain/event-validators';
import { EventsRepository } from '../../../domain/events.repository';
import { Session } from '../../../domain/session.model';
import { SessionsRepository } from '../../../domain/sessions.repository';
import { TicketType } from '../../../domain/ticket-type.model';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';
import { EventBasicsForm } from '../../components/event-basics-form/event-basics-form';
import { CouponsEditor } from '../../components/coupons-editor/coupons-editor';
import { FormFieldsBuilder } from '../../components/form-fields-builder/form-fields-builder';
import { PublishChecklist } from '../../components/publish-checklist/publish-checklist';
import { StaffAssignmentEditor } from '../../components/staff-assignment-editor/staff-assignment-editor';
import { TicketTypesEditor } from '../../components/ticket-types-editor/ticket-types-editor';
import { TracksSessionsEditor } from '../../components/tracks-sessions-editor/tracks-sessions-editor';

export const WIZARD_STEPS = [
  'Datos',
  'Formulario de registro',
  'Paquetes',
  'Tracks y sesiones',
  'Cupones y staff',
  'Revisar y publicar',
] as const;

const REVIEW_STEP = WIZARD_STEPS.length - 1;

@Component({
  selector: 'app-event-wizard-page',
  standalone: true,
  imports: [
    RouterLink,
    CouponsEditor,
    EventBasicsForm,
    FormFieldsBuilder,
    PublishChecklist,
    StaffAssignmentEditor,
    TicketTypesEditor,
    TracksSessionsEditor,
  ],
  providers: [
    { provide: EventsRepository, useClass: EventsApi },
    { provide: AssetsRepository, useClass: AssetsApi },
    { provide: TicketTypesRepository, useClass: TicketTypesApi },
    { provide: SessionsRepository, useClass: SessionsApi },
    { provide: CouponsRepository, useClass: CouponsApi },
    { provide: StaffAssignmentsRepository, useClass: StaffAssignmentsApi },
  ],
  templateUrl: './event-wizard-page.html',
})
export class EventWizardPage {
  private readonly eventsRepo = inject(EventsRepository);
  private readonly ticketsRepo = inject(TicketTypesRepository);
  private readonly sessionsRepo = inject(SessionsRepository);
  private readonly router = inject(Router);

  private readonly basicsForm = viewChild(EventBasicsForm);

  readonly steps = WIZARD_STEPS;
  readonly step = signal(0);
  /** Borrador creado en el paso 1; habilita el resto de pasos. */
  readonly draft = signal<Event | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly tickets = signal<Pick<TicketType, 'ticketCapacity'>[]>([]);
  readonly sessions = signal<Session[]>([]);

  readonly publishResult = computed(() => {
    const draft = this.draft();
    return draft
      ? validatePublish(buildPublishContext(draft, this.tickets(), this.sessions()))
      : null;
  });

  canVisit(index: number): boolean {
    return index === 0 || this.draft() !== null;
  }

  async goTo(index: number): Promise<void> {
    if (!this.canVisit(index)) return;
    this.step.set(index);
    if (index === REVIEW_STEP) await this.loadPublishData();
  }

  next(): Promise<void> {
    return this.goTo(Math.min(this.step() + 1, REVIEW_STEP));
  }

  prev(): Promise<void> {
    return this.goTo(Math.max(this.step() - 1, 0));
  }

  onFormFields(formFields: FormField[]): void {
    this.draft.update((d) => (d ? { ...d, formFields } : d));
  }

  async saveBasics(input: EventInput): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const current = this.draft();
      const saved = current
        ? await this.eventsRepo.update(current.id, input)
        : await this.eventsRepo.create(input);
      this.draft.set(saved);
      // Guardado ok: ahora sí se borran las imágenes reemplazadas.
      await this.basicsForm()?.commitAssets();
      await this.goTo(1);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo guardar el evento.');
    } finally {
      this.saving.set(false);
    }
  }

  async publish(): Promise<void> {
    const draft = this.draft();
    if (!draft || this.publishResult()?.errors.length) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.eventsRepo.setPublished(draft.id, true);
      await this.router.navigate(['/events', draft.id, 'edit']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo publicar el evento.');
    } finally {
      this.saving.set(false);
    }
  }

  private async loadPublishData(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    try {
      const [tickets, sessions] = await Promise.all([
        this.ticketsRepo.list(draft.id),
        this.sessionsRepo.list(draft.id),
      ]);
      this.tickets.set(tickets);
      this.sessions.set(sessions);
    } catch {
      // El checklist seguirá mostrando lo que falte con los datos disponibles.
    }
  }
}
