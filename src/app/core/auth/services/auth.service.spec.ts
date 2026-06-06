import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
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

  it('should allow whitelisted emails', () => {
    // pedro2528anze@gmail.com está en la whitelist por defecto
    expect(service.isWhitelisted('pedro2528anze@gmail.com')).toBe(true);
    expect(service.isWhitelisted('PEDRO2528ANZE@GMAIL.COM')).toBe(true); // Insensible a mayúsculas
  });

  it('should reject non-whitelisted emails', () => {
    expect(service.isWhitelisted('unauthorized@gmail.com')).toBe(false);
    expect(service.isWhitelisted('')).toBe(false);
    expect(service.isWhitelisted(undefined)).toBe(false);
  });

  it('should set auth error and sign out when signOutWithError is called', async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });

    await service.signOutWithError('Error de prueba');

    expect(service.authError()).toBe('Error de prueba');
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });
});
