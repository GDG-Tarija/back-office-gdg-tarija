import { Routes } from '@angular/router';

import { superadminGuard } from '../../core/auth/guards/superadmin.guard';

export const EVENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./presentation/pages/events-page/events-page').then((m) => m.EventsPage),
  },
  {
    path: 'new',
    canActivate: [superadminGuard],
    loadComponent: () =>
      import('./presentation/pages/event-wizard-page/event-wizard-page').then(
        (m) => m.EventWizardPage,
      ),
  },
  {
    path: ':id/edit',
    canActivate: [superadminGuard],
    loadComponent: () =>
      import('./presentation/pages/event-manage-page/event-manage-page').then(
        (m) => m.EventManagePage,
      ),
  },
  {
    path: ':id/attendees',
    loadComponent: () =>
      import('./presentation/pages/attendees-page/attendees-page').then((m) => m.AttendeesPage),
  },
];
