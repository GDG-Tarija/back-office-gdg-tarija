import { Event, EventInput } from './event.model';
import { FormField } from './form-field.model';
import { Session } from './session.model';
import { TicketType } from './ticket-type.model';
import {
  PublishContext,
  fromLaPaz,
  isValidDateString,
  isValidTimeString,
  slugify,
  toLaPazIso,
} from './event-validators';

/** Valor editable del formulario de datos básicos (todo como texto, fechas en hora de La Paz). */
export interface EventFormValue {
  title: string;
  slug: string;
  eventType: string;
  category: string;
  locationType: string;
  locationName: string;
  addressLink: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  capacity: string;
  description: string;
  imageUrl: string | null;
  bannerUrl: string | null;
}

export function emptyEventFormValue(): EventFormValue {
  return {
    title: '',
    slug: '',
    eventType: 'MEETUP',
    category: '',
    locationType: 'PHYSICAL',
    locationName: '',
    addressLink: '',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '18:00',
    capacity: '',
    description: '',
    imageUrl: null,
    bannerUrl: null,
  };
}

export function eventToFormValue(event: Event): EventFormValue {
  const start = fromLaPaz(event.dateStart);
  const end = event.dateEnd ? fromLaPaz(event.dateEnd) : null;
  return {
    title: event.title,
    slug: event.slug,
    eventType: event.eventType,
    category: event.category ?? '',
    locationType: event.locationType ?? '',
    locationName: event.locationName ?? '',
    addressLink: event.addressLink ?? '',
    startDate: start.date,
    startTime: start.time,
    endDate: end?.date ?? '',
    endTime: end?.time ?? '18:00',
    capacity: String(event.capacity),
    description: event.description ?? '',
    imageUrl: event.imageUrl,
    bannerUrl: event.bannerUrl,
  };
}

function orNull(value: string): string | null {
  const clean = value.trim();
  return clean ? clean : null;
}

function toInstant(date: string, time: string): Date | null {
  if (!isValidDateString(date) || !isValidTimeString(time)) return null;
  return new Date(toLaPazIso(date, time));
}

/** Convierte el valor del formulario a EventInput (capacidad inválida -> null para que validateEvent la reporte). */
export function formValueToEventInput(
  value: EventFormValue,
  formFields: FormField[] = [],
): EventInput {
  const capacityText = value.capacity.trim();
  const capacity = capacityText === '' ? null : Number(capacityText);
  return {
    title: value.title.trim(),
    slug: value.slug.trim(),
    eventType: value.eventType,
    category: orNull(value.category),
    locationType: orNull(value.locationType),
    locationName: orNull(value.locationName),
    addressLink: orNull(value.addressLink),
    dateStart: toInstant(value.startDate, value.startTime),
    dateEnd: value.endDate ? toInstant(value.endDate, value.endTime) : null,
    capacity: capacity !== null && Number.isNaN(capacity) ? null : capacity,
    description: orNull(value.description),
    imageUrl: value.imageUrl,
    bannerUrl: value.bannerUrl,
    formFields,
  };
}

export function eventToInput(event: Event): EventInput {
  return formValueToEventInput(eventToFormValue(event), event.formFields);
}

/**
 * Slug a aplicar cuando cambia el título: mientras el slug no se haya editado a mano
 * (o esté bloqueado) sigue al título.
 */
export function nextAutoSlug(
  title: string,
  currentSlug: string,
  manuallyEdited: boolean,
  locked = false,
): string {
  if (manuallyEdited || locked) return currentSlug;
  return slugify(title);
}

/** Categorías únicas (sin distinguir mayúsculas) ordenadas alfabéticamente. */
export function distinctCategories(events: Pick<Event, 'category'>[]): string[] {
  const seen = new Map<string, string>();
  for (const e of events) {
    const c = e.category?.trim();
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Contexto para validatePublish a partir de los datos ya guardados. */
export function buildPublishContext(
  event: Event,
  ticketTypes: Pick<TicketType, 'name' | 'ticketCapacity' | 'phases'>[],
  sessions: Session[],
): PublishContext {
  return {
    event: eventToInput(event),
    ticketTypes,
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      trackId: s.trackId,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  };
}
