import { Injectable, inject } from '@angular/core';

import { BackofficeRole } from '../../../core/models/role.model';
import { SUPABASE } from '../../../core/supabase/supabase.client';
import { BackofficeUser } from '../domain/backoffice-user.model';
import { UsersRepository } from '../domain/users.repository';
import { toBackofficeUser, toUsersError } from './users.mapper';

/** Todo pasa por RPCs: staff_whitelist no tiene policies de escritura. */
@Injectable({ providedIn: 'root' })
export class UsersApi implements UsersRepository {
  private readonly supabase = inject(SUPABASE);

  async list(): Promise<BackofficeUser[]> {
    const { data, error } = await this.supabase.rpc('list_backoffice_users');
    if (error) throw toUsersError(error);
    return (data ?? []).map(toBackofficeUser);
  }

  async add(email: string, role: BackofficeRole): Promise<void> {
    const { error } = await this.supabase.rpc('add_backoffice_user', {
      p_email: email,
      p_role: role,
    });
    if (error) throw toUsersError(error);
  }

  async setRole(email: string, role: BackofficeRole): Promise<void> {
    const { error } = await this.supabase.rpc('set_backoffice_user_role', {
      p_email: email,
      p_role: role,
    });
    if (error) throw toUsersError(error);
  }

  async remove(email: string): Promise<void> {
    const { error } = await this.supabase.rpc('remove_backoffice_user', { p_email: email });
    if (error) throw toUsersError(error);
  }
}
