import { Routes } from '@angular/router';

import { authGuard } from './core/auth/guards/auth.guard';
import { homeGuard } from './core/auth/guards/home.guard';
import { loginGuard } from './core/auth/guards/login.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'auth',
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: 'login',
        title: 'Iniciar sesión',
        canActivate: [loginGuard],
        loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
      },
    ],
  },
  {
    path: 'auth/callback',
    title: 'Iniciando sesión',
    loadComponent: () => import('./features/auth/callback/callback').then((m) => m.Callback),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: 'dashboard',
        title: 'Inicio',
        canActivate: [homeGuard],
        loadComponent: () =>
          import('./features/dashboard/presentation/pages/dashboard-page/dashboard').then(
            (m) => m.Dashboard,
          ),
      },
      {
        path: 'events',
        loadChildren: () => import('./features/events/events.routes').then((m) => m.EVENTS_ROUTES),
      },
      {
        path: 'checkin',
        loadChildren: () =>
          import('./features/checkin/presentation/checkin.routes').then((m) => m.CHECKIN_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
