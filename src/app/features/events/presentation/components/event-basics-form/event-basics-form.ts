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
import { FormField, disabled, form } from '@angular/forms/signals';

import { InputTextModule } from 'primeng/inputtext';

import { AssetCleanupTracker } from '../../../domain/asset-cleanup';
import { AssetsRepository } from '../../../domain/assets.repository';
import { EventsRepository } from '../../../domain/events.repository';
import { EVENT_TYPES, Event, EventInput, LOCATION_TYPES } from '../../../domain/event.model';
import {
  EventFormValue,
  distinctCategories,
  emptyEventFormValue,
  eventToFormValue,
  eventToInput,
  formValueToEventInput,
  nextAutoSlug,
} from '../../../domain/event-form';
import { isValidSlug, validateEvent } from '../../../domain/event-validators';
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

@Component({
  selector: 'app-event-basics-form',
  standalone: true,
  imports: [FormField, InputTextModule, ImageUploader],
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

  readonly canSave = computed(
    () => this.validation().errors.length === 0 && !this.slugChecking() && !this.saving(),
  );

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
    void this.loadCategories();
  }

  /** Primer error del campo; solo se muestra si el campo fue tocado. */
  fieldError(field: string, touched: boolean): string | null {
    if (!touched) return null;
    return this.validation().errors.find((e) => e.field === field)?.message ?? null;
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

  submit(): void {
    if (!this.canSave()) return;
    this.save.emit(formValueToEventInput(this.model(), this.event()?.formFields ?? []));
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(distinctCategories(await this.eventsRepo.getEvents()));
    } catch {
      this.categories.set([]);
    }
  }
}
