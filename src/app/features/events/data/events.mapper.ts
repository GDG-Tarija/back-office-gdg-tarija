import { Event, EventInput, Attendee } from '../domain/event.model';
import { computeAmountDue } from '../domain/attendee-payment';
import { FORM_FIELD_TYPES, FormField, FormFieldType } from '../domain/form-field.model';
import { EventInsert, EventRow, RegistrationWithDetailsRow } from './events.dto';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Lee extra_info.form_fields tolerando datos mal formados. */
export function parseFormFields(extraInfo: unknown): FormField[] {
  const raw = asRecord(extraInfo)?.['form_fields'];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): FormField[] => {
    const f = asRecord(item);
    if (!f || typeof f['key'] !== 'string') return [];
    const type = FORM_FIELD_TYPES.includes(f['type'] as FormFieldType)
      ? (f['type'] as FormFieldType)
      : 'text';
    const field: FormField = {
      key: f['key'],
      label: typeof f['label'] === 'string' ? f['label'] : f['key'],
      type,
      required: f['required'] === true,
    };
    if (typeof f['placeholder'] === 'string' && f['placeholder'])
      field.placeholder = f['placeholder'];
    if (Array.isArray(f['options'])) {
      field.options = f['options'].filter((o): o is string => typeof o === 'string');
    }
    return [field];
  });
}

/** Serializa los campos omitiendo claves vacías, para mantener el contrato con el sitio público. */
export function serializeFormFields(fields: FormField[]): Record<string, unknown>[] {
  return fields.map((f) => {
    const out: Record<string, unknown> = {
      key: f.key,
      label: f.label.trim(),
      type: f.type,
      required: f.required,
    };
    if (f.placeholder?.trim()) out['placeholder'] = f.placeholder.trim();
    if (f.type === 'select') {
      out['options'] = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
    }
    return out;
  });
}

export function toDomainEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    eventType: row.event_type,
    capacity: row.capacity,
    dateStart: new Date(row.date_start),
    dateEnd: row.date_end ? new Date(row.date_end) : null,
    isPublished: !!row.is_published,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    description: row.description,
    imageUrl: row.image_url,
    bannerUrl: row.banner_url,
    locationType: row.location_type,
    locationName: row.location_name,
    addressLink: row.address_link,
    category: row.category,
    extraInfo: asRecord(row.extra_info),
    formFields: parseFormFields(row.extra_info),
  };
}

/** Conserva el resto de claves de extra_info y reemplaza solo form_fields. */
export function toEventRow(
  input: EventInput,
  currentExtraInfo: unknown = null,
): Omit<EventInsert, 'is_published'> {
  return {
    title: input.title.trim(),
    slug: input.slug,
    event_type: input.eventType,
    category: input.category?.trim() || null,
    location_type: input.locationType,
    location_name: input.locationName?.trim() || null,
    address_link: input.addressLink?.trim() || null,
    date_start: input.dateStart!.toISOString(),
    date_end: input.dateEnd ? input.dateEnd.toISOString() : null,
    capacity: input.capacity!,
    description: input.description?.trim() || null,
    image_url: input.imageUrl,
    banner_url: input.bannerUrl,
    extra_info: {
      ...(asRecord(currentExtraInfo) ?? {}),
      form_fields: serializeFormFields(input.formFields),
    } as EventInsert['extra_info'],
  };
}

export function toDomainAttendee(row: RegistrationWithDetailsRow): Attendee {
  const user = row.users;
  const ticket = row.ticket_types;
  const phase = row.ticket_phases ?? null;
  const scanLogs = row.scan_logs;
  const checkinLog = scanLogs?.find((log) => log.scan_type === 'checkin');
  const refrigerioLog = scanLogs?.find((log) => log.scan_type === 'refrigerio');

  return {
    id: row.id,
    userId: row.user_id || user?.id || null,
    email: user?.email || '',
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    avatarUrl: user?.avatar_url || null,
    phone: user?.phone || null,
    role: row.event_role,
    status: row.status,
    ticketName: ticket?.name || 'General',
    ticketPrice: ticket?.price || 0,
    phaseName: phase?.name ?? null,
    phasePrice: phase ? phase.price : null,
    couponId: row.coupon_id ?? null,
    couponCode: row.event_coupons?.code ?? null,
    amountDue: computeAmountDue({
      couponId: row.coupon_id ?? null,
      phasePrice: phase ? phase.price : null,
      packagePrice: ticket?.price || 0,
    }),
    registeredAt: row.created_at ? new Date(row.created_at) : null,
    customResponses: row.custom_responses,
    paymentProofUrl: row.payment_proof_url || null,
    checkedIn: !!checkinLog,
    checkedInAt: checkinLog?.scanned_at ? new Date(checkinLog.scanned_at) : null,
    refrigerioDelivered: !!refrigerioLog,
    refrigerioDeliveredAt: refrigerioLog?.scanned_at ? new Date(refrigerioLog.scanned_at) : null,
  };
}
