import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
// Signal Forms es experimental en Angular 21.2 (`form`, `FormField`); es la API que pide CLAUDE.md
// para formularios nuevos y funciona con inputs nativos, así que se usa tal cual.
import { FormsModule } from '@angular/forms';
import { FormField, disabled, form } from '@angular/forms/signals';

import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';

import { ErrorSummary } from '../../../../../shared/components/error-summary/error-summary';
import {
  ErrorSummaryItem,
  FieldRef,
  buildErrorSummary,
} from '../../../../../shared/utils/error-summary';
import { focusField } from '../../../../../shared/utils/focus';

import { AssetCleanupTracker } from '../../../domain/asset-cleanup';
import { toUserMessage } from '../../../data/postgres-error.mapper';
import { AssetsRepository } from '../../../domain/assets.repository';
import { EventsRepository } from '../../../domain/events.repository';
import { EVENT_TYPES, Event, EventInput, LOCATION_TYPES } from '../../../domain/event.model';
import {
  EventFormValue,
  distinctCategories,
  emptyEventFormValue,
  eventToFormValue,
  eventToInput,
  dateStringToDate,
  dateToDateString,
  dateToTimeString,
  formValueToEventInput,
  nextAutoSlug,
  timeStringToDate,
} from '../../../domain/event-form';
import { isRequiredToPublish } from '../../../domain/event-tabs';
import { ValidationIssue, isValidSlug, validateEvent } from '../../../domain/event-validators';
import { ImageUploader } from '../image-uploader/image-uploader';

const EVENT_TYPE_LABELS: Record<string, string> = {
  MEETUP: 'Meetup',
  CONFERENCE: 'Conferencia',
  HACKATHON: 'Hackathon',
  WORKSHOP: 'Taller',
};

const LOCATION_TYPE_LABELS: Record<string, string> = {
  PHYSICAL: 'Presencial',
  VIRTUAL: 'Virtual',
  HYBRID: 'Híbrido',
};

const SLUG_DEBOUNCE_MS = 400;

/** Control y etiqueta de cada campo validable, para el resumen de errores. */
const FIELD_REFS: Record<string, FieldRef> = {
  title: { id: 'ev-title', label: 'Título' },
  slug: { id: 'ev-slug', label: 'Slug' },
  eventType: { id: 'ev-type', label: 'Tipo' },
  locationType: { id: 'ev-mode', label: 'Modalidad' },
  capacity: { id: 'ev-capacity', label: 'Capacidad' },
  addressLink: { id: 'ev-link', label: 'Enlace de mapa o reunión' },
  dateStart: { id: 'ev-start-date', label: 'Fecha de inicio' },
  dateEnd: { id: 'ev-end-date', label: 'Fecha de fin' },
};

@Component({
  selector: 'app-event-basics-form',
  standalone: true,
  imports: [FormField, FormsModule, DatePickerModule, InputTextModule, ImageUploader, ErrorSummary],
  templateUrl: './event-basics-form.html',
})
export class EventBasicsForm implements OnInit, OnDestroy {
  private readonly eventsRepo = inject(EventsRepository);
  private readonly assets = inject(AssetsRepository);
  /** Borrado diferido de imágenes reemplazadas / subidas y descartadas. */
  private readonly cleanup = new AssetCleanupTracker((url) => this.assets.remove(url));

  /** Evento existente (editar). Null al crear. */
  readonly event = input<Event | null>(null);
  readonly registrationCount = input(0);
  readonly saving = input(false);
  readonly submitLabel = input('Guardar');
  /** Error del servidor atado a un campo (p. ej. slug duplicado), mostrado junto al control. */
  readonly serverError = input<ValidationIssue | null>(null);

  readonly save = output<EventInput>();

  readonly eventTypes = EVENT_TYPES.map((value) => ({ value, label: EVENT_TYPE_LABELS[value] }));
  readonly locationTypes = LOCATION_TYPES.map((value) => ({
    value,
    label: LOCATION_TYPE_LABELS[value],
  }));

  readonly model = signal<EventFormValue>(emptyEventFormValue());
  readonly slugManual = signal(false);
  readonly slugTaken = signal(false);
  readonly slugChecking = signal(false);
  readonly categories = signal<string[]>([]);

  /** Carpeta de assets: el id real si ya existe, o uno temporal para borradores nuevos. */
  private readonly draftFolderId = crypto.randomUUID();
  readonly assetFolderId = computed(() => this.event()?.id ?? this.draftFolderId);

  readonly slugLocked = computed(
    () => !!this.event() && (this.event()!.isPublished || this.registrationCount() > 0),
  );

  readonly f = form(this.model, (path) => {
    disabled(path.slug, () => this.slugLocked());
  });

  readonly validation = computed(() =>
    validateEvent(formValueToEventInput(this.model(), this.event()?.formFields ?? []), {
      slugTaken: this.slugTaken(),
      isPublished: this.event()?.isPublished,
      hasRegistrations: this.registrationCount() > 0,
      originalSlug: this.event()?.slug ?? null,
      originalEvent: this.event() ? eventToInput(this.event()!) : null,
    }),
  );

  readonly isRequiredToPublish = isRequiredToPublish;
  readonly submitted = signal(false);
  private readonly blurred = signal<ReadonlySet<string>>(new Set());
  private readonly baseline = signal('');
  /** Hay cambios sin guardar respecto de lo último guardado (o del formulario vacío). */
  readonly dirty = computed(() => JSON.stringify(this.model()) !== this.baseline());

  readonly errors = computed<ValidationIssue[]>(() => {
    const server = this.serverError();
    return server ? [...this.validation().errors, server] : this.validation().errors;
  });
  readonly summary = computed<ErrorSummaryItem[]>(() =>
    this.submitted() ? buildErrorSummary(this.errors(), FIELD_REFS) : [],
  );

  readonly startDate = computed(() => dateStringToDate(this.model().startDate));
  readonly startTime = computed(() => timeStringToDate(this.model().startTime));
  readonly endDate = computed(() => dateStringToDate(this.model().endDate));
  readonly endTime = computed(() => timeStringToDate(this.model().endTime));

  private slugRequest = 0;

  constructor() {
    // Auto-slug mientras no se haya editado a mano.
    effect(() => {
      const title = this.model().title;
      untracked(() => {
        const current = this.model().slug;
        const next = nextAutoSlug(title, current, this.slugManual(), this.slugLocked());
        if (next !== current) this.model.update((v) => ({ ...v, slug: next }));
      });
    });

    // Unicidad del slug con debounce.
    effect((onCleanup) => {
      const slug = this.model().slug;
      const original = this.event()?.slug;
      const eventId = this.event()?.id;
      const request = ++this.slugRequest;
      this.slugTaken.set(false);

      if (!slug || !isValidSlug(slug) || slug === original) {
        this.slugChecking.set(false);
        return;
      }
      this.slugChecking.set(true);
      const timer = setTimeout(async () => {
        try {
          const available = await this.eventsRepo.isSlugAvailable(slug, eventId);
          if (request === this.slugRequest) this.slugTaken.set(!available);
        } catch {
          // Si falla la consulta, la BD (UNIQUE) sigue siendo la garantía final.
        } finally {
          if (request === this.slugRequest) this.slugChecking.set(false);
        }
      }, SLUG_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnInit(): void {
    const existing = this.event();
    if (existing) {
      this.model.set(eventToFormValue(existing));
      this.slugManual.set(true);
    }
    this.baseline.set(JSON.stringify(this.model()));
    void this.loadCategories();
  }

  /** Primer error del campo; se muestra al salir del campo o tras intentar enviar. */
  fieldError(field: string): string | null {
    if (!this.submitted() && !this.blurred().has(field)) return null;
    return this.errors().find((e) => e.field === field)?.message ?? null;
  }

  markBlurred(field: string): void {
    if (this.blurred().has(field)) return;
    this.blurred.update((set) => new Set(set).add(field));
  }

  describedBy(field: string, hint = false): string | null {
    const ids = [hint ? `${FIELD_REFS[field]?.id ?? field}-hint` : null];
    if (this.fieldError(field)) ids.push(`${FIELD_REFS[field]?.id ?? field}-error`);
    const joined = ids.filter(Boolean).join(' ');
    return joined || null;
  }

  setDate(key: 'startDate' | 'endDate', value: Date | null): void {
    this.model.update((v) => ({ ...v, [key]: dateToDateString(value) }));
  }

  setTime(key: 'startTime' | 'endTime', value: Date | null): void {
    this.model.update((v) => ({ ...v, [key]: dateToTimeString(value) }));
  }

  onSlugInput(): void {
    this.slugManual.set(true);
  }

  onImageUploaded(url: string): void {
    this.cleanup.trackUploaded(url);
  }

  onImageDiscarded(url: string): void {
    void this.cleanup.trackDiscarded(url);
  }

  /** El padre llama esto tras guardar con éxito: borra los archivos reemplazados. */
  commitAssets(): Promise<void> {
    return this.cleanup.commit();
  }

  ngOnDestroy(): void {
    // Sin guardar: borra lo subido (mejor esfuerzo); lo ya guardado no se toca.
    void this.cleanup.rollback();
  }

  setImage(key: 'imageUrl' | 'bannerUrl', url: string | null): void {
    this.model.update((v) => ({ ...v, [key]: url }));
  }

  /** El padre llama esto tras guardar con éxito: lo actual pasa a ser la línea base. */
  markSaved(): void {
    this.baseline.set(JSON.stringify(this.model()));
    this.submitted.set(false);
  }

  /**
   * Valida todo, muestra el resumen y enfoca el primer campo con error. Devuelve el
   * EventInput listo para guardar, o null si hay errores.
   */
  async requestSave(): Promise<EventInput | null> {
    this.submitted.set(true);
    await this.recheckSlug();
    const items = this.summary();
    if (items.length) {
      focusField(items[0].id);
      return null;
    }
    return formValueToEventInput(this.model(), this.event()?.formFields ?? []);
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    const input = await this.requestSave();
    if (input) this.save.emit(input);
  }

  /** Antes de enviar, confirma el slug sin esperar al debounce. */
  private async recheckSlug(): Promise<void> {
    const slug = this.model().slug;
    if (!slug || !isValidSlug(slug) || slug === this.event()?.slug) return;
    try {
      const available = await this.eventsRepo.isSlugAvailable(slug, this.event()?.id);
      this.slugTaken.set(!available);
    } catch (err) {
      // La BD (UNIQUE) sigue siendo la garantía final; no bloquea el envío.
      console.warn(toUserMessage(err, 'No se pudo comprobar el slug.'));
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(distinctCategories(await this.eventsRepo.getEvents()));
    } catch {
      this.categories.set([]);
    }
  }
}
