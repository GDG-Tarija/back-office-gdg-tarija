export interface DashboardEvent {
  id: string;
  title: string;
  eventType: string;
  capacity: number;
  dateStart: Date;
  dateEnd: Date | null;
  isPublished: boolean;
  category: string | null;
}

export interface DashboardRegistration {
  id: string;
  eventId: string;
  role: string;
  status: string;
  /** Monto real de la inscripción (fase y cupón aplicados). */
  amountDue: number;
  hasProof: boolean;
  createdAt: Date;
}
