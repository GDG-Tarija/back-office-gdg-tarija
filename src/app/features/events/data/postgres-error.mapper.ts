import { DomainError } from '../domain/domain-error';

export type ErrorContext =
  | 'event'
  | 'ticket_type'
  | 'ticket_phase'
  | 'track'
  | 'session'
  | 'coupon'
  | 'staff'
  | 'asset'
  | 'registration';

export interface PostgresLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  name?: string | null;
  status?: number | string | null;
  statusCode?: number | string | null;
}

const DUPLICATE_MESSAGES: Record<ErrorContext, { message: string; field?: string }> = {
  event: { message: 'Ya existe un evento con ese slug.', field: 'slug' },
  ticket_type: { message: 'Ya existe un paquete con ese nombre en el evento.', field: 'name' },
  ticket_phase: {
    message: 'Ya existe una fase en esa posición. Recarga la página e inténtalo de nuevo.',
  },
  track: { message: 'Ya existe un track con ese nombre en el evento.', field: 'name' },
  session: { message: 'Ya existe una sesión con ese horario.', field: 'startTime' },
  coupon: { message: 'Ya existe un cupón con ese código en el evento.', field: 'code' },
  staff: { message: 'Ese correo ya está asignado al evento.', field: 'staffEmail' },
  asset: { message: 'Ya existe un archivo con ese nombre.' },
  registration: { message: 'Esa persona ya tiene una inscripción en el evento.' },
};

const REGISTRATIONS_MESSAGES: Record<ErrorContext, string> = {
  event: 'No se puede eliminar un evento con inscritos. Despublícalo en su lugar.',
  ticket_type: 'No se puede eliminar un paquete con inscritos.',
  ticket_phase: 'No se puede eliminar una fase con inscripciones.',
  track: 'No se puede eliminar el track porque tiene elementos asociados.',
  session: 'No se puede eliminar una sesión con inscritos.',
  coupon: 'No se puede eliminar un cupón que ya fue utilizado.',
  staff: 'No se puede eliminar la asignación porque tiene elementos asociados.',
  asset: 'No se puede eliminar el archivo.',
  registration: 'La inscripción tiene elementos asociados y no se puede modificar así.',
};

export const GENERIC_ERROR_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';
export const NETWORK_ERROR_MESSAGE =
  'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';

const NETWORK_PATTERN =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;

/** Mensajes de Storage: no traen `code` de Postgres, se reconocen por estado o texto. */
function storageMessage(error: PostgresLikeError): string | null {
  const status = Number(error.statusCode ?? error.status);
  const text = `${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (status === 413 || /maximum allowed size|payload too large|too large/.test(text)) {
    return 'El archivo es demasiado grande. Elige uno más liviano.';
  }
  if (/mime type|not supported|invalid mime/.test(text)) {
    return 'Ese tipo de archivo no está permitido. Usa JPG, PNG o WebP.';
  }
  if (status === 409 || /already exists|duplicate/.test(text)) {
    return 'Ya existe un archivo con ese nombre. Inténtalo de nuevo.';
  }
  if (status === 401 || status === 403 || /row-level security|unauthorized/.test(text)) {
    return 'No tienes permisos para subir o eliminar archivos.';
  }
  if (status === 404 || /object not found|bucket not found/.test(text)) {
    return 'No se encontró el archivo.';
  }
  return null;
}

function isNetworkError(error: PostgresLikeError): boolean {
  return NETWORK_PATTERN.test(error.message ?? '') || error.name === 'AuthRetryableFetchError';
}

/** Traduce errores de Postgres/PostgREST/Storage/red a un DomainError en español. */
export function toDomainError(error: PostgresLikeError, context: ErrorContext): DomainError {
  const code = error.code ?? '';
  switch (code) {
    case '23505': {
      const d = DUPLICATE_MESSAGES[context];
      return new DomainError(d.message, 'DUPLICATE', d.field);
    }
    case 'P0010': // cupo agotado (fases o paquete llenos)
      return new DomainError(
        error.message?.trim() || 'El cupo de este paquete de entrada está agotado.',
        'SOLD_OUT',
      );
    case 'P0011': // fase ajena al paquete
      return new DomainError(
        error.message?.trim() || 'La fase indicada no pertenece al paquete de entrada.',
        'INVALID',
      );
    case '23001': // restrict_violation
      // Los triggers de ticket_phases explican el motivo (baja de cupo, fase con ventas).
      if (context === 'ticket_phase' && error.message?.trim()) {
        return new DomainError(error.message.trim(), 'HAS_REGISTRATIONS');
      }
      return new DomainError(REGISTRATIONS_MESSAGES[context], 'HAS_REGISTRATIONS');
    case '23503': {
      // "update or delete on table … violates" = otro registro depende de este;
      // "insert or update on table … violates" = este apunta a algo que ya no existe.
      const blocksDelete = /update or delete on table/i.test(error.message ?? '');
      const blocksSave = /insert or update on table/i.test(error.message ?? '');
      if (blocksSave && !blocksDelete) {
        return new DomainError(
          'Un dato relacionado ya no existe (puede haberlo eliminado otra persona). Recarga la página e inténtalo de nuevo.',
          'REFERENCED',
        );
      }
      return new DomainError(REGISTRATIONS_MESSAGES[context], 'HAS_REGISTRATIONS');
    }
    case '23502':
      return new DomainError('Falta un dato obligatorio. Revisa el formulario.', 'INVALID');
    case '23514':
      return new DomainError(
        'Un valor está fuera del rango permitido. Revisa el formulario.',
        'INVALID',
      );
    case '22P02':
    case '22007':
    case '22008':
      return new DomainError(
        'Un valor tiene un formato no válido. Revisa el formulario.',
        'INVALID',
      );
    case '22001':
      return new DomainError(
        'Un texto es demasiado largo. Acórtalo e inténtalo de nuevo.',
        'INVALID',
      );
    case '42501':
      return new DomainError('No tienes permisos para realizar esta acción.', 'FORBIDDEN');
    case 'PGRST116':
      return new DomainError(
        'No se encontró el registro. Puede que lo hayan eliminado; recarga la página.',
        'NOT_FOUND',
      );
    case 'PGRST301':
    case 'PGRST303':
      return new DomainError('Tu sesión venció. Vuelve a iniciar sesión.', 'FORBIDDEN');
  }
  if (code.startsWith('PGRST')) {
    return new DomainError(
      'El servidor no pudo procesar la solicitud. Inténtalo de nuevo en un momento.',
      'UNKNOWN',
    );
  }
  if (isNetworkError(error)) return new DomainError(NETWORK_ERROR_MESSAGE, 'NETWORK');
  if (context === 'asset') {
    const storage = storageMessage(error);
    if (storage) return new DomainError(storage, 'INVALID');
  }
  return new DomainError(GENERIC_ERROR_MESSAGE, 'UNKNOWN');
}

/**
 * Mensaje en español para mostrar en la UI. Nunca expone `error.message` crudo:
 * lo desconocido cae al `fallback` de la acción ("No se pudo guardar el paquete.").
 */
export function toUserMessage(
  error: unknown,
  fallback: string,
  context: ErrorContext = 'event',
): string {
  if (error instanceof DomainError) {
    return error.code === 'UNKNOWN' ? fallback : error.message;
  }
  if (error && typeof error === 'object') {
    const mapped = toDomainError(error as PostgresLikeError, context);
    return mapped.code === 'UNKNOWN' ? fallback : mapped.message;
  }
  return fallback;
}

/** Campo del formulario al que apunta el error del servidor, si el mapper lo sabe. */
export function errorField(error: unknown): string | null {
  return error instanceof DomainError && error.field ? error.field : null;
}
