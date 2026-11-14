import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';

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
    phaseName: null,
    phasePrice: null,
    couponId: null,
    couponCode: null,
    amountDue: 125,
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
    phaseName: null,
    phasePrice: null,
    couponId: null,
    couponCode: null,
    amountDue: 15,
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

describe('CheckinPage (puerta: QR y Modo Manual)', () => {
  const repo = {
    getEvents: vi.fn(),
    getAssignedEventIds: vi.fn(),
    getAttendees: vi.fn(),
    getSessions: vi.fn(),
    getCheckinStats: vi.fn(),
    verifyRegistration: vi.fn(),
    registerScan: vi.fn(),
    undoScan: vi.fn(),
  };

  const authStub = {
    user: signal({ id: '00000000-0000-4000-8000-0000000000a2' }),
    role: signal<'SUPERADMIN' | 'STAFF' | null>('SUPERADMIN'),
  };

  const person = {
    firstName: 'Diego',
    lastName: 'Developer',
    email: 'diego@ejemplo.test',
    phone: '+59170000002',
    role: 'ATTENDEE',
    ticketName: 'Elite Builder',
  };

  let queryParams: Record<string, string> = {};

  beforeEach(() => {
    queryParams = {};
    localStorage.clear();
    Object.values(repo).forEach((fn) => fn.mockReset());
    authStub.role.set('SUPERADMIN');
    repo.getEvents.mockResolvedValue([mockEvent]);
    repo.getAssignedEventIds.mockResolvedValue([]);
    repo.getAttendees.mockResolvedValue(mockAttendees);
    repo.getSessions.mockResolvedValue([mockSession]);
    repo.getCheckinStats.mockResolvedValue({
      checkedInCount: 4,
      refrigerioCount: 1,
      totalRegistered: 10,
    });

    TestBed.configureTestingModule({
      imports: [CheckinPage],
      providers: [
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(queryParams);
              },
            },
          },
        },
      ],
    }).overrideComponent(CheckinPage, {
      set: {
        providers: [{ provide: CheckinRepository, useValue: repo }],
      },
    });
  });

  async function openPage(): Promise<CheckinPage> {
    const cmp = TestBed.createComponent(CheckinPage).componentInstance;
    await cmp.loadEvents();
    return cmp;
  }

  it('preselecciona el evento de ?event= y, sin él, el de hoy en vez del más lejano', async () => {
    const far = { ...mockEvent, id: 'lejano', dateStart: new Date('2030-01-01T09:00:00Z') };
    const other = { ...mockEvent, id: 'otro-evento', dateStart: new Date('2030-02-01T09:00:00Z') };
    const today = { ...mockEvent, id: 'hoy', dateStart: new Date(), dateEnd: null };
    repo.getEvents.mockResolvedValue([far, other, today]);

    queryParams = { event: 'otro-evento' };
    expect((await openPage()).selectedEvent()?.id).toBe('otro-evento');

    queryParams = {};
    expect((await openPage()).selectedEvent()?.id).toBe('hoy');
  });

  it('un STAFF solo ve los eventos asignados y, con uno solo, queda elegido', async () => {
    authStub.role.set('STAFF');
    const other = { ...mockEvent, id: 'ajeno' };
    repo.getEvents.mockResolvedValue([other, mockEvent]);
    repo.getAssignedEventIds.mockResolvedValue([mockEvent.id]);

    const cmp = await openPage();

    expect(cmp.events().map((e) => e.id)).toEqual([mockEvent.id]);
    expect(cmp.selectedEvent()?.id).toBe(mockEvent.id);
  });

  it('un STAFF sin asignaciones no ve eventos ni elige ninguno', async () => {
    authStub.role.set('STAFF');
    repo.getAssignedEventIds.mockResolvedValue([]);

    const cmp = await openPage();

    expect(cmp.events()).toEqual([]);
    expect(cmp.selectedEvent()).toBeNull();
  });

  it('recuerda el último evento usado en el dispositivo', async () => {
    const a = { ...mockEvent, id: 'a', dateStart: new Date('2030-01-01T09:00:00Z') };
    const b = { ...mockEvent, id: 'b', dateStart: new Date('2031-01-01T09:00:00Z') };
    repo.getEvents.mockResolvedValue([a, b]);
    localStorage.setItem('checkin:last-event', 'b');

    expect((await openPage()).selectedEvent()?.id).toBe('b');
  });

  it('no pide la cámara al cargar la página', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    const cmp = await openPage();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(cmp.scanning()).toBe(false);
  });

  it('cambia a modo manual y carga los inscritos del evento seleccionado', async () => {
    const cmp = await openPage();

    expect(cmp.entryMode()).toBe('qr');
    await cmp.setEntryMode('manual');

    expect(cmp.entryMode()).toBe('manual');
    expect(repo.getAttendees).toHaveBeenCalledWith(mockEvent.id);
    expect(cmp.attendees()).toHaveLength(2);
  });

  it('filtra inscritos en vivo con debounce por nombre, celular, correo, ID y respuestas', async () => {
    vi.useFakeTimers();
    try {
      const cmp = await openPage();
      await cmp.setEntryMode('manual');

      cmp.onSearchInput('70000002');
      expect(cmp.debouncedQuery()).toBe('');
      vi.advanceTimersByTime(250);
      expect(cmp.debouncedQuery()).toBe('70000002');
      expect(cmp.filteredAttendees().map((a) => a.firstName)).toEqual(['Diego']);

      cmp.onSearchInput('UCB');
      vi.advanceTimersByTime(250);
      expect(cmp.filteredAttendees().map((a) => a.firstName)).toEqual(['Diego']);

      cmp.clearSearch();
      expect(cmp.searchQuery()).toBe('');
      expect(cmp.debouncedQuery()).toBe('');
      expect(cmp.filteredAttendees()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('una confirmada se registra al instante: resultado verde, contador y historial', async () => {
    vi.useFakeTimers();
    try {
      const cmp = await openPage();
      await cmp.setEntryMode('manual');
      repo.registerScan.mockResolvedValue({
        success: true,
        message: '¡Asistencia registrada con éxito!',
        attendee: person,
        scannedAt: new Date('2026-11-20T09:15:00Z'),
        scanLogId: 'log-1',
      });

      await cmp.selectAttendee(mockAttendees[0]);

      expect(repo.registerScan).toHaveBeenCalledWith(
        mockAttendees[0].id,
        mockEvent.id,
        'checkin',
        null,
        '00000000-0000-4000-8000-0000000000a2',
      );
      expect(repo.verifyRegistration).not.toHaveBeenCalled();
      expect(cmp.door()?.state).toMatchObject({
        tone: 'go',
        headline: 'Puede pasar',
        undoable: true,
      });
      expect(cmp.isAttendeeScannedForCurrentMode(cmp.attendees()[0])).toBe(true);
      expect(cmp.counter()).toBe('5 de 10 ingresaron');
      expect(cmp.recentScans()[0]).toMatchObject({ name: 'Diego Developer', tone: 'go' });

      // El verde se va solo a los 5 s.
      vi.advanceTimersByTime(5000);
      expect(cmp.door()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('deshacer borra el registro y revierte contador, lista e historial', async () => {
    const cmp = await openPage();
    await cmp.setEntryMode('manual');
    repo.registerScan.mockResolvedValue({
      success: true,
      message: 'ok',
      attendee: person,
      scanLogId: 'log-1',
      userId: 'u1',
    });
    repo.undoScan.mockResolvedValue({ ok: true, message: 'Registro deshecho.' });

    await cmp.selectAttendee(mockAttendees[0]);
    await cmp.undo();

    expect(repo.undoScan).toHaveBeenCalledWith({
      scanLogId: 'log-1',
      mode: 'checkin',
      sessionId: null,
      userId: 'u1',
    });
    expect(cmp.door()).toBeNull();
    expect(cmp.counter()).toBe('4 de 10 ingresaron');
    expect(cmp.isAttendeeScannedForCurrentMode(cmp.attendees()[0])).toBe(false);
    expect(cmp.recentScans()[0].label).toBe('Deshecho');
  });

  it('si ya no se puede deshacer, el verde sigue y muestra por qué', async () => {
    const cmp = await openPage();
    repo.registerScan.mockResolvedValue({
      success: true,
      message: 'ok',
      attendee: person,
      scanLogId: 'log-1',
    });
    repo.undoScan.mockResolvedValue({ ok: false, message: 'Ya no se puede deshacer.' });

    await cmp.handleQrDecoded(mockAttendees[0].id);
    await cmp.undo();

    expect(cmp.door()).not.toBeNull();
    expect(cmp.undoError()).toBe('Ya no se puede deshacer.');
  });

  describe('antirebote del mismo QR', () => {
    const registered = {
      success: true,
      message: 'ok',
      attendee: person,
      scanLogId: 'log-1',
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('tras Deshacer, el mismo QR delante de la cámara no se vuelve a registrar', async () => {
      const cmp = await openPage();
      repo.registerScan.mockResolvedValue(registered);
      repo.undoScan.mockResolvedValue({ ok: true, message: 'Registro deshecho.' });

      await cmp.handleQrDecoded('qr-1');
      await cmp.undo();
      vi.advanceTimersByTime(500);
      await cmp.handleQrDecoded('qr-1');

      expect(repo.registerScan).toHaveBeenCalledTimes(1);
    });

    it('tras cerrar el resultado, el mismo QR sigue bloqueado mientras no se aparte', async () => {
      const cmp = await openPage();
      repo.registerScan.mockResolvedValue(registered);

      await cmp.handleQrDecoded('qr-1');
      cmp.dismissDoor();
      // La persona sigue frente a la cámara: cada fotograma renueva la espera.
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(1000);
        await cmp.handleQrDecoded('qr-1');
      }

      expect(repo.registerScan).toHaveBeenCalledTimes(1);
    });

    it('pasados 3 s sin ver el QR, se puede volver a leer', async () => {
      const cmp = await openPage();
      repo.registerScan.mockResolvedValue(registered);

      await cmp.handleQrDecoded('qr-1');
      cmp.dismissDoor();
      vi.advanceTimersByTime(3100);
      await cmp.handleQrDecoded('qr-1');

      expect(repo.registerScan).toHaveBeenCalledTimes(2);
    });

    it('otro QR distinto se lee enseguida', async () => {
      const cmp = await openPage();
      repo.registerScan.mockResolvedValue(registered);

      await cmp.handleQrDecoded('qr-1');
      cmp.dismissDoor();
      await cmp.handleQrDecoded('qr-2');

      expect(repo.registerScan).toHaveBeenCalledTimes(2);
    });
  });

  it('si falla leer las asignaciones, un STAFF ve los eventos legibles con un aviso (no error permanente)', async () => {
    authStub.role.set('STAFF');
    repo.getAssignedEventIds.mockRejectedValue(new Error('42501'));

    const cmp = await openPage();

    expect(cmp.eventsError()).toBeNull();
    expect(cmp.eventsWarning()).toContain('No pudimos leer tus eventos asignados');
    expect(cmp.events().map((e) => e.id)).toEqual([mockEvent.id]);

    repo.getAssignedEventIds.mockResolvedValue([mockEvent.id]);
    await cmp.loadEvents();
    expect(cmp.eventsWarning()).toBeNull();
  });

  it('si no se pueden leer los eventos, sigue el error con Reintentar', async () => {
    repo.getEvents.mockRejectedValue(new Error('red'));
    const cmp = await openPage();
    expect(cmp.eventsError()).toContain('No se pudieron cargar los eventos');
  });

  it('si el contador no se puede leer, se oculta en vez de mostrar "0 de 0"', async () => {
    repo.getCheckinStats.mockResolvedValue(null);
    const cmp = await openPage();
    expect(cmp.counter()).toBeNull();
  });

  it('al volver al modo Sesión conserva la sesión elegida y no recarga', async () => {
    const second: Session = {
      ...mockSession,
      id: 'e4e4e4e4-0000-4000-8000-000000000004',
      title: 'Z',
    };
    repo.getSessions.mockResolvedValue([mockSession, second]);
    const cmp = await openPage();

    cmp.setMode('session');
    await vi.waitFor(() => expect(cmp.selectedSession()).toEqual(mockSession));
    cmp.selectedSession.set(second);
    cmp.setMode('refrigerio');
    cmp.setMode('session');

    expect(cmp.selectedSession()).toEqual(second);
    expect(repo.getSessions).toHaveBeenCalledTimes(1);
  });

  it('pendiente de pago pide atención en ámbar y no cambia el contador', async () => {
    const cmp = await openPage();
    repo.registerScan.mockResolvedValue({
      success: false,
      reason: 'pending',
      message: 'pendiente',
      attendee: { ...person, firstName: 'Ana', lastName: 'Asistente' },
    });

    await cmp.handleQrDecoded(mockAttendees[1].id);

    expect(cmp.door()?.state).toMatchObject({ tone: 'wait', headline: 'Pago pendiente' });
    expect(cmp.counter()).toBe('4 de 10 ingresaron');
    expect(cmp.isAttendeeScannedForCurrentMode(mockAttendees[1])).toBe(false);

    // El resultado se queda hasta que el operador toque "Seguir escaneando".
    cmp.dismissDoor();
    expect(cmp.door()).toBeNull();
  });

  it('mientras hay un resultado en pantalla ignora otros QR', async () => {
    const cmp = await openPage();
    repo.registerScan.mockResolvedValue({
      success: false,
      reason: 'cancelled',
      message: 'anulada',
      attendee: person,
    });

    await cmp.handleQrDecoded('qr-1');
    await cmp.handleQrDecoded('qr-2');

    expect(repo.registerScan).toHaveBeenCalledTimes(1);
    expect(cmp.door()?.state.tone).toBe('stop');
  });

  it('en modo sesión pasa la sesión elegida y el texto cambia según el modo', async () => {
    const cmp = await openPage();
    cmp.setMode('session');
    await vi.waitFor(() => expect(cmp.selectedSession()).not.toBeNull());
    repo.registerScan.mockResolvedValue({
      success: true,
      message: 'ok',
      attendee: person,
      scanLogId: 'log-2',
    });

    await cmp.handleQrDecoded(mockAttendees[0].id);

    expect(repo.registerScan).toHaveBeenCalledWith(
      mockAttendees[0].id,
      mockEvent.id,
      'session',
      mockSession.id,
      '00000000-0000-4000-8000-0000000000a2',
    );
    expect(cmp.door()?.state.headline).toBe('Puede entrar a la sesión');
  });

  it('en la búsqueda manual los no confirmados no se pueden tocar y explican por qué', async () => {
    const cmp = await openPage();
    await cmp.setEntryMode('manual');

    expect(cmp.rowState(mockAttendees[0]).canRegister).toBe(true);
    const pending = cmp.rowState(mockAttendees[1]);
    expect(pending.canRegister).toBe(false);
    expect(pending.label).toBe('Pendiente de pago');
    expect(pending.hint).toContain('mesa de pagos');
  });
});
