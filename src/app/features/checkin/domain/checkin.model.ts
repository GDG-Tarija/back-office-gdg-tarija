export type ScanMode = 'checkin' | 'refrigerio' | 'session';
export type CheckinEntryMode = 'qr' | 'manual';

export interface Session {
  id: string;
  eventId: string;
  title: string;
  capacity: number;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  speaker?: string | null;
  displayLabel?: string;
}

/** Por qué no se pudo registrar: la puerta decide el color y la indicación según esto. */
export type ScanFailureReason =
  | 'invalid_code'
  | 'not_found'
  | 'other_event'
  | 'pending'
  | 'cancelled'
  | 'already_scanned'
  | 'session_required'
  | 'not_in_session'
  | 'error';

export interface ScanResult {
  success: boolean;
  message: string;
  reason?: ScanFailureReason;
  alreadyScanned?: boolean;
  scannedAt?: Date;
  attendee?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    role: string;
    ticketName: string;
  };
  scanTypeLabel?: string;
  scannedCode?: string;
  registrationDbId?: string;
  /** Fila de `scan_logs` creada; sirve para deshacer durante unos segundos. */
  scanLogId?: string;
  userId?: string | null;
}

export interface UndoScanInput {
  scanLogId: string;
  mode: ScanMode;
  sessionId: string | null;
  userId: string | null;
}

export interface UndoScanResult {
  ok: boolean;
  message: string;
}
