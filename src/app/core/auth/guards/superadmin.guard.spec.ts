import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

import { BackofficeRole } from '../../models/role.model';
import { AuthService } from '../services/auth.service';
import { superadminGuard } from './superadmin.guard';

describe('superadminGuard', () => {
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
      superadminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  it('permite SUPERADMIN ya cargado sin consultar el RPC', async () => {
    role.set('SUPERADMIN');
    expect(await run()).toBe(true);
    expect(resolveRole).not.toHaveBeenCalled();
  });

  it('resuelve el rol si el signal está vacío', async () => {
    resolveRole.mockResolvedValue('SUPERADMIN');
    expect(await run()).toBe(true);
    expect(role()).toBe('SUPERADMIN');
  });

  it('redirige a /events para STAFF', async () => {
    role.set('STAFF');
    expect(await run()).toBe(tree);
    expect(createUrlTree).toHaveBeenCalledWith(['/events'], { queryParams: { forbidden: '1' } });
  });

  it('redirige si no hay rol', async () => {
    resolveRole.mockResolvedValue(null);
    expect(await run()).toBe(tree);
  });
});
