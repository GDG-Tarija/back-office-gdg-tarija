import { Routes } from '@angular/router';

export const CHECKIN_ROUTES: Routes = [
  {
    path: '',
    title: 'Check-in',
    loadComponent: () => import('./pages/checkin-page/checkin-page').then((m) => m.CheckinPage),
  },
];
