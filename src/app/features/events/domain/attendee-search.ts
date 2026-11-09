import { Attendee } from './event.model';

const COMMON_RESPONSE_LABELS: Record<string, string> = {
  t_shirt_size: 'Talla de polera',
  tshirt: 'Talla de polera',
  tshirt_size: 'Talla de polera',
  polera: 'Talla de polera',
  camiseta: 'Talla de camiseta',
  occupation: 'Ocupación',
  organization: 'Institución / Organización',
  university: 'Universidad / Colegio',
  company: 'Empresa',
  dietary: 'Requerimientos alimentarios',
  food_restrictions: 'Restricciones alimenticias',
  city: 'Ciudad de residencia',
  experience: 'Nivel de experiencia',
  interest: 'Área de interés',
  how_did_you_know: '¿Cómo te enteraste?',
  how_heard: '¿Cómo te enteraste?',
  first_time: '¿Es tu primera vez?',
  github: 'Usuario de GitHub',
  linkedin: 'Perfil de LinkedIn',
  has_laptop: '¿Cuentas con una laptop?',
  discovery_source: '¿Cómo se enteró del evento?',
  experience_level: 'Nivel de experiencia',
  dietary_restrictions: 'Restricciones alimentarias',
  additional_notes: '¿Tiene alguna consulta o duda?',
};

export interface MatchedCustomResponse {
  key: string;
  label: string;
  value: string;
}

/** Normaliza texto a minúsculas sin tildes/diacríticos para búsqueda flexible. */
export function normalizeSearchText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrae únicamente los dígitos de un número de teléfono o cadena. */
export function normalizePhoneDigits(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

export function formatCustomResponseLabel(key: string | number | symbol): string {
  const keyStr = String(key);
  const lowerKey = keyStr.toLowerCase();

  const translation = COMMON_RESPONSE_LABELS[lowerKey];
  if (translation) {
    return translation;
  }

  if (lowerKey.includes('compu') || lowerKey.includes('laptop') || lowerKey.includes('computer')) {
    return '¿Llevará computadora?';
  }

  return keyStr
    .replace(/[-_]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function translateAttendeeRole(role?: string): string {
  switch (role?.toUpperCase()) {
    case 'ORGANIZER':
    case 'STAFF':
      return 'Staff';
    case 'SPEAKER':
      return 'Expositor';
    case 'VOLUNTEER':
      return 'Voluntario';
    case 'SPONSOR':
      return 'Sponsor';
    case 'ATTENDEE':
      return 'Asistente';
    default:
      return role || 'Asistente';
  }
}

export function getAttendeeRoleSeverity(
  role?: string,
): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
  switch (role?.toUpperCase()) {
    case 'ORGANIZER':
    case 'STAFF':
      return 'danger';
    case 'SPEAKER':
      return 'warn';
    case 'VOLUNTEER':
    case 'SPONSOR':
      return 'info';
    default:
      return 'secondary';
  }
}

export function translateAttendeeStatus(status?: string): string {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'Confirmado';
    case 'PENDING':
      return 'Pendiente';
    case 'CANCELLED':
      return 'Cancelado';
    default:
      return status || 'Desconocido';
  }
}

export function getAttendeeStatusSeverity(
  status?: string,
): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'success';
    case 'PENDING':
      return 'warn';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'secondary';
  }
}

function isBooleanLike(val: unknown): boolean {
  if (typeof val === 'boolean') return true;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    return lower === 'true' || lower === 'false';
  }
  return false;
}

function extractCustomResponseStrings(customResponses: Record<string, unknown> | null): string[] {
  if (!customResponses) return [];
  const values: string[] = [];

  for (const val of Object.values(customResponses)) {
    if (val === null || val === undefined || isBooleanLike(val)) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== null && item !== undefined && !isBooleanLike(item)) {
          values.push(String(item));
        }
      }
    } else if (typeof val === 'string' || typeof val === 'number') {
      const trimmed = String(val).trim();
      if (trimmed) {
        values.push(trimmed);
      }
    }
  }

  return values;
}

/**
 * Evalúa si un asistente coincide con el término de búsqueda (nombre, apellido,
 * correo, celular, ID de inscripción/usuario o respuestas del formulario).
 */
export function matchesAttendeeSearch(attendee: Attendee, rawQuery: string): boolean {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return true;

  const customStrings = extractCustomResponseStrings(attendee.customResponses);

  const searchableParts = [
    attendee.id,
    attendee.userId ?? '',
    attendee.firstName,
    attendee.lastName,
    `${attendee.firstName} ${attendee.lastName}`,
    attendee.email,
    attendee.phone ?? '',
    attendee.ticketName,
    attendee.phaseName ?? '',
    attendee.couponCode ?? '',
    attendee.role,
    translateAttendeeRole(attendee.role),
    attendee.status,
    translateAttendeeStatus(attendee.status),
    ...customStrings,
  ];

  const searchableText = normalizeSearchText(searchableParts.join(' '));
  const phoneDigits = [attendee.phone ?? '', ...customStrings]
    .map(normalizePhoneDigits)
    .filter(Boolean)
    .join(' ');

  // Si la consulta es un número telefónico con espacios o guiones (ej. "+591 700 00001")
  const queryDigits = normalizePhoneDigits(rawQuery);
  const isPhoneLikeQuery = /^[\d+\s()-]+$/.test(rawQuery.trim()) && queryDigits.length >= 3;
  if (isPhoneLikeQuery && phoneDigits.includes(queryDigits)) {
    return true;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return tokens.every((token) => {
    if (searchableText.includes(token)) return true;
    const tokenDigits = normalizePhoneDigits(token);
    if (tokenDigits.length >= 3 && phoneDigits.includes(tokenDigits)) return true;
    return false;
  });
}

/** Filtra la lista de asistentes de un evento según el texto buscado. */
export function filterAttendees(attendees: readonly Attendee[], rawQuery: string): Attendee[] {
  if (!rawQuery || !rawQuery.trim()) {
    return [...attendees];
  }
  return attendees.filter((attendee) => matchesAttendeeSearch(attendee, rawQuery));
}

/**
 * Devuelve las respuestas personalizadas del formulario que coinciden con la búsqueda
 * (útil para resaltar datos como universidad, empresa, etc. en los resultados).
 */
export function getMatchedCustomResponses(
  attendee: Attendee,
  rawQuery: string,
): MatchedCustomResponse[] {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery || !attendee.customResponses) return [];

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const matches: MatchedCustomResponse[] = [];

  for (const [key, rawVal] of Object.entries(attendee.customResponses)) {
    if (rawVal === null || rawVal === undefined || isBooleanLike(rawVal)) continue;

    const valueStr = Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal).trim();
    if (!valueStr) continue;

    const label = formatCustomResponseLabel(key);
    const normalizedEntry = normalizeSearchText(`${label} ${valueStr}`);
    const entryDigits = normalizePhoneDigits(valueStr);

    const matched = tokens.some((token) => {
      if (normalizedEntry.includes(token)) return true;
      const tokenDigits = normalizePhoneDigits(token);
      return tokenDigits.length >= 3 && entryDigits.includes(tokenDigits);
    });

    if (matched) {
      matches.push({ key, label, value: valueStr });
    }
  }

  return matches;
}
