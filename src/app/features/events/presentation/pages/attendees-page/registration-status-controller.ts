import { Injectable, computed, inject, signal } from '@angular/core';

import { ConfirmationService, MessageService } from 'primeng/api';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import {
  REGISTRATION_STATUS_OPTIONS,
  RegistrationStatus,
  RegistrationStatusChange,
  checkStatusChange,
  registrationStatusLabel,
} from '../../../domain/registration-status';
import { RegistrationsRepository } from '../../../domain/registrations.repository';

/** Lo mínimo que se necesita para cambiar y describir una inscripción. */
export interface StatusChangeTarget {
  id: string;
  status: string;
  /** Nombre visible de la persona (para confirmación y mensajes). */
  displayName: string;
  /** Contexto extra para la confirmación (p. ej. el paquete). */
  detail?: string | null;
}

/** `key` compartida por el p-toast y el p-confirmdialog de la página. */
export const REGISTRATION_STATUS_UI_KEY = 'registration-status';

/**
 * Único punto para cambiar el estado de una inscripción desde la UI (tabla y detalle):
 * permisos (UX), confirmación al anular, bloqueo de envíos duplicados y mensajes.
 * Proveer a nivel de componente junto con ConfirmationService y MessageService.
 */
@Injectable()
export class RegistrationStatusController {
  private readonly repo = inject(RegistrationsRepository);
  private readonly auth = inject(AuthService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  readonly options = REGISTRATION_STATUS_OPTIONS;

  /** Solo SUPERADMIN cambia estados. Es solo UX: la seguridad real es la RLS. */
  readonly canEdit = computed(() => this.auth.role() === 'SUPERADMIN');

  private readonly savingIds = signal<ReadonlySet<string>>(new Set());
  readonly hasPendingSave = computed(() => this.savingIds().size > 0);

  isSaving(registrationId: string): boolean {
    return this.savingIds().has(registrationId);
  }

  /**
   * Pide confirmación si corresponde y persiste. Devuelve lo guardado en la BD, o null si
   * no hubo cambio (sin permiso, mismo estado, confirmación cancelada o error ya notificado).
   */
  async change(
    target: StatusChangeTarget,
    next: RegistrationStatus,
    options: { skipConfirmation?: boolean } = {},
  ): Promise<RegistrationStatusChange | null> {
    if (!this.canEdit() || this.isSaving(target.id)) return null;

    const check = checkStatusChange(target.status, next);
    if (!check.ok) {
      if (check.reason === 'INVALID') this.notifyError(check.message);
      return null;
    }

    if (
      check.requiresConfirmation &&
      !options.skipConfirmation &&
      !(await this.confirmCancellation(target))
    )
      return null;
    // Mientras el diálogo estaba abierto pudo empezar otro guardado de la misma inscripción.
    if (this.isSaving(target.id)) return null;

    this.setSaving(target.id, true);
    try {
      const saved = await this.repo.updateStatus(target.id, check.next);
      this.messages.add({
        key: REGISTRATION_STATUS_UI_KEY,
        severity: 'success',
        summary: 'Estado actualizado',
        detail: `${target.displayName}: ${registrationStatusLabel(saved.status)}.`,
        life: 3500,
      });
      return saved;
    } catch (err) {
      this.notifyError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
      return null;
    } finally {
      this.setSaving(target.id, false);
    }
  }

  private confirmCancellation(target: StatusChangeTarget): Promise<boolean> {
    const who = target.detail ? `${target.displayName} (${target.detail})` : target.displayName;
    return new Promise((resolve) => {
      this.confirmation.confirm({
        key: REGISTRATION_STATUS_UI_KEY,
        header: 'Anular inscripción',
        message:
          `¿Anular la inscripción de ${who}? No podrá registrar check-in, refrigerio ni ` +
          'ingreso a sesiones. Su historial de asistencia se conserva y podrás restaurarla ' +
          'cambiando de nuevo el estado.',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Anular inscripción',
        rejectLabel: 'Volver',
        acceptButtonProps: { severity: 'danger' },
        rejectButtonProps: { severity: 'secondary', outlined: true },
        defaultFocus: 'reject',
        closable: true,
        closeOnEscape: true,
        accept: () => resolve(true),
        // También se llama al cerrar con la X o con Escape.
        reject: () => resolve(false),
      });
    });
  }

  private notifyError(detail: string): void {
    this.messages.add({
      key: REGISTRATION_STATUS_UI_KEY,
      severity: 'error',
      summary: 'No se pudo cambiar el estado',
      detail,
      life: 6000,
    });
  }

  private setSaving(registrationId: string, saving: boolean): void {
    this.savingIds.update((current) => {
      const next = new Set(current);
      if (saving) next.add(registrationId);
      else next.delete(registrationId);
      return next;
    });
  }
}
