import { ValidationIssue, ValidationResult } from './event-validators';

/** Pasos del asistente y pestañas de gestión: mismos nombres y mismo orden. */
export const EVENT_TABS = [
  { id: 'datos', label: 'Datos' },
  { id: 'formulario', label: 'Formulario de registro' },
  { id: 'paquetes', label: 'Paquetes' },
  { id: 'sesiones', label: 'Tracks y sesiones' },
  { id: 'extras', label: 'Cupones, staff y sorteo' },
  { id: 'publicacion', label: 'Publicación' },
] as const;

export type EventTabId = (typeof EVENT_TABS)[number]['id'];

export const DEFAULT_EVENT_TAB: EventTabId = 'datos';

export function parseEventTab(value: string | null | undefined): EventTabId {
  return EVENT_TABS.find((t) => t.id === value)?.id ?? DEFAULT_EVENT_TAB;
}

/** Campos de "Datos" que la publicación exige además de los obligatorios para guardar. */
export const PUBLISH_REQUIRED_FIELDS = [
  'description',
  'locationName',
  'locationType',
  'dateEnd',
  'imageUrl',
] as const;

export function isRequiredToPublish(field: string): boolean {
  return (PUBLISH_REQUIRED_FIELDS as readonly string[]).includes(field);
}

/** Pestaña donde se corrige un error de validación de publicación. */
export function tabForField(field: string): EventTabId {
  if (field.startsWith('fields[')) return 'formulario';
  if (field.startsWith('ticketTypes')) return 'paquetes';
  if (field === 'sessions') return 'sesiones';
  return 'datos';
}

/** Id del control del DOM al que lleva un error de publicación (null = solo la pestaña). */
const FIELD_DOM_IDS: Record<string, string> = {
  title: 'ev-title',
  slug: 'ev-slug',
  eventType: 'ev-type',
  locationType: 'ev-mode',
  locationName: 'ev-place',
  addressLink: 'ev-link',
  whatsappGroupUrl: 'ev-whatsapp',
  capacity: 'ev-capacity',
  dateStart: 'ev-start-date',
  dateEnd: 'ev-end-date',
  description: 'ev-desc',
  imageUrl: 'ev-cover',
};

export function domIdForField(field: string): string | null {
  return FIELD_DOM_IDS[field] ?? null;
}

export type TabStatus = 'complete' | 'pending' | 'error' | 'optional';

/**
 * Estado de cada pestaña según el checklist de publicación. "Cupones, staff y sorteo" es opcional
 * y "Publicación" solo está completa cuando nada más falta.
 */
export function tabStatuses(
  result: ValidationResult | null,
  hasDraft: boolean,
): Record<EventTabId, TabStatus> {
  const pendingIn = (tab: EventTabId) =>
    (result?.errors ?? []).filter((e) => tabForField(e.field) === tab).length > 0;
  const status = (tab: EventTabId): TabStatus => {
    if (!hasDraft) return 'pending';
    return pendingIn(tab) ? 'pending' : 'complete';
  };
  const total = result?.errors.length ?? 1;
  return {
    datos: status('datos'),
    formulario: status('formulario'),
    paquetes: status('paquetes'),
    sesiones: status('sesiones'),
    extras: 'optional',
    publicacion: hasDraft && total === 0 ? 'complete' : 'pending',
  };
}

export function issuesForTab(result: ValidationResult | null, tab: EventTabId): ValidationIssue[] {
  return (result?.errors ?? []).filter((e) => tabForField(e.field) === tab);
}

/** Primera pestaña con algo pendiente para publicar (la reanudación de un borrador cae ahí). */
export function firstPendingTab(result: ValidationResult | null): EventTabId {
  const order: EventTabId[] = ['datos', 'formulario', 'paquetes', 'sesiones'];
  return order.find((t) => issuesForTab(result, t).length > 0) ?? 'publicacion';
}
