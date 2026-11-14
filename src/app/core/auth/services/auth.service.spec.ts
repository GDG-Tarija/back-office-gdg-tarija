import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleLookupError } from '../role-lookup-error';
import { SUPABASE } from '../../supabase/supabase.client';

describe('AuthService Whitelist', () => {
  let service: AuthService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSupabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRouter: any;

  beforeEach(() => {
    mockSupabase = {
      auth: {
        onAuthStateChange: vi.fn(),
        getSession: vi.fn(),
        signOut: vi.fn(),
        signInWithOAuth: vi.fn(),
      },
      rpc: vi.fn(),
    };

    mockRouter = {
      navigateByUrl: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SUPABASE, useValue: mockSupabase },
        { provide: Router, useValue: mockRouter },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should resolve the role from the get_my_role RPC', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 'SUPERADMIN', error: null });

    const role = await service.resolveRole();

    expect(role).toBe('SUPERADMIN');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_my_role');
  });

  it('should resolve null when the user has no role assigned', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const role = await service.resolveRole();

    expect(role).toBeNull();
  });

  it('lanza RoleLookupError cuando la RPC devuelve error (red/servidor), sin tratarlo como sin rol', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    await expect(service.resolveRole()).rejects.toBeInstanceOf(RoleLookupError);
    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('lanza RoleLookupError cuando la RPC rechaza la promesa', async () => {
    mockSupabase.rpc.mockRejectedValue(new TypeError('network'));

    await expect(service.resolveRole()).rejects.toBeInstanceOf(RoleLookupError);
  });

  it('signInWithGoogle apaga loading y avisa si el inicio de OAuth falla', async () => {
    mockSupabase.auth.signInWithOAuth.mockResolvedValue({ error: { message: 'fail' } });

    service.signInWithGoogle();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.loading()).toBe(false);
    expect(service.authError()).toContain('No pudimos iniciar sesión con Google');
  });

  it('should set auth error and sign out when signOutWithError is called', async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });

    await service.signOutWithError('Error de prueba');

    expect(service.authError()).toBe('Error de prueba');
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });
});
