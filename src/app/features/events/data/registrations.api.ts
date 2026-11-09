import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { DomainError } from '../domain/domain-error';
import {
  RegistrationStatus,
  RegistrationStatusChange,
  isRegistrationStatus,
  parseRegistrationStatus,
} from '../domain/registration-status';
import { RegistrationsRepository } from '../domain/registrations.repository';
import { toDomainError } from './postgres-error.mapper';

@Injectable({ providedIn: 'root' })
export class RegistrationsApi implements RegistrationsRepository {
  private readonly supabase = inject(SUPABASE);

  async updateStatus(
    registrationId: string,
    status: RegistrationStatus,
  ): Promise<RegistrationStatusChange> {
    if (!isRegistrationStatus(status)) {
      throw new DomainError('Estado de inscripción no válido.', 'INVALID', 'status');
    }

    // Solo se envía `status`; `updated_at` lo mantiene el trigger de la tabla.
    const { data, error } = await this.supabase
      .from('registrations')
      .update({ status })
      .eq('id', registrationId)
      .select('id, status, updated_at')
      .maybeSingle();

    if (error) throw toDomainError(error, 'registration');

    // RLS no lanza error al filtrar un UPDATE: devuelve 0 filas. No es un éxito.
    if (!data) {
      throw new DomainError(
        'No se pudo cambiar el estado: no tienes permisos o la inscripción ya no existe.',
        'FORBIDDEN',
      );
    }

    const saved = parseRegistrationStatus(data.status);
    if (saved !== status) {
      throw new DomainError(
        'La base de datos no confirmó el nuevo estado. Recarga la página e inténtalo de nuevo.',
        'UNKNOWN',
      );
    }

    return {
      id: data.id,
      status: saved,
      updatedAt: data.updated_at ? new Date(data.updated_at) : null,
    };
  }
}
