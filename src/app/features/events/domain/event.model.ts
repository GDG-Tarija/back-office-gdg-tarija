import { FormField } from './form-field.model';

export interface CredentialPosition {
  nameX: number;
  nameY: number;
  roleX: number;
  roleY: number;
  qrX: number;
  qrY: number;
  qrSize: number;
  fontSize: number;
  showRole?: boolean;
  nameMaxWidth?: number;
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  eventType: string;
  capacity: number;
  dateStart: Date;
  dateEnd: Date | null;
  isPublished: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  description: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  locationType: string | null;
  locationName: string | null;
  addressLink: string | null;
  category: string | null;
  extraInfo: Record<string, unknown> | null;
  /** Formulario de registro (extra_info.form_fields). */
  formFields: FormField[];
}

export type LocationType = 'PHYSICAL' | 'VIRTUAL' | 'HYBRID';
export type EventType = 'MEETUP' | 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP';

export const EVENT_TYPES: readonly EventType[] = ['MEETUP', 'CONFERENCE', 'HACKATHON', 'WORKSHOP'];
export const LOCATION_TYPES: readonly LocationType[] = ['PHYSICAL', 'VIRTUAL', 'HYBRID'];

/** Datos editables de un evento (crear/actualizar). */
export interface EventInput {
  title: string;
  slug: string;
  eventType: string;
  category: string | null;
  locationType: string | null;
  locationName: string | null;
  addressLink: string | null;
  dateStart: Date | null;
  dateEnd: Date | null;
  capacity: number | null;
  description: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  formFields: FormField[];
}

export interface AttendeeSessionItem {
  sessionId: string;
  sessionTitle: string;
  speaker: string | null;
  startTime: string | null;
  endTime: string | null;
  asistio: boolean;
  checkedInAt: Date | null;
}

export interface Attendee {
  id: string;
  userId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  role: string;
  status: string;
  ticketName: string;
  ticketPrice: number;
  registeredAt: Date | null;
  customResponses: Record<string, unknown> | null;
  paymentProofUrl: string | null;
  checkedIn: boolean;
  checkedInAt?: Date | null;
  refrigerioDelivered?: boolean;
  refrigerioDeliveredAt?: Date | null;
}
