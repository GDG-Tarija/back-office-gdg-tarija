import { Routes } from '@angular/router';

export const EVENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./presentation/pages/events-page/events-page').then((m) => m.EventsPage),
  },
  {
    path: ':id/attendees',
    loadComponent: () =>
      import('./presentation/pages/attendees-page/attendees-page').then((m) => m.AttendeesPage),
  },
];
