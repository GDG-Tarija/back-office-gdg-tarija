import { COUPON_ROLES, CouponInput } from './coupon.model';
import { EVENT_TYPES, EventInput, LOCATION_TYPES } from './event.model';
import { FORM_FIELD_TYPES, FormField } from './form-field.model';
import { SESSION_LEVELS, SessionInput } from './session.model';
import { TicketTypeInput } from './ticket-type.model';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function isValid(result: ValidationResult): boolean {
  return result.errors.length === 0;
}

function newResult(): ValidationResult {
  return { errors: [], warnings: [] };
}

function merge(...results: ValidationResult[]): ValidationResult {
  return {
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}

// ---------------------------------------------------------------------------
// Zona horaria America/La_Paz (UTC-4, sin horario de verano)
// ---------------------------------------------------------------------------

const LA_PAZ_OFFSET_HOURS = 4;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDateString(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isValidTimeString(value: string | null | undefined): value is string {
  return !!value && TIME_RE.test(value);
}

/** 'YYYY-MM-DD' + 'HH:mm' (hora de La Paz) -> ISO UTC (ej. '2026-10-15T13:00:00.000Z'). */
export function toLaPazIso(date: string, time: string): string {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t || !isValidDateString(date))
    throw new Error(`Fecha u hora inválida: ${date} ${time}`);
  const ms = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1] + LA_PAZ_OFFSET_HOURS, +t[2]);
  return new Date(ms).toISOString();
}

/** Instante (Date o ISO) -> fecha y hora locales de La Paz. */
export function fromLaPaz(value: Date | string): { date: string; time: string } {
  const instant = typeof value === 'string' ? new Date(value) : value;
  const shifted = new Date(instant.getTime() - LA_PAZ_OFFSET_HOURS * 3600_000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

// ---------------------------------------------------------------------------
// Evento
// ---------------------------------------------------------------------------

export interface EventValidationContext {
  /** Resultado de EventsRepository.isSlugAvailable. */
  slugTaken?: boolean;
  isPublished?: boolean;
  hasRegistrations?: boolean;
  /** Slug guardado actualmente (solo al editar). */
  originalSlug?: string | null;
  /** Para avisar al cambiar fechas/capacidad con inscritos. */
  originalEvent?: Pick<EventInput, 'dateStart' | 'dateEnd' | 'capacity'> | null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateEvent(
  input: EventInput,
  ctx: EventValidationContext = {},
): ValidationResult {
  const r = newResult();
  const title = input.title.trim();
  if (title.length < 3 || title.length > 255) {
    r.errors.push({ field: 'title', message: 'El título debe tener entre 3 y 255 caracteres.' });
  }

  if (!input.slug) {
    r.errors.push({ field: 'slug', message: 'El slug es obligatorio.' });
  } else if (!isValidSlug(input.slug)) {
    r.errors.push({
      field: 'slug',
      message: 'El slug solo admite minúsculas, números y guiones simples (ej. mi-evento-2026).',
    });
  } else if (ctx.slugTaken) {
    r.errors.push({ field: 'slug', message: 'Ya existe un evento con ese slug.' });
  }
  const locked = !!(ctx.isPublished || ctx.hasRegistrations);
  if (locked && ctx.originalSlug && input.slug !== ctx.originalSlug) {
    r.errors.push({
      field: 'slug',
      message: 'El slug no se puede cambiar en un evento publicado o con inscritos.',
    });
  }

  if (!EVENT_TYPES.includes(input.eventType as (typeof EVENT_TYPES)[number])) {
    r.errors.push({ field: 'eventType', message: 'Selecciona un tipo de evento válido.' });
  }
  if (
    input.locationType &&
    !LOCATION_TYPES.includes(input.locationType as (typeof LOCATION_TYPES)[number])
  ) {
    r.errors.push({ field: 'locationType', message: 'Selecciona una modalidad válida.' });
  }

  if (!input.dateStart || isNaN(input.dateStart.getTime())) {
    r.errors.push({ field: 'dateStart', message: 'La fecha de inicio es obligatoria.' });
  } else if (input.dateEnd && input.dateEnd.getTime() <= input.dateStart.getTime()) {
    r.errors.push({
      field: 'dateEnd',
      message: 'La fecha de fin debe ser posterior a la de inicio.',
    });
  }

  if (!Number.isInteger(input.capacity) || (input.capacity ?? 0) < 1) {
    r.errors.push({
      field: 'capacity',
      message: 'La capacidad debe ser un entero mayor o igual a 1.',
    });
  }

  const link = input.addressLink?.trim() ?? '';
  if (link && !isValidHttpUrl(link)) {
    r.errors.push({
      field: 'addressLink',
      message: 'El enlace debe ser una URL válida (http/https).',
    });
  }
  if ((input.locationType === 'VIRTUAL' || input.locationType === 'HYBRID') && !link) {
    r.errors.push({
      field: 'addressLink',
      message: 'El enlace es obligatorio en eventos virtuales o híbridos.',
    });
  }

  if (ctx.hasRegistrations && ctx.originalEvent) {
    const o = ctx.originalEvent;
    const changed =
      o.dateStart?.getTime() !== input.dateStart?.getTime() ||
      o.dateEnd?.getTime() !== input.dateEnd?.getTime() ||
      o.capacity !== input.capacity;
    if (changed) {
      r.warnings.push({
        field: 'dateStart',
        message: 'Cambiar fechas o capacidad afectará a personas ya inscritas.',
      });
    }
  }

  return r;
}

// ---------------------------------------------------------------------------
// Paquetes (ticket_types)
// ---------------------------------------------------------------------------

export interface TicketTypeValidationContext {
  /** Nombres de los demás paquetes del evento (excluyendo el que se edita). */
  otherNames: string[];
  /** Inscritos en este paquete (al editar). */
  registeredCount?: number;
  /** Precio actual guardado, para avisar si cambia con inscritos. */
  originalPrice?: number;
}

function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

export function validateTicketType(
  input: TicketTypeInput,
  ctx: TicketTypeValidationContext,
): ValidationResult {
  const r = newResult();
  const name = input.name.trim();
  if (!name) {
    r.errors.push({ field: 'name', message: 'El nombre del paquete es obligatorio.' });
  } else if (name.length > 100) {
    r.errors.push({ field: 'name', message: 'El nombre no puede superar los 100 caracteres.' });
  } else if (ctx.otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    r.errors.push({ field: 'name', message: 'Ya existe un paquete con ese nombre en el evento.' });
  }

  if (typeof input.price !== 'number' || isNaN(input.price) || input.price < 0) {
    r.errors.push({ field: 'price', message: 'El precio debe ser un número mayor o igual a 0.' });
  } else if (!hasAtMostTwoDecimals(input.price)) {
    r.errors.push({ field: 'price', message: 'El precio admite como máximo 2 decimales.' });
  } else {
    const qr = input.paymentQrUrl?.trim();
    if (input.price > 0 && !qr) {
      r.errors.push({
        field: 'paymentQrUrl',
        message: 'Los paquetes de pago requieren el QR de pago.',
      });
    }
    if (input.price === 0 && qr) {
      r.errors.push({
        field: 'paymentQrUrl',
        message: 'Los paquetes gratuitos no deben tener QR de pago.',
      });
    }
  }

  if (input.ticketCapacity !== null) {
    if (!Number.isInteger(input.ticketCapacity) || input.ticketCapacity < 1) {
      r.errors.push({
        field: 'ticketCapacity',
        message: 'El cupo debe ser un entero mayor o igual a 1, o quedar vacío.',
      });
    } else if (ctx.registeredCount !== undefined && input.ticketCapacity < ctx.registeredCount) {
      r.errors.push({
        field: 'ticketCapacity',
        message: `El cupo no puede ser menor a los ${ctx.registeredCount} inscritos actuales.`,
      });
    }
  }

  if (ctx.registeredCount && ctx.originalPrice !== undefined && ctx.originalPrice !== input.price) {
    r.warnings.push({
      field: 'price',
      message: 'Cambiar el precio no afecta a quienes ya se inscribieron con el precio anterior.',
    });
  }
  return r;
}

/** Aviso (no bloqueo) si la suma de cupos de paquetes supera la capacidad del evento. */
export function validateTicketCapacities(
  tickets: Pick<TicketTypeInput, 'ticketCapacity'>[],
  eventCapacity: number,
): ValidationResult {
  const r = newResult();
  const total = tickets.reduce((acc, t) => acc + (t.ticketCapacity ?? 0), 0);
  if (total > eventCapacity) {
    r.warnings.push({
      field: 'ticketCapacity',
      message: `La suma de cupos de los paquetes (${total}) supera la capacidad del evento (${eventCapacity}).`,
    });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export function validateTrack(
  input: { name: string },
  ctx: { otherNames: string[] },
): ValidationResult {
  const r = newResult();
  const name = input.name.trim();
  if (!name) {
    r.errors.push({ field: 'name', message: 'El nombre del track es obligatorio.' });
  } else if (ctx.otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    r.errors.push({ field: 'name', message: 'Ya existe un track con ese nombre en el evento.' });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

export interface SessionSlot {
  id?: string;
  title: string;
  trackId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface SessionValidationContext {
  eventStart: Date | null;
  eventEnd: Date | null;
  /** IDs de tracks del mismo evento. */
  eventTrackIds: string[];
  /** Otras sesiones del evento, para avisar de solapes en el mismo track. */
  otherSessions?: SessionSlot[];
  /** Id de la sesión editada (se excluye de otherSessions). */
  selfId?: string;
}

export function normalizeTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of topics) {
    const clean = t.trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function overlaps(a: SessionSlot, b: SessionSlot): boolean {
  if (!a.date || a.date !== b.date) return false;
  if (!isValidTimeString(a.startTime) || !isValidTimeString(a.endTime)) return false;
  if (!isValidTimeString(b.startTime) || !isValidTimeString(b.endTime)) return false;
  return (
    toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}

/** Pares de sesiones del mismo track que se solapan en el tiempo. */
export function findSessionOverlaps(sessions: SessionSlot[]): [SessionSlot, SessionSlot][] {
  const pairs: [SessionSlot, SessionSlot][] = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.trackId && a.trackId === b.trackId && overlaps(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
}

export function validateSession(
  input: SessionInput,
  ctx: SessionValidationContext,
): ValidationResult {
  const r = newResult();
  if (!input.title.trim()) {
    r.errors.push({ field: 'title', message: 'El título de la sesión es obligatorio.' });
  }

  if (!isValidDateString(input.date)) {
    r.errors.push({ field: 'date', message: 'La fecha de la sesión es obligatoria (AAAA-MM-DD).' });
  } else if (ctx.eventStart) {
    const first = fromLaPaz(ctx.eventStart).date;
    const last = fromLaPaz(ctx.eventEnd ?? ctx.eventStart).date;
    if (input.date < first || input.date > last) {
      r.errors.push({
        field: 'date',
        message: 'La fecha de la sesión debe estar dentro del rango del evento.',
      });
    }
  }

  const startOk = isValidTimeString(input.startTime);
  const endOk = isValidTimeString(input.endTime);
  if (!startOk)
    r.errors.push({ field: 'startTime', message: 'La hora de inicio es obligatoria (HH:mm).' });
  if (!endOk)
    r.errors.push({ field: 'endTime', message: 'La hora de fin es obligatoria (HH:mm).' });
  if (startOk && endOk && toMinutes(input.endTime!) <= toMinutes(input.startTime!)) {
    r.errors.push({
      field: 'endTime',
      message: 'La hora de fin debe ser posterior a la de inicio.',
    });
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    r.errors.push({
      field: 'capacity',
      message: 'La capacidad debe ser un entero mayor o igual a 1.',
    });
  }

  if (input.trackId && !ctx.eventTrackIds.includes(input.trackId)) {
    r.errors.push({ field: 'trackId', message: 'El track no pertenece a este evento.' });
  }

  if (input.level !== null && !SESSION_LEVELS.includes(input.level)) {
    r.errors.push({ field: 'level', message: 'El nivel debe ser Básico, Intermedio o Avanzado.' });
  }

  if (r.errors.length === 0 && input.trackId) {
    const self: SessionSlot = { ...input, id: ctx.selfId };
    const clash = (ctx.otherSessions ?? []).find(
      (o) => o.id !== ctx.selfId && o.trackId === input.trackId && overlaps(self, o),
    );
    if (clash) {
      r.warnings.push({
        field: 'startTime',
        message: `Se solapa con "${clash.title}" en el mismo track.`,
      });
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Cupones
// ---------------------------------------------------------------------------

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface CouponValidationContext {
  /** Códigos de los demás cupones del evento. */
  otherCodes: string[];
  usedCount?: number;
}

export function validateCoupon(input: CouponInput, ctx: CouponValidationContext): ValidationResult {
  const r = newResult();
  const code = input.code;
  if (/\s/.test(code)) {
    r.errors.push({ field: 'code', message: 'El código no puede contener espacios.' });
  } else if (code.length < 3 || code.length > 50) {
    r.errors.push({ field: 'code', message: 'El código debe tener entre 3 y 50 caracteres.' });
  } else if (code !== code.toUpperCase()) {
    r.errors.push({ field: 'code', message: 'El código debe estar en MAYÚSCULAS.' });
  } else if (ctx.otherCodes.some((c) => c.toUpperCase() === code)) {
    r.errors.push({ field: 'code', message: 'Ya existe un cupón con ese código en el evento.' });
  }

  if (!Number.isInteger(input.maxUses) || input.maxUses < 1) {
    r.errors.push({
      field: 'maxUses',
      message: 'Los usos máximos deben ser un entero mayor o igual a 1.',
    });
  } else if (ctx.usedCount !== undefined && input.maxUses < ctx.usedCount) {
    r.errors.push({
      field: 'maxUses',
      message: `Los usos máximos no pueden ser menores a los ${ctx.usedCount} ya utilizados.`,
    });
  }

  if (!COUPON_ROLES.includes(input.role)) {
    r.errors.push({ field: 'role', message: 'Selecciona un rol válido.' });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStaffEmail(email: string, existing: string[]): ValidationResult {
  const r = newResult();
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) {
    r.errors.push({ field: 'staffEmail', message: 'Ingresa un correo electrónico válido.' });
  } else if (existing.some((e) => e.trim().toLowerCase() === clean)) {
    r.errors.push({ field: 'staffEmail', message: 'Ese correo ya está asignado al evento.' });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Formulario de registro
// ---------------------------------------------------------------------------

const FIELD_KEY_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Genera una key snake_case a partir de una etiqueta. */
export function fieldKeyFromLabel(label: string): string {
  const base = slugify(label).replace(/-/g, '_');
  return /^[a-z]/.test(base) ? base : base ? `campo_${base}` : '';
}

export function validateFormFields(fields: FormField[]): ValidationResult {
  const r = newResult();
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    const at = `fields[${i}]`;
    if (!f.label.trim()) {
      r.errors.push({ field: `${at}.label`, message: 'La etiqueta del campo es obligatoria.' });
    }
    if (!FIELD_KEY_RE.test(f.key)) {
      r.errors.push({
        field: `${at}.key`,
        message: 'La clave debe estar en snake_case (ej. nombre_empresa).',
      });
    } else if (seen.has(f.key)) {
      r.errors.push({ field: `${at}.key`, message: `La clave "${f.key}" está repetida.` });
    }
    seen.add(f.key);
    if (!FORM_FIELD_TYPES.includes(f.type)) {
      r.errors.push({ field: `${at}.type`, message: 'Tipo de campo no válido.' });
    }
    if (f.type === 'select') {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        r.errors.push({
          field: `${at}.options`,
          message: 'Un campo de selección necesita al menos 2 opciones.',
        });
      }
    }
  });
  return r;
}

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------

export type ImageKind = 'cover' | 'banner' | 'ticket' | 'qr' | 'avatar';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const IMAGE_MAX_BYTES: Record<ImageKind, number> = {
  cover: 2 * 1024 * 1024,
  banner: 2 * 1024 * 1024,
  ticket: 2 * 1024 * 1024,
  qr: 500 * 1024,
  avatar: 500 * 1024,
};

export function validateImageFile(
  file: { type: string; size: number },
  kind: ImageKind,
): ValidationResult {
  const r = newResult();
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    r.errors.push({ field: 'file', message: 'Formato no permitido. Usa JPG, PNG o WebP.' });
  }
  const max = IMAGE_MAX_BYTES[kind];
  if (file.size > max) {
    const label = max >= 1024 * 1024 ? `${max / (1024 * 1024)} MB` : `${max / 1024} KB`;
    r.errors.push({ field: 'file', message: `La imagen supera el tamaño máximo de ${label}.` });
  }
  if (file.size <= 0) {
    r.errors.push({ field: 'file', message: 'El archivo está vacío.' });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

export interface PublishContext {
  event: EventInput;
  ticketTypes: Pick<TicketTypeInput, 'ticketCapacity'>[];
  sessions: SessionSlot[];
}

/** Checklist bloqueante para publicar. Los avisos no impiden publicar. */
export function validatePublish(ctx: PublishContext): ValidationResult {
  const r = newResult();
  const e = ctx.event;

  const base = validateEvent(e);
  r.errors.push(...base.errors);
  const missing: string[] = [];
  if (!e.description?.trim()) missing.push('descripción');
  if (!e.locationName?.trim()) missing.push('lugar');
  if (!e.locationType) missing.push('modalidad');
  if (!e.dateEnd) missing.push('fecha de fin');
  if (missing.length) {
    r.errors.push({
      field: 'event',
      message: `Completa los datos del evento: falta ${missing.join(', ')}.`,
    });
  }

  if (ctx.ticketTypes.length < 1) {
    r.errors.push({ field: 'ticketTypes', message: 'Crea al menos un paquete de entrada.' });
  }
  if (!e.imageUrl) {
    r.errors.push({ field: 'imageUrl', message: 'Sube una imagen de portada.' });
  }
  r.errors.push(...validateFormFields(e.formFields).errors);

  const incomplete = ctx.sessions.filter(
    (s) =>
      !isValidDateString(s.date) ||
      !isValidTimeString(s.startTime) ||
      !isValidTimeString(s.endTime),
  );
  if (incomplete.length) {
    r.errors.push({
      field: 'sessions',
      message: `${incomplete.length} sesión(es) sin fecha u hora completas.`,
    });
  }

  const warnings = merge(
    e.capacity ? validateTicketCapacities(ctx.ticketTypes, e.capacity) : newResult(),
  );
  r.warnings.push(...warnings.warnings);
  for (const [a, b] of findSessionOverlaps(ctx.sessions)) {
    r.warnings.push({
      field: 'sessions',
      message: `"${a.title}" y "${b.title}" se solapan en el mismo track.`,
    });
  }
  return r;
}
