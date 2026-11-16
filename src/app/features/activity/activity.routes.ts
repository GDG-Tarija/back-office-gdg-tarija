import { Routes } from '@angular/router';

import { superadminGuard } from '../../core/auth/guards/superadmin.guard';

export const ACTIVITY_ROUTES: Routes = [
  {
    path: '',
    title: 'Actividad',
    canActivate: [superadminGuard],
    loadComponent: () =>
      import('./presentation/pages/activity-page/activity-page').then((m) => m.ActivityPage),
  },
];
