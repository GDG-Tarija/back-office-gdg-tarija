import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { CanLeave } from '../../../../../core/guards/unsaved-changes.guard';
import { FeedbackService } from '../../../../../core/services/feedback.service';
import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { UnsavedChangesDialog } from '../../../../../shared/components/unsaved-changes-dialog/unsaved-changes-dialog';
import { focusField } from '../../../../../shared/utils/focus';
import { errorField, toUserMessage } from '../../../data/postgres-error.mapper';
import {
  EVENT_TABS,
  EventTabId,
  domIdForField,
  firstPendingTab,
  issuesForTab,
  parseEventTab,
  tabForField,
  tabStatuses,
} from '../../../domain/event-tabs';
import { EventInput } from '../../../domain/event.model';
import { ValidationIssue } from '../../../domain/event-validators';
import { CouponsEditor } from '../../components/coupons-editor/coupons-editor';
import { EventBasicsForm } from '../../components/event-basics-form/event-basics-form';
import { EventHeader } from '../../components/event-header/event-header';
import { EventSectionNav } from '../../components/event-section-nav/event-section-nav';
import { FormFieldsBuilder } from '../../components/form-fields-builder/form-fields-builder';
import { PublishChecklist } from '../../components/publish-checklist/publish-checklist';
import { StaffAssignmentEditor } from '../../components/staff-assignment-editor/staff-assignment-editor';
import { TicketTypesEditor } from '../../components/ticket-types-editor/ticket-types-editor';
import { TracksSessionsEditor } from '../../components/tracks-sessions-editor/tracks-sessions-editor';
import { EVENT_PAGE_PROVIDERS, EventWorkspace } from '../event-workspace/event-workspace';
import { UnsavedPrompt } from '../event-workspace/unsaved-prompt';

@Component({
  selector: 'app-event-manage-page',
  standalone: true,
  imports: [
    DialogFrame,
    UnsavedChangesDialog,
    EventHeader,
    CouponsEditor,
    EventBasicsForm,
    EventSectionNav,
    FormFieldsBuilder,
    PublishChecklist,
    StaffAssignmentEditor,
    TicketTypesEditor,
    TracksSessionsEditor,
  ],
  providers: [...EVENT_PAGE_PROVIDERS, EventWorkspace],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  templateUrl: './event-manage-page.html',
})
export class EventManagePage implements OnInit, CanLeave {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  readonly ws = inject(EventWorkspace);

  private readonly basicsForm = viewChild(EventBasicsForm);
  private readonly fieldsBuilder = viewChild(FormFieldsBuilder);

  readonly tabs = EVENT_TABS;
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly tab = computed<EventTabId>(() => parseEventTab(this.query().get('tab')));
  /** Asistente de creación: pasos numerados y Anterior/Siguiente. */
  readonly setup = computed(() => this.query().get('setup') === '1');

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly serverError = signal<ValidationIssue | null>(null);
  readonly publishAttempted = signal(false);
  readonly prompt = new UnsavedPrompt();

  readonly deleteOpen = signal(false);
  readonly deleteConfirm = signal('');
  readonly deleteError = signal<string | null>(null);
  readonly deleting = signal(false);

  readonly canDelete = computed(() => this.ws.registrationCount() === 0);
  readonly deleteConfirmed = computed(
    () => !!this.ws.event() && this.deleteConfirm().trim() === this.ws.event()!.slug,
  );

  readonly statuses = computed(() => tabStatuses(this.ws.publishResult(), !!this.ws.event()));
  /** Pasos que quedaron atrás con pendientes (solo en el asistente). */
  readonly flagged = computed<EventTabId[]>(() => {
    if (!this.setup()) return [];
    const current = this.tabs.findIndex((t) => t.id === this.tab());
    return this.tabs
      .filter((t, i) => i < current && issuesForTab(this.ws.publishResult(), t.id).length > 0)
      .map((t) => t.id);
  });
  readonly tabIndex = computed(() => this.tabs.findIndex((t) => t.id === this.tab()));
  readonly pendingCount = computed(() => this.ws.publishResult()?.errors.length ?? 0);

  readonly dirty = computed(() => !!(this.basicsForm()?.dirty() || this.fieldsBuilder()?.dirty()));

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.error.set(null);
    try {
      const found = id ? await this.ws.load(id) : false;
      if (!found) {
        this.error.set('No se encontró el evento solicitado.');
        return;
      }
      this.resumeDraft();
    } catch (err) {
      this.error.set(toUserMessage(err, 'No se pudo cargar el evento.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Un borrador incompleto abierto sin pestaña reanuda el asistente en su primer paso pendiente. */
  private resumeDraft(): void {
    const q = this.route.snapshot.queryParamMap;
    const event = this.ws.event();
    if (!event || event.isPublished || q.has('tab') || q.has('setup')) return;
    const result = this.ws.publishResult();
    if (!result?.errors.length) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: firstPendingTab(result), setup: '1' },
      replaceUrl: true,
    });
  }

  // --- Navegación -----------------------------------------------------------

  goTo(tab: EventTabId, setup = this.setup()): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab, setup: setup ? '1' : null },
    });
  }

  next(): Promise<boolean> {
    return this.goTo(this.tabs[Math.min(this.tabIndex() + 1, this.tabs.length - 1)].id);
  }

  prev(): Promise<boolean> {
    return this.goTo(this.tabs[Math.max(this.tabIndex() - 1, 0)].id);
  }

  finishSetup(): Promise<boolean> {
    return this.goTo('datos', false);
  }

  async goToIssue(issue: ValidationIssue): Promise<void> {
    const ok = await this.goTo(tabForField(issue.field));
    const id = domIdForField(issue.field);
    if (ok && id) setTimeout(() => focusField(id), 80);
  }

  // --- Cambios sin guardar ----------------------------------------------------

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  async canLeave(nextUrl: string): Promise<boolean> {
    if (!this.dirty()) return true;
    if (this.staysOnSection(nextUrl)) return true;
    const choice = await this.prompt.ask();
    if (choice === 'stay') return false;
    if (choice === 'discard') return true;
    this.prompt.saving.set(true);
    try {
      return await this.saveActiveSection();
    } finally {
      this.prompt.saving.set(false);
    }
  }

  private staysOnSection(nextUrl: string): boolean {
    const next = this.router.parseUrl(nextUrl);
    const segments = next.root.children['primary']?.segments.map((s) => s.path) ?? [];
    const sameEvent =
      segments.length === 3 &&
      segments[0] === 'events' &&
      segments[1] === this.ws.event()?.id &&
      segments[2] === 'edit';
    return sameEvent && parseEventTab(next.queryParams['tab']) === this.tab();
  }

  private async saveActiveSection(): Promise<boolean> {
    if (this.tab() === 'datos') {
      const form = this.basicsForm();
      const input = await form?.requestSave();
      return input ? this.saveBasics(input, false) : false;
    }
    if (this.tab() === 'formulario') return (await this.fieldsBuilder()?.save()) ?? false;
    return true;
  }

  // --- Guardado y publicación -------------------------------------------------

  async onBasicsSave(input: EventInput): Promise<void> {
    const ok = await this.saveBasics(input, true);
    if (ok && this.setup() && this.tab() === 'datos') await this.goTo('formulario');
  }

  private async saveBasics(input: EventInput, announce: boolean): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);
    this.serverError.set(null);
    try {
      await this.ws.saveBasics(input, this.basicsForm());
      this.basicsForm()?.markSaved();
      if (announce) this.feedback.success('Cambios guardados.');
      return true;
    } catch (err) {
      const message = toUserMessage(err, 'No se pudo guardar el evento.');
      const field = errorField(err);
      if (field) {
        this.serverError.set({ field, message });
        void this.basicsForm()?.requestSave();
      } else {
        this.error.set(message);
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  onFormSaved(): void {
    void this.ws.refreshPublishData().catch(() => undefined);
  }

  async togglePublished(): Promise<void> {
    const event = this.ws.event();
    if (!event) return;
    const publish = !event.isPublished;
    if (publish && this.pendingCount() > 0) {
      this.publishAttempted.set(true);
      setTimeout(() => focusField('publish-checklist-heading'), 0);
      return;
    }
    if (!publish) {
      const n = this.ws.registrationCount();
      const ok = await this.feedback.confirm({
        titulo: 'Despublicar evento',
        mensaje:
          `El evento dejará de verse en el sitio público y no se podrán hacer nuevas inscripciones. ` +
          (n === 0
            ? 'Aún no tiene personas inscritas.'
            : `Tiene ${n} ${n === 1 ? 'persona inscrita' : 'personas inscritas'}, que conservan su inscripción.`) +
          ' Podrás volver a publicarlo.',
        aceptar: 'Despublicar',
        peligro: true,
      });
      if (!ok) return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.ws.setPublished(publish);
      this.publishAttempted.set(false);
      this.feedback.success(publish ? 'Evento publicado.' : 'Evento despublicado.');
      if (publish && this.setup()) await this.goTo('publicacion', false);
    } catch (err) {
      this.error.set(toUserMessage(err, 'No se pudo cambiar la publicación.'));
    } finally {
      this.saving.set(false);
    }
  }

  // --- Eliminar -----------------------------------------------------------------

  openDelete(): void {
    this.deleteConfirm.set('');
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  closeDelete(): void {
    this.deleteOpen.set(false);
  }

  async confirmDelete(): Promise<void> {
    if (!this.deleteConfirmed()) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.ws.remove();
      this.deleteOpen.set(false);
      this.feedback.success('Evento eliminado.');
      await this.router.navigate(['/events']);
    } catch (err) {
      this.deleteError.set(toUserMessage(err, 'No se pudo eliminar el evento.'));
    } finally {
      this.deleting.set(false);
    }
  }
}
