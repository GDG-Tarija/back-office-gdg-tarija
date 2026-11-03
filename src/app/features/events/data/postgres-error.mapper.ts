import { DomainError } from '../domain/domain-error';

export type ErrorContext =
  | 'event'
  | 'ticket_type'
  | 'track'
  | 'session'
  | 'coupon'
  | 'staff'
  | 'asset';

export interface PostgresLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

const DUPLICATE_MESSAGES: Record<ErrorContext, { message: string; field?: string }> = {
  event: { message: 'Ya existe un evento con ese slug.', field: 'slug' },
  ticket_type: { message: 'Ya existe un paquete con ese nombre en el evento.', field: 'name' },
  track: { message: 'Ya existe un track con ese nombre en el evento.', field: 'name' },
  session: { message: 'Ya existe una sesión con ese horario.', field: 'startTime' },
  coupon: { message: 'Ya existe un cupón con ese código en el evento.', field: 'code' },
  staff: { message: 'Ese correo ya está asignado al evento.', field: 'staffEmail' },
  asset: { message: 'Ya existe un archivo con ese nombre.' },
};

const REGISTRATIONS_MESSAGES: Record<ErrorContext, string> = {
  event: 'No se puede eliminar un evento con inscritos. Despublícalo en su lugar.',
  ticket_type: 'No se puede eliminar un paquete con inscritos.',
  track: 'No se puede eliminar el track porque tiene elementos asociados.',
  session: 'No se puede eliminar una sesión con inscritos.',
  coupon: 'No se puede eliminar un cupón que ya fue utilizado.',
  staff: 'No se puede eliminar la asignación porque tiene elementos asociados.',
  asset: 'No se puede eliminar el archivo.',
};

/** Traduce errores de Postgres/PostgREST/Storage a un DomainError legible. */
export function toDomainError(error: PostgresLikeError, context: ErrorContext): DomainError {
  switch (error.code) {
    case '23505': {
      const d = DUPLICATE_MESSAGES[context];
      return new DomainError(d.message, 'DUPLICATE', d.field);
    }
    case '23001': // restrict_violation
    case '23503': // foreign_key_violation
      return new DomainError(REGISTRATIONS_MESSAGES[context], 'HAS_REGISTRATIONS');
    case '42501':
      return new DomainError('No tienes permisos para realizar esta acción.', 'FORBIDDEN');
    default:
      return new DomainError(
        error.message?.trim() || 'Ocurrió un error inesperado. Inténtalo de nuevo.',
        'UNKNOWN',
      );
  }
}
