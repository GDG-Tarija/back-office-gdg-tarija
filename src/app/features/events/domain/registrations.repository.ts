import { RegistrationStatus, RegistrationStatusChange } from './registration-status';

export abstract class RegistrationsRepository {
  /**
   * Cambia solo `status` de la inscripción y devuelve lo que quedó guardado.
   * Falla con DomainError si el estado no es válido, si la BD rechaza el cambio
   * o si no se actualizó ninguna fila (RLS: solo SUPERADMIN puede).
   */
  abstract updateStatus(
    registrationId: string,
    status: RegistrationStatus,
  ): Promise<RegistrationStatusChange>;
}
