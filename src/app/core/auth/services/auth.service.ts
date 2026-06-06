import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';

import { AUTH_WHITELIST } from '../../config/auth-whitelist';
import { Profile } from '../../models/profile.model';
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
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);
  private readonly router = inject(Router);
  private readonly rpc = this.supabase.rpc.bind(this.supabase) as unknown as AuthRpc;

  private syncingUserId: string | null = null;
  private lastSyncAt = 0;

  readonly user = signal<Profile | null>(null);
  readonly loading = signal(true);
  readonly authError = signal<string | null>(null);

  isWhitelisted(email?: string): boolean {
    if (!email) return false;
    return AUTH_WHITELIST.map((e) => e.toLowerCase()).includes(email.toLowerCase());
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
        this.loading.set(false);
      }
    });
  }

  signInWithGoogle(): void {
    this.loading.set(true);
    this.authError.set(null);
    const currentPath = window.location.pathname;
    const redirectTarget = currentPath === '/auth/login' ? '/dashboard' : currentPath;

    sessionStorage.setItem('redirect_to', redirectTarget);

    const base = document.querySelector('base')?.getAttribute('href') ?? '/';
    const cleanBase = base.replace(/\/$/, '');
    const redirectTo = `${window.location.origin}${cleanBase}/auth/callback`;

    void this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
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

  private async hydrateProfile(session: AuthSession): Promise<void> {
    const partial = this.buildPartial(session);

    if (!partial) {
      this.loading.set(false);
      return;
    }

    if (!this.isWhitelisted(partial.email)) {
      await this.signOutWithError('Tu correo no está autorizado para acceder a este panel.');
      return;
    }

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

    if (!this.isWhitelisted(partial.email)) {
      await this.signOutWithError('Tu correo no está autorizado para acceder a este panel.');
      return;
    }

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
