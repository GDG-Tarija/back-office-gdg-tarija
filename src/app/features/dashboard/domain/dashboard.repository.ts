import { DashboardEvent, DashboardRegistration, RecentRegistration } from './dashboard.model';

export abstract class DashboardRepository {
  abstract getEvents(): Promise<DashboardEvent[]>;
  abstract getRegistrations(): Promise<DashboardRegistration[]>;
  abstract getRecentRegistrations(limit: number): Promise<RecentRegistration[]>;
}
