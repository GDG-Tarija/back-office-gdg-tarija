import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CanLeave } from '../../../../../core/guards/unsaved-changes.guard';
import { FeedbackService } from '../../../../../core/services/feedback.service';
import { UnsavedChangesDialog } from '../../../../../shared/components/unsaved-changes-dialog/unsaved-changes-dialog';
import { errorField, toUserMessage } from '../../../data/postgres-error.mapper';
import { ValidationIssue } from '../../../domain/event-validators';
import { EventInput } from '../../../domain/event.model';
import { EventBasicsForm } from '../../components/event-basics-form/event-basics-form';
import { EVENT_PAGE_PROVIDERS, EventWorkspace } from '../event-workspace/event-workspace';
import { UnsavedPrompt } from '../event-workspace/unsaved-prompt';

/**
 * Primer paso de un evento nuevo: solo "Datos". Al crear el borrador se pasa a la gestión
 * (`/events/:id/edit?tab=formulario&setup=1`), donde el paso vive en la URL y se puede retomar.
 */
@Component({
  selector: 'app-event-wizard-page',
  standalone: true,
  imports: [RouterLink, EventBasicsForm, UnsavedChangesDialog],
  providers: [...EVENT_PAGE_PROVIDERS, EventWorkspace],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  templateUrl: './event-wizard-page.html',
})
export class EventWizardPage implements CanLeave {
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  private readonly ws = inject(EventWorkspace);
  private readonly basicsForm = viewChild(EventBasicsForm);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly serverError = signal<ValidationIssue | null>(null);
  readonly prompt = new UnsavedPrompt();
  readonly dirty = computed(() => !!this.basicsForm()?.dirty());

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  async canLeave(): Promise<boolean> {
    if (!this.dirty()) return true;
    const choice = await this.prompt.ask();
    if (choice === 'stay') return false;
    if (choice === 'discard') return true;
    const input = await this.basicsForm()?.requestSave();
    return input ? this.saveDraft(input) : false;
  }

  async onSave(input: EventInput): Promise<void> {
    await this.saveDraft(input);
  }

  private async saveDraft(input: EventInput): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);
    this.serverError.set(null);
    try {
      const draft = await this.ws.saveBasics(input, this.basicsForm());
      this.basicsForm()?.markSaved();
      this.feedback.success('Borrador creado. Sigue con el formulario de registro.');
      await this.router.navigate(['/events', draft.id, 'edit'], {
        queryParams: { tab: 'formulario', setup: '1' },
        replaceUrl: true,
      });
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
}
