import { BackofficeRole } from '../../../core/models/role.model';
import { BackofficeUser } from './backoffice-user.model';

/** Gestión de accesos al back-office. La base aplica las reglas; aquí solo se piden. */
export abstract class UsersRepository {
  abstract list(): Promise<BackofficeUser[]>;
  abstract add(email: string, role: BackofficeRole): Promise<void>;
  abstract setRole(email: string, role: BackofficeRole): Promise<void>;
  abstract remove(email: string): Promise<void>;
}
