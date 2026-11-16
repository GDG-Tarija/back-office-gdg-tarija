import { Routes } from '@angular/router';

import { superadminGuard } from '../../core/auth/guards/superadmin.guard';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    title: 'Usuarios',
    canActivate: [superadminGuard],
    loadComponent: () =>
      import('./presentation/pages/users-page/users-page').then((m) => m.UsersPage),
  },
];
