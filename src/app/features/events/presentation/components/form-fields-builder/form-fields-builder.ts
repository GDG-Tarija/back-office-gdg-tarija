import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { Event } from '../../../domain/event.model';
import { eventToInput } from '../../../domain/event-form';
import { validateFormFields } from '../../../domain/event-validators';
import { EventsRepository } from '../../../domain/events.repository';
import { FORM_FIELD_TYPES, FormField, FormFieldType } from '../../../domain/form-field.model';
import {
  DEFAULT_TEMPLATES,
  EditorField,
  FIELD_TYPE_LABELS,
  applyLabel,
  applyTemplate,
  applyType,
  emptyEditorField,
  fromFormFields,
  hasUnsavedChanges,
  moveItem,
  templateSkippedCount,
  toFormFields,
  validateOptions,
} from '../../../domain/form-fields-builder.logic';

interface PendingTemplate {
  name: string;
  fields: FormField[];
}

@Component({
  selector: 'app-form-fields-builder',
  standalone: true,
  imports: [DialogFrame],
  templateUrl: './form-fields-builder.html',
})
export class FormFieldsBuilder {
  private readonly repo = inject(EventsRepository);

  readonly event = input.required<Event>();
  readonly readonly = input(false);

  /** Emite los campos guardados tras un guardado correcto. */
  readonly fieldsChange = output<FormField[]>();

  readonly types = FORM_FIELD_TYPES;
  readonly typeLabels = FIELD_TYPE_LABELS;
  readonly defaultTemplates = DEFAULT_TEMPLATES;

  readonly fields = signal<EditorField[]>([]);
  readonly saved = signal<FormField[]>([]);
  /** null mientras carga o si falló (se asume bloqueado por seguridad). */
  readonly registrations = signal<number | null>(null);
  readonly countError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  /** Mensaje para lectores de pantalla (reordenar, etc.). */
  readonly announcement = signal('');

  // Plantillas
  readonly templatesOpen = signal(false);
  readonly otherEvents = signal<Event[]>([]);
  readonly otherEventsLoading = signal(false);
  readonly otherEventsError = signal<string | null>(null);
  readonly pending = signal<PendingTemplate | null>(null);

  private loadedEventId: string | null = null;

  readonly locked = computed(() => this.registrations() !== 0);
  readonly countLoading = computed(() => this.registrations() === null && !this.countError());
  readonly dirty = computed(() => hasUnsavedChanges(this.saved(), this.fields()));

  readonly issues = computed(() => [
    ...validateFormFields(toFormFields(this.fields())).errors,
    ...validateOptions(this.fields()),
  ]);
  readonly canSave = computed(
    () => !this.readonly() && this.dirty() && this.issues().length === 0 && !this.saving(),
  );
  readonly preview = computed(() => toFormFields(this.fields()));

  readonly pendingMode = computed<'replace' | 'append'>(() =>
    this.locked() ? 'append' : 'replace',
  );
  readonly pendingSkipped = computed(() => {
    const p = this.pending();
    return p ? templateSkippedCount(this.fields(), p.fields) : 0;
  });

  constructor() {
    effect(() => {
      const ev = this.event();
      untracked(() => this.syncFromEvent(ev));
    });
  }

  private syncFromEvent(ev: Event): void {
    const idChanged = this.loadedEventId !== ev.id;
    const wasDirty = !idChanged && this.dirty();
    this.saved.set(ev.formFields);
    if (idChanged || !wasDirty) {
      if (idChanged || hasUnsavedChanges(ev.formFields, this.fields())) {
        this.fields.set(fromFormFields(ev.formFields));
      }
    }
    if (idChanged) {
      this.loadedEventId = ev.id;
      void this.loadCount(ev.id);
    }
  }

  async loadCount(eventId = this.event().id): Promise<void> {
    this.registrations.set(null);
    this.countError.set(null);
    try {
      const n = await this.repo.countRegistrations(eventId);
      if (this.event().id === eventId) this.registrations.set(n);
    } catch (err) {
      this.countError.set(
        err instanceof Error ? err.message : 'No se pudo comprobar si hay inscritos.',
      );
    }
  }

  // --- Edición -----------------------------------------------------------

  keyEditable(f: EditorField): boolean {
    return !this.readonly() && f.isNew;
  }

  canRemove(f: EditorField): boolean {
    return !this.readonly() && (f.isNew || !this.locked());
  }

  fieldErrors(index: number, prefix: 'label' | 'key' | 'type' | 'options'): string[] {
    const f = this.fields()[index];
    return (
      this.issues()
        .filter((i) => i.field === `fields[${index}].${prefix}`)
        // No gritar por la key mientras el label está vacío (la key se autogenera).
        .filter(() => !(prefix === 'key' && !f.key && !f.label.trim()))
        .map((i) => i.message)
    );
  }

  fieldTitle(f: EditorField, index: number): string {
    return f.label.trim() || `Campo ${index + 1}`;
  }

  add(type: FormFieldType = 'text'): void {
    this.fields.update((l) => [...l, emptyEditorField(type)]);
    this.announce('Campo agregado.');
    this.notice.set(null);
  }

  setLabel(i: number, label: string): void {
    this.fields.update((l) => applyLabel(l, i, label));
  }

  setKey(i: number, key: string): void {
    this.patch(i, { key: key.trim(), keyEdited: true });
  }

  setType(i: number, type: string): void {
    if (!FORM_FIELD_TYPES.includes(type as FormFieldType)) return;
    this.fields.update((l) => applyType(l, i, type as FormFieldType));
  }

  setRequired(i: number, required: boolean): void {
    this.patch(i, { required });
  }

  setPlaceholder(i: number, placeholder: string): void {
    this.patch(i, { placeholder });
  }

  remove(i: number): void {
    const f = this.fields()[i];
    if (!f || !this.canRemove(f)) return;
    this.fields.update((l) => l.filter((_, idx) => idx !== i));
    this.announce(`Campo ${this.fieldTitle(f, i)} eliminado.`);
  }

  move(i: number, delta: -1 | 1): void {
    const to = i + delta;
    const list = this.fields();
    if (this.readonly() || to < 0 || to >= list.length) return;
    this.fields.set(moveItem(list, i, to));
    this.announce(
      `${this.fieldTitle(list[i], i)} movido a la posición ${to + 1} de ${list.length}.`,
    );
  }

  addOption(i: number): void {
    this.patch(i, { options: [...this.fields()[i].options, ''] });
  }

  setOption(i: number, j: number, value: string): void {
    this.patch(i, { options: this.fields()[i].options.map((o, k) => (k === j ? value : o)) });
  }

  removeOption(i: number, j: number): void {
    const opts = this.fields()[i].options;
    if (opts.length <= 2) return;
    this.patch(i, { options: opts.filter((_, k) => k !== j) });
  }

  moveOption(i: number, j: number, delta: -1 | 1): void {
    const opts = this.fields()[i].options;
    const to = j + delta;
    if (to < 0 || to >= opts.length) return;
    this.patch(i, { options: moveItem(opts, j, to) });
    this.announce(`Opción movida a la posición ${to + 1} de ${opts.length}.`);
  }

  discard(): void {
    this.fields.set(fromFormFields(this.saved()));
    this.saveError.set(null);
    this.announce('Cambios descartados.');
  }

  // --- Plantillas --------------------------------------------------------

  openTemplates(): void {
    this.templatesOpen.set(true);
    if (this.otherEvents().length === 0 && !this.otherEventsLoading()) void this.loadOtherEvents();
  }

  async loadOtherEvents(): Promise<void> {
    this.otherEventsLoading.set(true);
    this.otherEventsError.set(null);
    try {
      const all = await this.repo.getEvents();
      this.otherEvents.set(all.filter((e) => e.id !== this.event().id && e.formFields.length > 0));
    } catch (err) {
      this.otherEventsError.set(
        err instanceof Error ? err.message : 'No se pudieron cargar los eventos.',
      );
    } finally {
      this.otherEventsLoading.set(false);
    }
  }

  chooseTemplate(name: string, fields: FormField[]): void {
    const pending = { name, fields };
    if (this.fields().length === 0) {
      this.applyPending(pending);
    } else {
      this.pending.set(pending);
    }
  }

  chooseEvent(eventId: string): void {
    const ev = this.otherEvents().find((e) => e.id === eventId);
    if (ev) this.chooseTemplate(`el formulario de "${ev.title}"`, ev.formFields);
  }

  confirmPending(): void {
    const p = this.pending();
    if (p) this.applyPending(p);
  }

  cancelPending(): void {
    this.pending.set(null);
  }

  private applyPending(p: PendingTemplate): void {
    this.fields.set(applyTemplate(this.fields(), p.fields, this.pendingMode()));
    this.pending.set(null);
    this.templatesOpen.set(false);
    this.notice.set(null);
    this.announce(`Plantilla aplicada: ${p.name}.`);
  }

  // --- Guardado ----------------------------------------------------------

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const formFields = toFormFields(this.fields());
    this.saving.set(true);
    this.saveError.set(null);
    this.notice.set(null);
    try {
      const updated = await this.repo.update(this.event().id, {
        ...eventToInput(this.event()),
        formFields,
      });
      const persisted = updated?.formFields ?? formFields;
      this.saved.set(persisted);
      this.fields.update((l) => l.map((f) => ({ ...f, isNew: false, keyEdited: true })));
      this.notice.set('Formulario guardado.');
      this.fieldsChange.emit(persisted);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'No se pudo guardar el formulario.');
    } finally {
      this.saving.set(false);
    }
  }

  private patch(i: number, changes: Partial<EditorField>): void {
    this.fields.update((l) => l.map((f, idx) => (idx === i ? { ...f, ...changes } : f)));
  }

  private announce(msg: string): void {
    this.announcement.set(msg);
  }
}
