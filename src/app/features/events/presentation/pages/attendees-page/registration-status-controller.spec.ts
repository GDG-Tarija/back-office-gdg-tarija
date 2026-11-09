import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { BackofficeRole } from '../../../../../core/models/role.model';
import { DomainError } from '../../../domain/domain-error';
import { RegistrationStatus, RegistrationStatusChange } from '../../../domain/registration-status';
import { RegistrationsRepository } from '../../../domain/registrations.repository';
import {
  REGISTRATION_STATUS_UI_KEY,
  RegistrationStatusController,
  StatusChangeTarget,
} from './registration-status-controller';

const ana: StatusChangeTarget = {
  id: 'r1',
  status: 'PENDING',
  displayName: 'Ana Asistente',
  detail: 'Ticket Básico',
};

function saved(status: RegistrationStatus, id = 'r1'): RegistrationStatusChange {
  return { id, status, updatedAt: null };
}

describe('RegistrationStatusController', () => {
  const role = signal<BackofficeRole | null>('SUPERADMIN');
  const repo = { updateStatus: vi.fn() };
  let ctl: RegistrationStatusController;
  let confirmation: ConfirmationService;
  let messages: MessageService;
  let lastConfirm: Confirmation | null;

  beforeEach(() => {
    role.set('SUPERADMIN');
    repo.updateStatus.mockReset();
    lastConfirm = null;
    TestBed.configureTestingModule({
      providers: [
        RegistrationStatusController,
        ConfirmationService,
        MessageService,
        { provide: RegistrationsRepository, useValue: repo },
        { provide: AuthService, useValue: { role } },
      ],
    });
    ctl = TestBed.inject(RegistrationStatusController);
    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((c: Confirmation) => {
      lastConfirm = c;
      return confirmation;
    });
    vi.spyOn(messages, 'add');
  });

  it('solo SUPERADMIN puede editar', () => {
    expect(ctl.canEdit()).toBe(true);
    role.set('STAFF');
    expect(ctl.canEdit()).toBe(false);
    role.set(null);
    expect(ctl.canEdit()).toBe(false);
  });

  it('sin permiso no llama a la BD ni pide confirmación', async () => {
    role.set('STAFF');
    expect(await ctl.change(ana, 'CONFIRMED')).toBeNull();
    expect(await ctl.change(ana, 'CANCELLED')).toBeNull();
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });

  it('PENDING -> CONFIRMED guarda sin confirmación y avisa éxito', async () => {
    repo.updateStatus.mockResolvedValue(saved('CONFIRMED'));
    const result = await ctl.change(ana, 'CONFIRMED');
    expect(result).toEqual(saved('CONFIRMED'));
    expect(repo.updateStatus).toHaveBeenCalledWith('r1', 'CONFIRMED');
    expect(confirmation.confirm).not.toHaveBeenCalled();
    expect(messages.add).toHaveBeenCalledWith(
      expect.objectContaining({
        key: REGISTRATION_STATUS_UI_KEY,
        severity: 'success',
        detail: 'Ana Asistente: Pagada / Confirmada.',
      }),
    );
  });

  it('CONFIRMED -> PENDING guarda sin confirmación', async () => {
    repo.updateStatus.mockResolvedValue(saved('PENDING'));
    expect(await ctl.change({ ...ana, status: 'CONFIRMED' }, 'PENDING')).toEqual(saved('PENDING'));
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });

  it('restaurar desde CANCELLED no pide confirmación', async () => {
    repo.updateStatus.mockResolvedValue(saved('CONFIRMED'));
    expect(await ctl.change({ ...ana, status: 'CANCELLED' }, 'CONFIRMED')).toEqual(
      saved('CONFIRMED'),
    );
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });

  it('anular pide confirmación explicando qué inscripción y guarda al aceptar', async () => {
    repo.updateStatus.mockResolvedValue(saved('CANCELLED'));
    const pending = ctl.change(ana, 'CANCELLED');
    await Promise.resolve();

    expect(lastConfirm).not.toBeNull();
    expect(lastConfirm!.key).toBe(REGISTRATION_STATUS_UI_KEY);
    expect(lastConfirm!.header).toBe('Anular inscripción');
    expect(lastConfirm!.message).toContain('Ana Asistente (Ticket Básico)');
    expect(lastConfirm!.defaultFocus).toBe('reject');
    expect(repo.updateStatus).not.toHaveBeenCalled();

    lastConfirm!.accept!();
    expect(await pending).toEqual(saved('CANCELLED'));
    expect(repo.updateStatus).toHaveBeenCalledWith('r1', 'CANCELLED');
  });

  it('cancelar la confirmación no modifica la BD', async () => {
    const pending = ctl.change(ana, 'CANCELLED');
    await Promise.resolve();
    lastConfirm!.reject!();
    expect(await pending).toBeNull();
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(messages.add).not.toHaveBeenCalled();
    expect(ctl.isSaving('r1')).toBe(false);
  });

  it('un error de la BD no se da por exitoso: devuelve null y muestra el motivo', async () => {
    repo.updateStatus.mockRejectedValue(
      new DomainError('No tienes permisos para realizar esta acción.', 'FORBIDDEN'),
    );
    expect(await ctl.change(ana, 'CONFIRMED')).toBeNull();
    expect(messages.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: 'No tienes permisos para realizar esta acción.',
      }),
    );
    expect(ctl.isSaving('r1')).toBe(false);
  });

  it('evita envíos duplicados de la misma inscripción mientras guarda', async () => {
    let resolve!: (v: RegistrationStatusChange) => void;
    repo.updateStatus.mockReturnValue(new Promise((r) => (resolve = r)));

    const first = ctl.change(ana, 'CONFIRMED');
    expect(ctl.isSaving('r1')).toBe(true);
    expect(ctl.hasPendingSave()).toBe(true);
    expect(await ctl.change(ana, 'CONFIRMED')).toBeNull();
    expect(await ctl.change(ana, 'CANCELLED')).toBeNull();
    expect(repo.updateStatus).toHaveBeenCalledTimes(1);

    resolve(saved('CONFIRMED'));
    expect(await first).toEqual(saved('CONFIRMED'));
    expect(ctl.isSaving('r1')).toBe(false);
  });

  it('no bloquea cambios de otras inscripciones', async () => {
    repo.updateStatus.mockImplementation((id: string, status: RegistrationStatus) =>
      Promise.resolve(saved(status, id)),
    );
    const [a, b] = await Promise.all([
      ctl.change(ana, 'CONFIRMED'),
      ctl.change({ ...ana, id: 'r2' }, 'CONFIRMED'),
    ]);
    expect(a?.id).toBe('r1');
    expect(b?.id).toBe('r2');
  });

  it('ignora un valor no válido y avisa', async () => {
    expect(await ctl.change(ana, 'PAID' as RegistrationStatus)).toBeNull();
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('pasar al mismo estado no hace nada', async () => {
    expect(await ctl.change(ana, 'PENDING')).toBeNull();
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(messages.add).not.toHaveBeenCalled();
  });
});
