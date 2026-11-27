/**
 * Actividad del sorteo con su QR. Los asistentes escanean el QR (impreso en una mesa, proyectado
 * o enviado como link) y suman 1 ticket, una sola vez por persona.
 */
export interface RaffleQr {
  activityId: string;
  name: string;
  /** Código que lleva el QR. Null: la actividad no tiene QR y solo la da el staff al escanear a la persona. */
  code: string | null;
  /** Apagado: el QR deja de sumar, pero los tickets que ya dio se conservan. */
  active: boolean;
}

export const RAFFLE_QR_NAME_MAX = 80;

/** Error del nombre para mostrar en el formulario, o null si es válido. */
export function raffleQrNameError(name: string, otherNames: string[]): string | null {
  const value = name.trim();
  if (!value) return 'Escribe un nombre.';
  if (value.length > RAFFLE_QR_NAME_MAX) return `Máximo ${RAFFLE_QR_NAME_MAX} caracteres.`;
  if (otherNames.includes(value)) return 'Ya existe un QR con ese nombre en el evento.';
  return null;
}
