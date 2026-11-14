import {
  registrationStatusLabel,
  parseRegistrationStatus,
} from '../../events/domain/registration-status';
import { ScanMode, ScanResult } from './checkin.model';

/** Semáforo de la puerta: verde pasa, ámbar necesita atención, rojo no pasa. */
export type DoorTone = 'go' | 'wait' | 'stop';

export interface DoorState {
  tone: DoorTone;
  /** Ícono de Material Symbols: el color nunca es la única señal. */
  icon: string;
  headline: string;
  /** Qué hacer ahora, en lenguaje claro. */
  action: string;
  /** Solo el registro exitoso se puede deshacer. */
  undoable: boolean;
}

const GO_HEADLINE: Record<ScanMode, string> = {
  checkin: 'Puede pasar',
  refrigerio: 'Entrega su refrigerio',
  session: 'Puede entrar a la sesión',
};

const ALREADY_HEADLINE: Record<ScanMode, string> = {
  checkin: 'Ya ingresó',
  refrigerio: 'Ya recibió su refrigerio',
  session: 'Ya entró a esta sesión',
};

export const MODE_NAMES: Record<ScanMode, string> = {
  checkin: 'Check-in',
  refrigerio: 'Refrigerio',
  session: 'Sesión',
};

function formatTime(date: Date | undefined): string {
  if (!date) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Traduce el resultado de verificar/registrar un QR o una persona al estado de la puerta. */
export function toDoorState(result: ScanResult, mode: ScanMode): DoorState {
  if (result.success) {
    return {
      tone: 'go',
      icon: 'check_circle',
      headline: GO_HEADLINE[mode],
      action: '',
      undoable: !!result.scanLogId,
    };
  }

  switch (result.reason) {
    case 'pending':
      return {
        tone: 'wait',
        icon: 'schedule',
        headline: 'Pago pendiente',
        action: 'Envíalo a la mesa de pagos para confirmar su inscripción.',
        undoable: false,
      };
    case 'already_scanned': {
      const at = formatTime(result.scannedAt);
      return {
        tone: 'wait',
        icon: 'history',
        headline: ALREADY_HEADLINE[mode],
        action: at
          ? `Se registró a las ${at}. Si no es la misma persona, revisa que no sea un QR repetido.`
          : 'Si no es la misma persona, revisa que no sea un QR repetido.',
        undoable: false,
      };
    }
    case 'cancelled':
      return {
        tone: 'stop',
        icon: 'block',
        headline: 'Inscripción anulada',
        action: 'No puede ingresar. Avisa a un organizador.',
        undoable: false,
      };
    case 'other_event':
      return {
        tone: 'stop',
        icon: 'event_busy',
        headline: 'Es de otro evento',
        action: 'Pídele que revise el correo de su inscripción o llévalo a la mesa de ayuda.',
        undoable: false,
      };
    case 'not_found':
    case 'invalid_code':
      return {
        tone: 'stop',
        icon: 'qr_code_scanner',
        headline: 'QR no reconocido',
        action: 'Prueba otra vez o búscalo por nombre en la pestaña Manual.',
        undoable: false,
      };
    case 'session_required':
      return {
        tone: 'wait',
        icon: 'event_seat',
        headline: 'Elige una sesión',
        action: 'Selecciona la sesión en la barra de arriba antes de escanear.',
        undoable: false,
      };
    case 'not_in_session':
      return {
        tone: 'stop',
        icon: 'event_busy',
        headline: 'No está inscrito en esta sesión',
        action: 'Indícale la sesión que le corresponde o llévalo a la mesa de ayuda.',
        undoable: false,
      };
    default:
      return {
        tone: 'stop',
        icon: 'error',
        headline: 'No se pudo registrar',
        action: 'Revisa tu conexión y vuelve a intentarlo.',
        undoable: false,
      };
  }
}

export interface CheckinStats {
  checkedInCount: number;
  refrigerioCount: number;
  totalRegistered: number;
}

/** "N de M ingresaron" (o recibieron refrigerio, según el modo). */
export function counterText(mode: ScanMode, stats: CheckinStats): string {
  const done = mode === 'refrigerio' ? stats.refrigerioCount : stats.checkedInCount;
  const verb = mode === 'refrigerio' ? 'recibieron refrigerio' : 'ingresaron';
  return `${done} de ${stats.totalRegistered} ${verb}`;
}

export interface ManualRowState {
  /** Solo una inscripción confirmada y sin registrar se puede tocar. */
  canRegister: boolean;
  tone: DoorTone | 'done';
  icon: string;
  label: string;
  /** Por qué no puede pasar y qué hacer; vacío cuando sí puede. */
  hint: string;
}

/** Estado de cada fila en la búsqueda manual, visible antes de tocarla. */
export function manualRowState(
  status: string,
  alreadyScanned: boolean,
  mode: ScanMode,
): ManualRowState {
  const parsed = parseRegistrationStatus(status);
  if (parsed === 'CANCELLED') {
    return {
      canRegister: false,
      tone: 'stop',
      icon: 'block',
      label: registrationStatusLabel(parsed),
      hint: 'No puede ingresar. Avisa a un organizador.',
    };
  }
  if (parsed !== 'CONFIRMED') {
    return {
      canRegister: false,
      tone: 'wait',
      icon: 'schedule',
      label: parsed ? registrationStatusLabel(parsed) : 'Sin confirmar',
      hint: 'Envíalo a la mesa de pagos para confirmar su inscripción.',
    };
  }
  if (alreadyScanned) {
    return {
      canRegister: false,
      tone: 'done',
      icon: 'task_alt',
      label: ALREADY_HEADLINE[mode],
      hint: '',
    };
  }
  return { canRegister: true, tone: 'go', icon: 'login', label: 'Registrar', hint: '' };
}
