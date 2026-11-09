import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TagModule } from 'primeng/tag';

import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
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

export const MANAGE_TABS = [
  { id: 'basics', label: 'Datos' },
  { id: 'form', label: 'Formulario' },
  { id: 'tickets', label: 'Paquetes' },
  { id: 'sessions', label: 'Tracks y sesiones' },
  { id: 'extras', label: 'Cupones y staff' },
  { id: 'publish', label: 'Publicación' },
] as const;

export type ManageTabId = (typeof MANAGE_TABS)[number]['id'];

@Component({
  selector: 'app-event-manage-page',
  standalone: true,
  imports: [
    RouterLink,
    TagModule,
    DialogFrame,
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
  templateUrl: './event-manage-page.html',
})
export class EventManagePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly ticketsRepo = inject(TicketTypesRepository);
  private readonly sessionsRepo = inject(SessionsRepository);

  private readonly basicsForm = viewChild(EventBasicsForm);

  readonly tabs = MANAGE_TABS;
  readonly tab = signal<ManageTabId>('basics');

  readonly event = signal<Event | null>(null);
  readonly registrationCount = signal(0);
  readonly tickets = signal<Pick<TicketType, 'name' | 'ticketCapacity' | 'phases'>[]>([]);
  readonly sessions = signal<Session[]>([]);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly deleteOpen = signal(false);
  readonly deleteConfirm = signal('');
  readonly deleteError = signal<string | null>(null);
  readonly deleting = signal(false);

  readonly canDelete = computed(() => this.registrationCount() === 0);
  readonly deleteConfirmed = computed(
    () => !!this.event() && this.deleteConfirm().trim() === this.event()!.slug,
  );

  readonly publishResult = computed(() => {
    const event = this.event();
    return event
      ? validatePublish(buildPublishContext(event, this.tickets(), this.sessions()))
      : null;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.error.set(null);
    try {
      const event = id ? await this.eventsRepo.getEventById(id) : null;
      if (!event) {
        this.error.set('No se encontró el evento solicitado.');
        return;
      }
      this.event.set(event);
      const [count, tickets, sessions] = await Promise.all([
        this.eventsRepo.countRegistrations(event.id),
        this.ticketsRepo.list(event.id),
        this.sessionsRepo.list(event.id),
      ]);
      this.registrationCount.set(count);
      this.tickets.set(tickets);
      this.sessions.set(sessions);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo cargar el evento.');
    } finally {
      this.loading.set(false);
    }
  }

  selectTab(id: ManageTabId): void {
    this.tab.set(id);
  }

  onFormFields(formFields: FormField[]): void {
    this.event.update((e) => (e ? { ...e, formFields } : e));
  }

  async saveBasics(input: EventInput): Promise<void> {
    const event = this.event();
    if (!event) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      this.event.set(await this.eventsRepo.update(event.id, input));
      await this.basicsForm()?.commitAssets();
      this.notice.set('Cambios guardados.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo guardar el evento.');
    } finally {
      this.saving.set(false);
    }
  }

  async togglePublished(): Promise<void> {
    const event = this.event();
    if (!event) return;
    const publish = !event.isPublished;
    // Despublicar siempre se permite; publicar exige un checklist sin errores.
    if (publish && (this.publishResult()?.errors.length ?? 1) > 0) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      this.event.set(await this.eventsRepo.setPublished(event.id, publish));
      this.notice.set(publish ? 'Evento publicado.' : 'Evento despublicado.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo cambiar la publicación.');
    } finally {
      this.saving.set(false);
    }
  }

  openDelete(): void {
    this.deleteConfirm.set('');
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  closeDelete(): void {
    this.deleteOpen.set(false);
  }

  async confirmDelete(): Promise<void> {
    const event = this.event();
    if (!event || !this.deleteConfirmed()) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.eventsRepo.delete(event.id);
      await this.router.navigate(['/events']);
    } catch (err) {
      // DomainError trae un mensaje legible (p. ej. HAS_REGISTRATIONS por restrict).
      this.deleteError.set(err instanceof Error ? err.message : 'No se pudo eliminar el evento.');
    } finally {
      this.deleting.set(false);
    }
  }
}
