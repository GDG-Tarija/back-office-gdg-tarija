import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { DomainError } from '../../../domain/domain-error';
import { Attendee, Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { RegistrationStatus } from '../../../domain/registration-status';
import { CheckinRepository } from '../../../../checkin/domain/checkin.repository';
import { RegistrationsRepository } from '../../../domain/registrations.repository';
import { AttendeesPage } from './attendees-page';
import { RegistrationStatusController } from './registration-status-controller';

const registrationsRepo = { updateStatus: vi.fn() };
const checkinRepo = { registerScan: vi.fn() };
let lastConfirm: Confirmation | null = null;

/** Providers de la página con repos falsos; la confirmación de anular se captura en `lastConfirm`. */
function pageProviders(repo: object) {
  return [
    { provide: EventsRepository, useValue: repo },
    { provide: RegistrationsRepository, useValue: registrationsRepo },
    { provide: CheckinRepository, useValue: checkinRepo },
    ConfirmationService,
    MessageService,
    RegistrationStatusController,
  ];
}

function resetStatusMocks(): void {
  lastConfirm = null;
  registrationsRepo.updateStatus.mockReset();
  registrationsRepo.updateStatus.mockImplementation((id: string, status: RegistrationStatus) =>
    Promise.resolve({ id, status, updatedAt: new Date() }),
  );
}

const pending: Attendee = {
  id: 'r1',
  userId: 'u1',
  email: 'a@b.c',
  firstName: 'Ana',
  lastName: 'Paz',
  avatarUrl: null,
  phone: null,
  role: 'ATTENDEE',
  status: 'PENDING',
  ticketName: 'General',
  ticketPrice: 30,
  phaseName: null,
  phasePrice: null,
  couponId: null,
  couponCode: null,
  amountDue: 30,
  registeredAt: null,
  customResponses: null,
  paymentProofUrl: null,
  checkedIn: false,
};

describe('AttendeesPage: cambio de estado desde el detalle', () => {
  const repo = {};
  const role = signal<'SUPERADMIN' | 'STAFF' | null>('SUPERADMIN');

  function create() {
    TestBed.configureTestingModule({
      imports: [AttendeesPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { role, user: signal(null) } },
      ],
    }).overrideComponent(AttendeesPage, {
      set: { providers: pageProviders(repo) },
    });
    const fixture = TestBed.createComponent(AttendeesPage);
    const cmp = fixture.componentInstance;
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((c: Confirmation) => {
      lastConfirm = c;
      return confirmation;
    });
    cmp.attendees.set([pending]);
    cmp.selectedAttendee.set(pending);
    return cmp;
  }

  beforeEach(() => {
    resetStatusMocks();
    checkinRepo.registerScan.mockReset();
    role.set('SUPERADMIN');
  });

  it('anular pide confirmación, persiste por RegistrationsApi y actualiza lista y detalle', async () => {
    const cmp = create();
    const done = cmp.changeStatus(pending, 'CANCELLED');
    await vi.waitFor(() => expect(lastConfirm).not.toBeNull());
    lastConfirm!.accept!();
    await done;
    expect(registrationsRepo.updateStatus).toHaveBeenCalledWith('r1', 'CANCELLED');
    expect(cmp.attendees()[0].status).toBe('CANCELLED');
    expect(cmp.selectedAttendee()?.status).toBe('CANCELLED');
  });

  it('si la base rechaza el cambio, conserva el estado', async () => {
    registrationsRepo.updateStatus.mockRejectedValue(new DomainError('Sin permiso', 'FORBIDDEN'));
    const cmp = create();
    await cmp.changeStatus(pending, 'CONFIRMED');
    expect(cmp.attendees()[0].status).toBe('PENDING');
  });

  it('un STAFF no cambia estados', async () => {
    role.set('STAFF');
    const cmp = create();
    await cmp.changeStatus(pending, 'CANCELLED');
    expect(registrationsRepo.updateStatus).not.toHaveBeenCalled();
  });
});

describe('AttendeesPage: revisión de comprobantes', () => {
  const repo = {};
  const role = signal<'SUPERADMIN' | 'STAFF' | null>('SUPERADMIN');
  const withProof = (id: string, extra: Partial<Attendee> = {}): Attendee => ({
    ...pending,
    id,
    paymentProofUrl: `https://x/${id}.png`,
    ...extra,
  });

  function create(list: Attendee[]) {
    TestBed.configureTestingModule({
      imports: [AttendeesPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { role, user: signal(null) } },
      ],
    }).overrideComponent(AttendeesPage, {
      set: { providers: pageProviders(repo) },
    });
    const fixture = TestBed.createComponent(AttendeesPage);
    const cmp = fixture.componentInstance;
    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((c: Confirmation) => {
      lastConfirm = c;
      return confirmation;
    });
    cmp.attendees.set(list);
    return cmp;
  }

  beforeEach(() => {
    resetStatusMocks();
    checkinRepo.registerScan.mockReset();
    role.set('SUPERADMIN');
  });

  it('la cola de revisión solo incluye inscritos filtrados con comprobante', () => {
    const cmp = create([
      withProof('a'),
      pending,
      withProof('b', { status: 'CONFIRMED' }),
      withProof('c'),
    ]);
    cmp.setFilter('status', 'PENDING');
    cmp.openProof(cmp.attendees()[0]);
    expect(cmp.proofQueue()).toEqual(['a', 'c']);
    expect(cmp.proofPosition()).toBe(1);
    cmp.stepProof(1);
    expect(cmp.proofAttendee()?.id).toBe('c');
    cmp.stepProof(1);
    expect(cmp.proofAttendee()?.id).toBe('c');
    cmp.stepProof(-1);
    expect(cmp.proofAttendee()?.id).toBe('a');
  });

  it('confirmar el pago actualiza la lista sin sacar al inscrito de la cola', async () => {
    const cmp = create([withProof('a'), withProof('c')]);
    cmp.setFilter('status', 'PENDING');
    cmp.openProof(cmp.attendees()[0]);
    await cmp.confirmPayment(cmp.attendees()[0]);
    expect(registrationsRepo.updateStatus).toHaveBeenCalledWith('a', 'CONFIRMED');
    expect(cmp.attendees()[0].status).toBe('CONFIRMED');
    expect(cmp.proofAttendee()?.status).toBe('CONFIRMED');
    expect(cmp.proofQueue()).toEqual(['a', 'c']);
  });

  it('un STAFF no confirma ni cancela desde el visor', async () => {
    role.set('STAFF');
    const cmp = create([withProof('a')]);
    await cmp.confirmPayment(cmp.attendees()[0]);
    await cmp.cancelFromProof(cmp.attendees()[0]);
    expect(registrationsRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('si la base rechaza el cambio, conserva el estado y libera el visor', async () => {
    registrationsRepo.updateStatus.mockRejectedValue(new DomainError('Sin permiso', 'FORBIDDEN'));
    const cmp = create([withProof('a')]);
    cmp.openProof(cmp.attendees()[0]);
    await cmp.confirmPayment(cmp.attendees()[0]);
    expect(cmp.attendees()[0].status).toBe('PENDING');
    expect(cmp.proofBusy()).toBe(false);
  });

  it('cancelar desde el visor usa el mismo camino sin repetir la confirmación', async () => {
    const cmp = create([withProof('a')]);
    await cmp.cancelFromProof(cmp.attendees()[0]);
    expect(lastConfirm).toBeNull();
    expect(registrationsRepo.updateStatus).toHaveBeenCalledWith('a', 'CANCELLED');
    expect(cmp.attendees()[0].status).toBe('CANCELLED');
  });

  it('el check-in manual se bloquea si la inscripción no está confirmada', async () => {
    const cmp = create([pending]);
    cmp.selectedAttendee.set(pending);
    await cmp.doManualCheckin();
    expect(checkinRepo.registerScan).not.toHaveBeenCalled();
  });

  it('muestra el mensaje del flujo unificado si el check-in es rechazado y no marca asistencia', async () => {
    checkinRepo.registerScan.mockResolvedValue({
      success: false,
      message: 'La inscripción está anulada: no puede registrar asistencia.',
    });
    const confirmed = { ...pending, status: 'CONFIRMED' };
    const cmp = create([confirmed]);
    cmp.selectedAttendee.set(confirmed);
    cmp.event.set({ id: 'e1' } as Event);
    await cmp.doManualCheckin();
    expect(cmp.actionError()).toContain('anulada');
    expect(cmp.attendees()[0].checkedIn).toBe(false);
  });

  it('avisa si el check-in lanza un error inesperado', async () => {
    checkinRepo.registerScan.mockRejectedValue(new Error('network'));
    const confirmed = { ...pending, status: 'CONFIRMED' };
    const cmp = create([confirmed]);
    cmp.selectedAttendee.set(confirmed);
    cmp.event.set({ id: 'e1' } as Event);
    await cmp.doManualCheckin();
    expect(cmp.actionError()).toContain('check-in');
    expect(cmp.attendees()[0].checkedIn).toBe(false);
  });

  it('registra el check-in con registerScan y actualiza lista y detalle', async () => {
    const scannedAt = new Date('2026-11-02T09:00:00Z');
    checkinRepo.registerScan.mockResolvedValue({ success: true, message: 'ok', scannedAt });
    const confirmed = { ...pending, status: 'CONFIRMED' };
    const cmp = create([confirmed]);
    cmp.selectedAttendee.set(confirmed);
    cmp.event.set({ id: 'e1' } as Event);
    await cmp.doManualCheckin();
    expect(checkinRepo.registerScan).toHaveBeenCalledWith(
      confirmed.id,
      'e1',
      'checkin',
      null,
      null,
    );
    expect(cmp.attendees()[0].checkedIn).toBe(true);
    expect(cmp.attendees()[0].checkedInAt).toEqual(scannedAt);
  });

  it('cambiar un filtro vuelve a la primera página', () => {
    const cmp = create([pending]);
    cmp.first.set(50);
    cmp.setFilter('status', 'PENDING');
    expect(cmp.first()).toBe(0);
  });
});
