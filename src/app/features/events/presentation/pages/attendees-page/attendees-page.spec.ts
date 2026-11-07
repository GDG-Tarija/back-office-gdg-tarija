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
  registeredAt: null,
  customResponses: null,
  paymentProofUrl: null,
  checkedIn: false,
};

describe('AttendeesPage: cancelar inscripción pendiente', () => {
  const repo = { cancelPendingRegistration: vi.fn() };
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
