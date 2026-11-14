import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { Profile } from '../../models/profile.model';
import { BackofficeRole } from '../../models/role.model';
import { DEFAULT_REDIRECT, REDIRECT_KEY, accessDeniedMessage } from '../redirect';
import { RoleLookupError } from '../role-lookup-error';
import { SUPABASE } from '../../supabase/supabase.client';

type AuthSession = {
  user?: { id: string; email?: string; user_metadata: Record<string, unknown> };
} | null;
type RpcResult<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
interface UpsertUserProfileArgs {
  p_id: string;
  p_email: string;
  p_first_name: string;
  p_last_name: string;
  p_avatar_url: string | null;
}

interface AuthRpc {
  (fn: 'get_my_profile'): RpcResult<Profile[]>;
  (fn: 'upsert_user_profile', args: UpsertUserProfileArgs): RpcResult<Profile[]>;
  (fn: 'get_my_role'): RpcResult<BackofficeRole | null>;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);
  private readonly router = inject(Router);
  private readonly rpc = this.supabase.rpc.bind(this.supabase) as unknown as AuthRpc;

  private syncingUserId: string | null = null;
  private lastSyncAt = 0;

  readonly user = signal<Profile | null>(null);
  readonly role = signal<BackofficeRole | null>(null);
  readonly loading = signal(true);
  readonly authError = signal<string | null>(null);

  /** Rol del operador o `null` si no tiene. Lanza `RoleLookupError` si la consulta falla. */
  async resolveRole(): Promise<BackofficeRole | null> {
    let result: Awaited<RpcResult<BackofficeRole | null>>;
    try {
      result = await this.rpc('get_my_role');
    } catch (cause) {
      throw new RoleLookupError({ cause });
    }
    if (result.error) throw new RoleLookupError({ cause: result.error });
    return result.data ?? null;
  }

  /** Vuelve a habilitar el botón de login si el navegador restaura la página tras ir a Google. */
  resetLoading(): void {
    this.loading.set(false);
  }

  async denyAccess(email: string | null | undefined): Promise<void> {
    await this.signOutWithError(accessDeniedMessage(email));
  }

  async signOutWithError(message: string): Promise<void> {
    this.authError.set(message);
    await this.signOut();
  }

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        void this.ensureProfile(session);
        return;
      }

      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        void this.hydrateProfile(session);
        return;
      }

      if (event === 'SIGNED_OUT') {
        this.user.set(null);
        this.role.set(null);
        this.loading.set(false);
      }
    });
  }

  signInWithGoogle(): void {
    this.loading.set(true);
    this.authError.set(null);
    // Si el guard guardó el deep link, se respeta; si no, se entra por el inicio.
    if (!sessionStorage.getItem(REDIRECT_KEY)) {
      sessionStorage.setItem(REDIRECT_KEY, DEFAULT_REDIRECT);
    }

    const base = document.querySelector('base')?.getAttribute('href') ?? '/';
    const cleanBase = base.replace(/\/$/, '');
    const redirectTo = `${window.location.origin}${cleanBase}/auth/callback`;

    const fail = () => {
      this.loading.set(false);
      this.authError.set('No pudimos iniciar sesión con Google. Revisa tu conexión y reintenta.');
    };
    this.supabase.auth
      .signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
          },
        },
      })
      .then(({ error }) => {
        if (error) fail();
      })
      .catch(fail);
  }

  async signOut(): Promise<void> {
    this.loading.set(true);
    await this.supabase.auth.signOut();
    this.user.set(null);
    this.loading.set(false);
    await this.router.navigateByUrl('/auth/login');
  }

  async getSession() {
    const { data } = await this.supabase.auth.getSession();
    return data.session;
  }

  private buildPartial(session: AuthSession): Profile | null {
    if (!session?.user) return null;

    const meta = session.user.user_metadata;
    const now = new Date().toISOString();
    const firstName =
      (meta['given_name'] as string | undefined) ?? (meta['name'] as string | undefined) ?? '';
    const lastName = (meta['family_name'] as string | undefined) ?? '';
    const avatarUrl =
      (meta['avatar_url'] as string | undefined) ?? (meta['picture'] as string | undefined) ?? null;

    return {
      id: session.user.id,
      email: session.user.email ?? '',
      first_name: firstName,
      last_name: lastName,
      avatar_url: avatarUrl,
      phone: null,
      extra_info: null,
      is_staff: null,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Como `resolveRole`, pero ante un fallo de red no cierra la sesión: devuelve `undefined`
   * y deja que el guard/callback muestren el reintento.
   */
  private async resolveRoleOrKeepSession(): Promise<BackofficeRole | null | undefined> {
    try {
      return await this.resolveRole();
    } catch (err) {
      if (!(err instanceof RoleLookupError)) throw err;
      console.error('No se pudo verificar el rol:', err);
      this.loading.set(false);
      return undefined;
    }
  }

  private async hydrateProfile(session: AuthSession): Promise<void> {
    const partial = this.buildPartial(session);

    if (!partial) {
      this.loading.set(false);
      return;
    }

    const role = await this.resolveRoleOrKeepSession();
    if (role === undefined) return;
    if (!role) {
      await this.denyAccess(partial.email);
      return;
    }
    this.role.set(role);

    try {
      const { data, error } = await this.rpc('get_my_profile');
      const row = Array.isArray(data) ? data[0] : null;

      if (error || !row) {
        this.user.set(partial);
        return;
      }

      this.user.set(row);
    } finally {
      this.loading.set(false);
    }
  }

  private async ensureProfile(session: AuthSession): Promise<void> {
    const partial = this.buildPartial(session);

    if (!partial) {
      this.loading.set(false);
      return;
    }

    const role = await this.resolveRoleOrKeepSession();
    if (role === undefined) return;
    if (!role) {
      await this.denyAccess(partial.email);
      return;
    }
    this.role.set(role);

    this.loading.set(true);

    const { data: existingRows, error: readError } = await this.rpc('get_my_profile');
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;

    if (!readError && existing) {
      this.user.set(existing);
      this.loading.set(false);
      return;
    }

    const now = Date.now();
    if (this.syncingUserId === partial.id) {
      this.loading.set(false);
      return;
    }
    if (now - this.lastSyncAt < 1500 && this.user()?.id === partial.id) {
      this.loading.set(false);
      return;
    }

    this.syncingUserId = partial.id;

    try {
      const { data, error } = await this.rpc('upsert_user_profile', {
        p_id: partial.id,
        p_email: partial.email,
        p_first_name: partial.first_name,
        p_last_name: partial.last_name,
        p_avatar_url: partial.avatar_url,
      });

      if (error || !data?.length) {
        this.user.set(partial);
        return;
      }

      this.user.set(data[0]);
    } catch {
      this.user.set(partial);
    } finally {
      this.syncingUserId = null;
      this.lastSyncAt = Date.now();
      this.loading.set(false);
    }
  }
}
