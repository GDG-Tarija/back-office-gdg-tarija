import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { CheckinPage } from './checkin-page';
import { CheckinRepository } from '../../../domain/checkin.repository';
import { AuthService } from '../../../../../core/auth/services/auth.service';
import { Attendee, Event } from '../../../../events/domain/event.model';
import { Session } from '../../../domain/checkin.model';

const mockEvent: Event = {
  id: '00000000-0000-4000-8000-0000000000e2',
  title: 'DevFest Tarija (demo)',
  slug: 'devfest-tarija-demo',
  eventType: 'CONFERENCE',
  capacity: 150,
  dateStart: new Date('2026-11-20T09:00:00Z'),
  dateEnd: new Date('2026-11-20T18:00:00Z'),
  isPublished: true,
  createdAt: null,
  updatedAt: null,
  description: 'Evento de prueba',
  imageUrl: null,
  bannerUrl: null,
  locationType: 'PHYSICAL',
  locationName: 'Campus Demo',
  addressLink: null,
  category: 'IA, Web',
  extraInfo: null,
  formFields: [],
};

const mockAttendees: Attendee[] = [
  {
    id: '00000000-0000-4000-8000-000000000202',
    userId: '00000000-0000-4000-8000-0000000000a7',
    email: 'diego@ejemplo.test',
    firstName: 'Diego',
    lastName: 'Developer',
    avatarUrl: null,
    phone: '+59170000002',
    role: 'ATTENDEE',
    status: 'CONFIRMED',
    ticketName: 'Elite Builder',
    ticketPrice: 125,
    registeredAt: new Date('2026-11-01T10:00:00Z'),
    customResponses: {
      discovery_source: 'redes de la UCB',
      experience_level: 'senior',
    },
    paymentProofUrl: null,
    checkedIn: false,
    refrigerioDelivered: false,
    scanTypes: [],
  },
  {
    id: '00000000-0000-4000-8000-000000000201',
    userId: '00000000-0000-4000-8000-0000000000a4',
    email: 'ana@ejemplo.test',
    firstName: 'Ana',
    lastName: 'Asistente',
    avatarUrl: null,
    phone: '+59170000001',
    role: 'ATTENDEE',
    status: 'PENDING',
    ticketName: 'Ticket Básico',
    ticketPrice: 15,
    registeredAt: new Date('2026-11-01T11:00:00Z'),
    customResponses: {
      discovery_source: 'redes del GDG',
    },
    paymentProofUrl: null,
    checkedIn: false,
    refrigerioDelivered: false,
    scanTypes: [],
  },
];

const mockSession: Session = {
  id: 'd3d3d3d3-0000-4000-8000-000000000003',
  eventId: mockEvent.id,
  title: 'Servidores MCP en la práctica',
  capacity: 30,
};

describe('CheckinPage (QR y Modo Manual)', () => {
  const repo = {
    getEvents: vi.fn(),
    getAttendees: vi.fn(),
    getSessions: vi.fn(),
    getCheckinStats: vi.fn(),
    verifyRegistration: vi.fn(),
    registerScan: vi.fn(),
  };

  const authStub = {
    user: signal({ id: '00000000-0000-4000-8000-0000000000a2' }),
  };

  beforeEach(() => {
    Object.values(repo).forEach((fn) => fn.mockReset());
    repo.getEvents.mockResolvedValue([mockEvent]);
    repo.getAttendees.mockResolvedValue(mockAttendees);
    repo.getSessions.mockResolvedValue([mockSession]);

    TestBed.configureTestingModule({
      imports: [CheckinPage],
      providers: [{ provide: AuthService, useValue: authStub }],
    }).overrideComponent(CheckinPage, {
      set: {
        providers: [{ provide: CheckinRepository, useValue: repo }],
      },
    });
  });

  it('cambia a modo manual y carga los inscritos del evento seleccionado', async () => {
    const fixture = TestBed.createComponent(CheckinPage);
    const cmp = fixture.componentInstance;
    await cmp.loadEvents();

    expect(cmp.entryMode()).toBe('qr');
    await cmp.setEntryMode('manual');

    expect(cmp.entryMode()).toBe('manual');
    expect(repo.getAttendees).toHaveBeenCalledWith(mockEvent.id);
    expect(cmp.attendees()).toHaveLength(2);
  });

  it('filtra inscritos en vivo con debounce por nombre, celular, correo, ID y respuestas', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(CheckinPage);
      const cmp = fixture.componentInstance;
      await cmp.loadEvents();
      await cmp.setEntryMode('manual');

      // Buscar por celular sin prefijo
      cmp.onSearchInput('70000002');
      expect(cmp.debouncedQuery()).toBe('');
      vi.advanceTimersByTime(250);
      expect(cmp.debouncedQuery()).toBe('70000002');
      expect(cmp.filteredAttendees().map((a) => a.firstName)).toEqual(['Diego']);

      // Buscar por respuesta del formulario (universidad UCB)
      cmp.onSearchInput('UCB');
      vi.advanceTimersByTime(250);
      expect(cmp.filteredAttendees().map((a) => a.firstName)).toEqual(['Diego']);

      // Limpiar búsqueda resetea de inmediato
      cmp.clearSearch();
      expect(cmp.searchQuery()).toBe('');
      expect(cmp.debouncedQuery()).toBe('');
      expect(cmp.filteredAttendees()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('al elegir un inscrito ejecuta el mismo flujo de verificación y confirmación que el QR', async () => {
    const fixture = TestBed.createComponent(CheckinPage);
    const cmp = fixture.componentInstance;
    await cmp.loadEvents();
    await cmp.setEntryMode('manual');

    repo.verifyRegistration.mockResolvedValue({
      success: true,
      message: 'Credencial válida para escanear.',
      attendee: {
        firstName: 'Diego',
        lastName: 'Developer',
        email: 'diego@ejemplo.test',
        phone: '+59170000002',
        role: 'ATTENDEE',
        ticketName: 'Elite Builder',
      },
      scanTypeLabel: 'Registro General / Check-in',
      registrationDbId: mockAttendees[0].id,
      userId: mockAttendees[0].userId,
    });

    await cmp.selectAttendee(mockAttendees[0]);

    expect(repo.verifyRegistration).toHaveBeenCalledWith(
      mockAttendees[0].id,
      mockEvent.id,
      'checkin',
      null,
    );
    expect(cmp.showConfirmDialog()).toBe(true);
    expect(cmp.pendingConfirmCode()).toBe(mockAttendees[0].id);

    // Confirmar el registro
    repo.registerScan.mockResolvedValue({
      success: true,
      message: '¡Asistencia registrada con éxito!',
      attendee: {
        firstName: 'Diego',
        lastName: 'Developer',
        email: 'diego@ejemplo.test',
        phone: '+59170000002',
        role: 'ATTENDEE',
        ticketName: 'Elite Builder',
      },
      scannedAt: new Date('2026-11-20T09:15:00Z'),
      scanTypeLabel: 'Registro General / Check-in',
    });

    await cmp.confirmCheckin();

    expect(repo.registerScan).toHaveBeenCalledWith(
      mockAttendees[0].id,
      mockEvent.id,
      'checkin',
      null,
      '00000000-0000-4000-8000-0000000000a2',
    );
    expect(cmp.pendingConfirmCode()).toBeNull();
    // El estado local del inscrito se actualiza inmediatamente
    expect(cmp.isAttendeeScannedForCurrentMode(cmp.attendees()[0])).toBe(true);
  });

  it('valida estado no confirmado o ya registrado al seleccionar en modo manual', async () => {
    const fixture = TestBed.createComponent(CheckinPage);
    const cmp = fixture.componentInstance;
    await cmp.loadEvents();
    await cmp.setEntryMode('manual');

    repo.verifyRegistration.mockResolvedValue({
      success: false,
      message: 'El registro del asistente está en estado: PENDING. Debe estar Confirmado.',
      attendee: {
        firstName: 'Ana',
        lastName: 'Asistente',
        email: 'ana@ejemplo.test',
        role: 'ATTENDEE',
        ticketName: 'Ticket Básico',
      },
    });

    await cmp.selectAttendee(mockAttendees[1]);

    expect(cmp.showConfirmDialog()).toBe(true);
    expect(cmp.pendingConfirmCode()).toBeNull();
    expect(cmp.scanResult()?.success).toBe(false);
    expect(cmp.scanResult()?.message).toContain('PENDING');
  });
});
