export interface CredentialPosition {
  nameX: number;
  nameY: number;
  roleX: number;
  roleY: number;
  qrX: number;
  qrY: number;
  qrSize: number;
  fontSize: number;
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
}

export interface Attendee {
  id: string;
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
}
