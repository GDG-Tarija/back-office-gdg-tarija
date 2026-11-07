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

export interface ScanResult {
  success: boolean;
  message: string;
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
  userId?: string | null;
}
