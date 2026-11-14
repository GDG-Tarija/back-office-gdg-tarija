import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { BackofficeRole } from '../../models/role.model';
import { RoleLookupError } from '../role-lookup-error';
import { AuthService } from '../services/auth.service';
import { homeGuard } from './home.guard';

describe('homeGuard', () => {
  const role = signal<BackofficeRole | null>(null);
  const resolveRole = vi.fn<() => Promise<BackofficeRole | null>>();
  const tree = {} as UrlTree;
  const createUrlTree = vi.fn(() => tree);

  beforeEach(() => {
    role.set(null);
    resolveRole.mockReset();
    createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { role, resolveRole } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      homeGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  it('deja pasar a SUPERADMIN', async () => {
    role.set('SUPERADMIN');
    expect(await run()).toBe(true);
  });

  it('envía a STAFF a /checkin', async () => {
    role.set('STAFF');
    expect(await run()).toBe(tree);
    expect(createUrlTree).toHaveBeenCalledWith(['/checkin']);
  });

  it('resuelve el rol si aún no está cargado', async () => {
    resolveRole.mockResolvedValue('STAFF');
    expect(await run()).toBe(tree);
    expect(role()).toBe('STAFF');
  });

  it('si no puede leer el rol envía al reintento, no a /checkin', async () => {
    resolveRole.mockRejectedValue(new RoleLookupError());
    expect(await run()).toBe(tree);
    expect(createUrlTree).toHaveBeenCalledWith(['/auth/verificar']);
  });
});
