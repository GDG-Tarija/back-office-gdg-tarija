import { registrationStatusLabel } from '../../events/domain/registration-status';
import { roleOption } from '../../users/domain/user-rules';
import { AuditCategory, AuditEntry } from './audit-entry.model';

export const AUDIT_CATEGORY_OPTIONS: readonly { value: AuditCategory; label: string }[] = [
  { value: 'REGISTRATIONS', label: 'Inscripciones' },
  { value: 'CHECKIN', label: 'Check-in' },
  { value: 'CONFIG', label: 'Configuración de eventos' },
  { value: 'ACCESS', label: 'Accesos' },
];

export type AuditTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface AuditDescription {
  icon: string;
  tone: AuditTone;
  /** Frase en español sin el actor: "Confirmó el pago de Ana Paz". */
  text: string;
}

/** Quién actuó: el back-office, la persona desde la web, o el sistema (consola/migración). */
export type ActorKind = 'backoffice' | 'web' | 'system';

export function actorKind(e: Pick<AuditEntry, 'actorId' | 'actorRole'>): ActorKind {
  if (!e.actorId) return 'system';
  return e.actorRole ? 'backoffice' : 'web';
}

export function actorLabel(e: Pick<AuditEntry, 'actorId' | 'actorName' | 'actorEmail'>): string {
  if (!e.actorId) return 'Sistema';
  return e.actorName || e.actorEmail || 'Alguien';
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  slug: 'Enlace',
  description: 'Descripción',
  capacity: 'Capacidad',
  date_start: 'Inicio',
  date_end: 'Fin',
  is_published: 'Publicado',
  location_name: 'Lugar',
  location_type: 'Modalidad',
  address_link: 'Mapa',
  image_url: 'Portada',
  banner_url: 'Banner',
  event_type: 'Tipo',
  category: 'Categoría',
  extra_info: 'Formulario de registro',
  name: 'Nombre',
  price: 'Precio',
  ticket_capacity: 'Cupo',
  payment_qr_url: 'QR de pago',
  image: 'Imagen',
  position: 'Posición',
  code: 'Código',
  role: 'Rol',
  max_uses: 'Usos máximos',
  nombre: 'Nombre',
  descripcion: 'Descripción',
  start_time: 'Hora de inicio',
  end_time: 'Hora de fin',
  speaker: 'Ponente',
  track_id: 'Track',
  status: 'Estado',
  event_role: 'Rol en el evento',
  payment_proof_url: 'Comprobante',
  custom_responses: 'Respuestas',
  coupon_id: 'Cupón',
  ticket_type_id: 'Paquete',
  ticket_phase_id: 'Fase',
  email: 'Correo',
  staff_email: 'Correo',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ');
}

/** Campos que cambiaron en un UPDATE: `{campo: [antes, después]}`. */
function updatedFields(e: AuditEntry): string[] {
  if (e.action !== 'UPDATE') return [];
  return Object.keys(e.changes).filter((k) => Array.isArray(e.changes[k]));
}

function updated(e: AuditEntry, field: string): [unknown, unknown] | null {
  const value = e.changes[field];
  return e.action === 'UPDATE' && Array.isArray(value) && value.length === 2
    ? [value[0], value[1]]
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function scanKind(e: AuditEntry): 'checkin' | 'refrigerio' | 'session' {
  const type = str(e.changes['scan_type']);
  if (type === 'refrigerio') return 'refrigerio';
  if (type.startsWith('session')) return 'session';
  return 'checkin';
}

const CONFIG_NOUNS: Record<string, { noun: string; icon: string }> = {
  events: { noun: 'el evento', icon: 'calendar_month' },
  ticket_types: { noun: 'el paquete', icon: 'confirmation_number' },
  ticket_phases: { noun: 'la fase', icon: 'sell' },
  event_coupons: { noun: 'el cupón', icon: 'local_offer' },
  tracks: { noun: 'el track', icon: 'route' },
  sessions: { noun: 'la sesión', icon: 'event_note' },
};

export function describeAudit(e: AuditEntry): AuditDescription {
  const who = e.subjectName || 'una persona';
  const web = actorKind(e) === 'web';

  switch (e.table) {
    case 'registrations': {
      if (e.action === 'INSERT') {
        return web || e.source === 'backfill'
          ? { icon: 'how_to_reg', tone: 'info', text: 'Se inscribió' }
          : { icon: 'how_to_reg', tone: 'info', text: `Inscribió a ${who}` };
      }
      if (e.action === 'DELETE') {
        return { icon: 'delete', tone: 'danger', text: `Eliminó la inscripción de ${who}` };
      }
      const status = updated(e, 'status');
      if (status) {
        const [before, after] = status;
        if (after === 'CANCELLED') {
          return { icon: 'block', tone: 'danger', text: `Anuló la inscripción de ${who}` };
        }
        if (before === 'CANCELLED') {
          return {
            icon: 'restore',
            tone: 'info',
            text: `Restauró la inscripción de ${who} como ${registrationStatusLabel(after).toLowerCase()}`,
          };
        }
        if (after === 'CONFIRMED') {
          return { icon: 'paid', tone: 'success', text: `Confirmó el pago de ${who}` };
        }
        return {
          icon: 'undo',
          tone: 'warning',
          text: `Desestimó el pago de ${who}: vuelve a pendiente de pago`,
        };
      }
      if (web && updated(e, 'payment_proof_url')) {
        return { icon: 'receipt_long', tone: 'info', text: 'Subió su comprobante de pago' };
      }
      return { icon: 'edit', tone: 'neutral', text: `Editó la inscripción de ${who}` };
    }

    case 'scan_logs': {
      const undo = e.action === 'DELETE';
      switch (scanKind(e)) {
        case 'refrigerio':
          return undo
            ? { icon: 'undo', tone: 'warning', text: `Deshizo la entrega de refrigerio a ${who}` }
            : { icon: 'lunch_dining', tone: 'success', text: `Entregó el refrigerio a ${who}` };
        case 'session':
          return undo
            ? { icon: 'undo', tone: 'warning', text: `Deshizo el ingreso de ${who} a una sesión` }
            : {
                icon: 'co_present',
                tone: 'success',
                text: `Registró el ingreso de ${who} a una sesión`,
              };
        default:
          return undo
            ? { icon: 'undo', tone: 'warning', text: `Deshizo el check-in de ${who}` }
            : { icon: 'qr_code_scanner', tone: 'success', text: `Hizo el check-in de ${who}` };
      }
    }

    case 'session_registrations':
      if (e.action === 'DELETE') {
        return {
          icon: 'event_busy',
          tone: 'neutral',
          text: web ? 'Quitó una sesión de su agenda' : `Quitó a ${who} de una sesión`,
        };
      }
      return {
        icon: 'event_note',
        tone: 'info',
        text: web ? 'Eligió una sesión' : `Inscribió a ${who} en una sesión`,
      };

    case 'staff_whitelist': {
      if (e.action === 'INSERT') {
        const role = str(e.changes['role']) === 'SUPERADMIN' ? 'SUPERADMIN' : 'STAFF';
        return {
          icon: 'person_add',
          tone: 'success',
          text: `Dio acceso a ${who} como ${roleOption(role).label}`,
        };
      }
      if (e.action === 'DELETE') {
        return { icon: 'person_remove', tone: 'danger', text: `Quitó el acceso a ${who}` };
      }
      const role = updated(e, 'role');
      return role
        ? {
            icon: 'manage_accounts',
            tone: 'info',
            text: `Cambió el rol de ${who} a ${roleOption(role[1] === 'SUPERADMIN' ? 'SUPERADMIN' : 'STAFF').label}`,
          }
        : { icon: 'manage_accounts', tone: 'neutral', text: `Editó el acceso de ${who}` };
    }

    case 'event_staff_assignments':
      return e.action === 'DELETE'
        ? { icon: 'person_remove', tone: 'warning', text: `Quitó a ${who} del staff del evento` }
        : { icon: 'badge', tone: 'info', text: `Asignó a ${who} al staff del evento` };
  }

  const config = CONFIG_NOUNS[e.table];
  if (config) {
    const name = e.subjectName ? ` ${e.subjectName}` : '';
    if (e.action === 'INSERT') {
      return { icon: config.icon, tone: 'info', text: `Creó ${config.noun}${name}` };
    }
    if (e.action === 'DELETE') {
      return { icon: 'delete', tone: 'danger', text: `Eliminó ${config.noun}${name}` };
    }
    const published = e.table === 'events' ? updated(e, 'is_published') : null;
    if (published && updatedFields(e).length === 1) {
      return published[1] === true
        ? { icon: 'publish', tone: 'success', text: `Publicó el evento${name}` }
        : { icon: 'unpublished', tone: 'warning', text: `Despublicó el evento${name}` };
    }
    const fields = updatedFields(e).map(fieldLabel).join(', ');
    return {
      icon: 'edit',
      tone: 'neutral',
      text: `Editó ${config.noun}${name}${fields ? ` (${fields})` : ''}`,
    };
  }

  return { icon: 'history', tone: 'neutral', text: `Cambió ${e.table}` };
}

export interface ChangeLine {
  field: string;
  label: string;
  before: string;
  after: string;
}

const LONG_TEXT = 80;

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (field === 'status') return registrationStatusLabel(value);
  if (field === 'role' && (value === 'SUPERADMIN' || value === 'STAFF')) {
    return roleOption(value).label;
  }
  if (typeof value === 'object') return 'cambió';
  const text = String(value);
  return text.length > LONG_TEXT ? `${text.slice(0, LONG_TEXT - 1)}…` : text;
}

/** Antes → después de cada campo de un UPDATE, listo para mostrar. Vacío en altas y bajas. */
export function changeLines(e: AuditEntry): ChangeLine[] {
  return updatedFields(e).map((field) => {
    const [before, after] = updated(e, field) ?? [null, null];
    return {
      field,
      label: fieldLabel(field),
      before: formatValue(field, before),
      after: formatValue(field, after),
    };
  });
}
