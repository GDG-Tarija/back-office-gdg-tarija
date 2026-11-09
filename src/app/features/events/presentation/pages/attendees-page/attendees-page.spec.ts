import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { DomainError } from '../../../domain/domain-error';
import { Attendee } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { AttendeesPage } from './attendees-page';

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

describe('AttendeesPage: cancelar inscripción pendiente', () => {
  const repo = {
    cancelPendingRegistration: vi.fn(),
    confirmPendingRegistration: vi.fn(),
    registerManualCheckin: vi.fn(),
  };
  const role = signal<'SUPERADMIN' | 'STAFF' | null>('SUPERADMIN');

  function create() {
    TestBed.configureTestingModule({
      imports: [AttendeesPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { role } },
      ],
    }).overrideComponent(AttendeesPage, {
      set: { providers: [{ provide: EventsRepository, useValue: repo }] },
    });
    const cmp = TestBed.createComponent(AttendeesPage).componentInstance;
    cmp.attendees.set([pending]);
    cmp.selectedAttendee.set(pending);
    return cmp;
  }

  beforeEach(() => {
    repo.cancelPendingRegistration.mockReset();
    repo.confirmPendingRegistration.mockReset();
    repo.registerManualCheckin.mockReset();
    role.set('SUPERADMIN');
  });

  it('solo SUPERADMIN puede cancelar y solo inscripciones PENDING', () => {
    const cmp = create();
    expect(cmp.canCancel(pending)).toBe(true);
    expect(cmp.canCancel({ ...pending, status: 'CONFIRMED' })).toBe(false);
    expect(cmp.canCancel({ ...pending, status: 'CANCELLED' })).toBe(false);
    role.set('STAFF');
    expect(cmp.canCancel(pending)).toBe(false);
  });

  it('cancela y actualiza la lista y el detalle', async () => {
    repo.cancelPendingRegistration.mockResolvedValue(undefined);
    const cmp = create();
    cmp.confirmingCancel.set(true);
    await cmp.doCancelRegistration();
    expect(repo.cancelPendingRegistration).toHaveBeenCalledWith('r1');
    expect(cmp.attendees()[0].status).toBe('CANCELLED');
    expect(cmp.selectedAttendee()?.status).toBe('CANCELLED');
    expect(cmp.confirmingCancel()).toBe(false);
  });

  it('muestra el error y conserva el estado si falla', async () => {
    repo.cancelPendingRegistration.mockRejectedValue(new DomainError('Sin permiso', 'FORBIDDEN'));
    const cmp = create();
    await cmp.doCancelRegistration();
    expect(cmp.cancelError()).toBe('Sin permiso');
    expect(cmp.attendees()[0].status).toBe('PENDING');
  });

  it('un STAFF no dispara la cancelación', async () => {
    role.set('STAFF');
    const cmp = create();
    await cmp.doCancelRegistration();
    expect(repo.cancelPendingRegistration).not.toHaveBeenCalled();
  });
});

describe('AttendeesPage: revisión de comprobantes', () => {
  const repo = {
    cancelPendingRegistration: vi.fn(),
    confirmPendingRegistration: vi.fn(),
    registerManualCheckin: vi.fn(),
  };
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
        { provide: AuthService, useValue: { role } },
      ],
    }).overrideComponent(AttendeesPage, {
      set: { providers: [{ provide: EventsRepository, useValue: repo }] },
    });
    const cmp = TestBed.createComponent(AttendeesPage).componentInstance;
    cmp.attendees.set(list);
    return cmp;
  }

  beforeEach(() => {
    repo.cancelPendingRegistration.mockReset();
    repo.confirmPendingRegistration.mockReset();
    repo.registerManualCheckin.mockReset();
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
    repo.confirmPendingRegistration.mockResolvedValue(undefined);
    const cmp = create([withProof('a'), withProof('c')]);
    cmp.setFilter('status', 'PENDING');
    cmp.openProof(cmp.attendees()[0]);
    await cmp.confirmPayment(cmp.attendees()[0]);
    expect(repo.confirmPendingRegistration).toHaveBeenCalledWith('a');
    expect(cmp.attendees()[0].status).toBe('CONFIRMED');
    expect(cmp.proofAttendee()?.status).toBe('CONFIRMED');
    expect(cmp.proofQueue()).toEqual(['a', 'c']);
  });

  it('un STAFF no confirma ni cancela desde el visor', async () => {
    role.set('STAFF');
    const cmp = create([withProof('a')]);
    await cmp.confirmPayment(cmp.attendees()[0]);
    await cmp.cancelFromProof(cmp.attendees()[0]);
    expect(repo.confirmPendingRegistration).not.toHaveBeenCalled();
    expect(repo.cancelPendingRegistration).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor y conserva el estado', async () => {
    repo.confirmPendingRegistration.mockRejectedValue(new DomainError('Sin permiso', 'FORBIDDEN'));
    const cmp = create([withProof('a')]);
    await cmp.confirmPayment(cmp.attendees()[0]);
    expect(cmp.proofError()).toBe('Sin permiso');
    expect(cmp.attendees()[0].status).toBe('PENDING');
    expect(cmp.proofBusy()).toBe(false);
  });

  it('cancelar desde el visor libera la inscripción', async () => {
    repo.cancelPendingRegistration.mockResolvedValue(undefined);
    const cmp = create([withProof('a')]);
    await cmp.cancelFromProof(cmp.attendees()[0]);
    expect(cmp.attendees()[0].status).toBe('CANCELLED');
  });

  it('el check-in manual se bloquea si la inscripción no está confirmada', async () => {
    const cmp = create([pending]);
    cmp.selectedAttendee.set(pending);
    await cmp.doManualCheckin();
    expect(repo.registerManualCheckin).not.toHaveBeenCalled();
  });

  it('avisa si el check-in falla y no marca asistencia', async () => {
    repo.registerManualCheckin.mockResolvedValue(false);
    const confirmed = { ...pending, status: 'CONFIRMED' };
    const cmp = create([confirmed]);
    cmp.selectedAttendee.set(confirmed);
    await cmp.doManualCheckin();
    expect(cmp.actionError()).toContain('check-in');
    expect(cmp.attendees()[0].checkedIn).toBe(false);
  });

  it('cambiar un filtro vuelve a la primera página', () => {
    const cmp = create([pending]);
    cmp.first.set(50);
    cmp.setFilter('status', 'PENDING');
    expect(cmp.first()).toBe(0);
  });
});
