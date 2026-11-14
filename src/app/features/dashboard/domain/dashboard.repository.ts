import { DashboardEvent, DashboardRegistration } from './dashboard.model';

export abstract class DashboardRepository {
  abstract getEvents(): Promise<DashboardEvent[]>;
  abstract getRegistrations(): Promise<DashboardRegistration[]>;
}
