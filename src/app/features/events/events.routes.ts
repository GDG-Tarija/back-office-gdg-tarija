import { Routes } from '@angular/router';

import { superadminGuard } from '../../core/auth/guards/superadmin.guard';

export const EVENTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Eventos',
    loadComponent: () =>
      import('./presentation/pages/events-page/events-page').then((m) => m.EventsPage),
  },
  {
    path: 'new',
    title: 'Nuevo evento',
    canActivate: [superadminGuard],
    loadComponent: () =>
      import('./presentation/pages/event-wizard-page/event-wizard-page').then(
        (m) => m.EventWizardPage,
      ),
  },
  {
    path: ':id/edit',
    title: 'Editar evento',
    canActivate: [superadminGuard],
    loadComponent: () =>
      import('./presentation/pages/event-manage-page/event-manage-page').then(
        (m) => m.EventManagePage,
      ),
  },
  {
    path: ':id/attendees',
    title: 'Asistentes',
    loadComponent: () =>
      import('./presentation/pages/attendees-page/attendees-page').then((m) => m.AttendeesPage),
  },
];
