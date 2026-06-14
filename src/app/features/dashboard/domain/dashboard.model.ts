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
  price: number;
  createdAt: Date;
}

export interface RecentRegistration {
  id: string;
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  userInitials: string;
  eventTitle: string;
  role: string;
  status: string;
  createdAt: Date;
}
