import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';

import { BackofficeRole } from '../../models/role.model';
import { REDIRECT_KEY } from '../redirect';
import { RoleLookupError } from '../role-lookup-error';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';
import { loginGuard } from './login.guard';

describe('guards de acceso', () => {
  const role = signal<BackofficeRole | null>(null);
  const getSession = vi.fn();
  const resolveRole = vi.fn<() => Promise<BackofficeRole | null>>();
  const denyAccess = vi.fn();
  const navigateByUrl = vi.fn();
  const tree = {};
  const createUrlTree = vi.fn(() => tree);

  beforeEach(() => {
    sessionStorage.clear();
    role.set(null);
    [getSession, resolveRole, denyAccess, navigateByUrl, createUrlTree].forEach((m) =>
      m.mockReset(),
    );
    createUrlTree.mockReturnValue(tree);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { role, getSession, resolveRole, denyAccess } },
        { provide: Router, useValue: { navigateByUrl, createUrlTree } },
      ],
    });
  });

  const runAuth = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  describe('authGuard', () => {
    it('sin sesión guarda la URL pedida y envía al login', async () => {
      getSession.mockResolvedValue(null);
      expect(await runAuth('/events/e1/attendees?q=ana')).toBe(false);
      expect(sessionStorage.getItem(REDIRECT_KEY)).toBe('/events/e1/attendees?q=ana');
      expect(navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });

    it('con sesión y rol deja pasar sin tocar la URL guardada', async () => {
      getSession.mockResolvedValue({ user: { email: 'a@b.com' } });
      resolveRole.mockResolvedValue('STAFF');
      expect(await runAuth('/checkin')).toBe(true);
      expect(role()).toBe('STAFF');
      expect(sessionStorage.getItem(REDIRECT_KEY)).toBeNull();
    });

    it('con sesión sin rol niega el acceso con el correo', async () => {
      getSession.mockResolvedValue({ user: { email: 'a@b.com' } });
      resolveRole.mockResolvedValue(null);
      expect(await runAuth('/events')).toBe(false);
      expect(denyAccess).toHaveBeenCalledWith('a@b.com');
    });
  });

  describe('authGuard con error al leer el rol', () => {
    it('no cierra la sesión: guarda la URL y envía a la pantalla de reintento', async () => {
      getSession.mockResolvedValue({ user: { email: 'a@b.com' } });
      resolveRole.mockRejectedValue(new RoleLookupError());

      expect(await runAuth('/checkin')).toBe(tree);

      expect(denyAccess).not.toHaveBeenCalled();
      expect(createUrlTree).toHaveBeenCalledWith(['/auth/verificar']);
      expect(sessionStorage.getItem(REDIRECT_KEY)).toBe('/checkin');
    });
  });

  describe('loginGuard', () => {
    const runLogin = () =>
      TestBed.runInInjectionContext(() =>
        loginGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );

    it('con sesión redirige al inicio', async () => {
      getSession.mockResolvedValue({ user: {} });
      expect(await runLogin()).toBe(tree);
      expect(createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    });

    it('sin sesión deja ver el login', async () => {
      getSession.mockResolvedValue(null);
      expect(await runLogin()).toBe(true);
    });
  });
});
