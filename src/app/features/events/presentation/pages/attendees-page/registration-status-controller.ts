import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { FeedbackService } from '../../../../../core/services/feedback.service';
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

/**
 * Único punto para cambiar el estado de una inscripción desde la UI (tabla y detalle):
 * permisos (UX), confirmación al anular, bloqueo de envíos duplicados y mensajes
 * (vía FeedbackService, que muestra el layout). Proveer a nivel de componente.
 */
@Injectable()
export class RegistrationStatusController {
  private readonly repo = inject(RegistrationsRepository);
  private readonly auth = inject(AuthService);
  private readonly feedback = inject(FeedbackService);

  readonly options = REGISTRATION_STATUS_OPTIONS;

  /** Solo SUPERADMIN cambia estados. Es solo UX: la seguridad real es la RLS. */
  readonly canEdit = computed(() => this.auth.role() === 'SUPERADMIN');

  /** Último error de un cambio, para mostrarlo también donde se originó (p. ej. el visor de pago). */
  readonly lastError = signal<{ id: string; message: string } | null>(null);

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

    this.lastError.set(null);
    const check = checkStatusChange(target.status, next);
    if (!check.ok) {
      if (check.reason === 'INVALID') this.notifyError(target.id, check.message);
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
      this.feedback.success(
        `${target.displayName}: ${registrationStatusLabel(saved.status).toLowerCase()}.`,
      );
      return saved;
    } catch (err) {
      this.notifyError(target.id, err instanceof Error ? err.message : 'Inténtalo de nuevo.');
      return null;
    } finally {
      this.setSaving(target.id, false);
    }
  }

  private confirmCancellation(target: StatusChangeTarget): Promise<boolean> {
    const who = target.detail ? `${target.displayName} (${target.detail})` : target.displayName;
    return this.feedback.confirm({
      titulo: 'Anular inscripción',
      mensaje:
        `¿Anular la inscripción de ${who}? No podrá registrar check-in, refrigerio ni ` +
        'ingreso a sesiones. Su historial de asistencia se conserva y puedes restaurarla ' +
        'cambiando de nuevo el estado.',
      aceptar: 'Anular',
      peligro: true,
    });
  }

  private notifyError(id: string, detail: string): void {
    const message = `No se pudo cambiar el estado. ${detail}`;
    this.lastError.set({ id, message });
    this.feedback.error(message);
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
