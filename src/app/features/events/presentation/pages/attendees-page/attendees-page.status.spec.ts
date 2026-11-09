import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { Confirmation, ConfirmationService, MenuItem, MessageService } from 'primeng/api';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { BackofficeRole } from '../../../../../core/models/role.model';
import { DomainError } from '../../../domain/domain-error';
import { Attendee, Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { RegistrationStatus } from '../../../domain/registration-status';
import { CheckinRepository } from '../../../../checkin/domain/checkin.repository';
import { RegistrationsRepository } from '../../../domain/registrations.repository';
import { AttendeesPage } from './attendees-page';
import { RegistrationStatusController } from './registration-status-controller';

const event = {
  id: 'e1',
  title: 'DevFest (demo)',
  slug: 'devfest-demo',
  capacity: 100,
  dateStart: new Date('2026-12-01T13:00:00Z'),
  isPublished: true,
  description: null,
} as Event;

function attendee(id: string, firstName: string, status: string, o: Partial<Attendee> = {}) {
  return {
    id,
    userId: `u-${id}`,
    email: `${firstName.toLowerCase()}@ejemplo.test`,
    firstName,
    lastName: 'Demo',
    avatarUrl: null,
    phone: null,
    role: 'ATTENDEE',
    status,
    ticketName: 'Ticket Básico',
    ticketPrice: 15,
    phaseName: null,
    phasePrice: null,
    couponId: null,
    couponCode: null,
    amountDue: 15,
    registeredAt: new Date('2026-11-01T10:00:00Z'),
    customResponses: null,
    paymentProofUrl: null,
    checkedIn: false,
    ...o,
  } satisfies Attendee;
}

describe('AttendeesPage — estado de inscripción', () => {
  const role = signal<BackofficeRole | null>('SUPERADMIN');
  const eventsRepo = {
    getEventById: vi.fn(),
    getAttendees: vi.fn(),
    getAttendeeSessions: vi.fn(),
  };
  const registrationsRepo = { updateStatus: vi.fn() };
  const checkinRepo = { registerScan: vi.fn() };
  let fixture: ComponentFixture<AttendeesPage>;
  let page: AttendeesPage;
  let lastConfirm: Confirmation | null;

  beforeEach(async () => {
    // jsdom no trae ResizeObserver y la columna fija de p-table lo usa.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    role.set('SUPERADMIN');
    Object.values(eventsRepo).forEach((m) => m.mockReset());
    registrationsRepo.updateStatus.mockReset();
    lastConfirm = null;

    eventsRepo.getEventById.mockResolvedValue(event);
    eventsRepo.getAttendees.mockResolvedValue([
      attendee('r1', 'Ana', 'PENDING'),
      attendee('r2', 'Bruno', 'CONFIRMED'),
      attendee('r3', 'Carla', 'CANCELLED'),
    ]);
    eventsRepo.getAttendeeSessions.mockResolvedValue([]);
    registrationsRepo.updateStatus.mockImplementation((id: string, status: RegistrationStatus) =>
      Promise.resolve({ id, status, updatedAt: new Date() }),
    );

    TestBed.configureTestingModule({
      imports: [AttendeesPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'e1' }) } },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { role, user: signal(null) } },
      ],
    });
    TestBed.overrideComponent(AttendeesPage, {
      set: {
        providers: [
          { provide: EventsRepository, useValue: eventsRepo },
          { provide: RegistrationsRepository, useValue: registrationsRepo },
          { provide: CheckinRepository, useValue: checkinRepo },
          ConfirmationService,
          MessageService,
          RegistrationStatusController,
        ],
      },
    });

    fixture = TestBed.createComponent(AttendeesPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await vi.waitFor(() => expect(page.attendees()).toHaveLength(3));
    fixture.detectChanges();

    const confirmation = fixture.debugElement.injector.get(ConfirmationService);
    vi.spyOn(confirmation, 'confirm').mockImplementation((c: Confirmation) => {
      lastConfirm = c;
      return confirmation;
    });
  });

  const el = (): HTMLElement => fixture.nativeElement;
  const statusOf = (id: string) => page.attendees().find((a) => a.id === id)?.status;
  const visibleIds = () => page.filteredAttendees().map((a) => a.id);
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** Hace clic en el botón de la fila y devuelve los ítems que muestra el p-menu. */
  function rowMenu(id: string): MenuItem[] {
    const a = page.attendees().find((x) => x.id === id)!;
    fixture.detectChanges();
    const button = el().querySelector<HTMLButtonElement>(
      `[aria-label="Cambiar estado de la inscripción de ${a.firstName} ${a.lastName}"]`,
    )!;
    button.click();
    return page.statusMenuItems()[0].items ?? [];
  }
  const runCommand = (item: MenuItem) =>
    item.command!({ originalEvent: new MouseEvent('click'), item });

  async function openDetail(id: string) {
    await page.openAttendeeDetail(page.attendees().find((a) => a.id === id)!);
    await render();
  }

  it('muestra la acción rápida por fila y los estados con su etiqueta', async () => {
    await render();
    expect(el().querySelectorAll('[data-testid="row-status-action"]')).toHaveLength(3);
    const text = el().textContent ?? '';
    expect(text).toContain('Pendiente de pago');
    expect(text).toContain('Pagada / Confirmada');
    expect(text).toContain('Anulada');
  });

  it('cambia el estado desde el detalle y sincroniza detalle y tabla', async () => {
    await openDetail('r1');
    const confirmBtn = el().querySelector<HTMLButtonElement>(
      '[data-testid="detail-status-CONFIRMED"]',
    )!;
    expect(
      el().querySelector<HTMLButtonElement>('[data-testid="detail-status-PENDING"]')!.disabled,
    ).toBe(true); // estado actual

    confirmBtn.click();
    await vi.waitFor(() => expect(statusOf('r1')).toBe('CONFIRMED'));
    await render();

    expect(registrationsRepo.updateStatus).toHaveBeenCalledWith('r1', 'CONFIRMED');
    expect(page.selectedAttendee()?.status).toBe('CONFIRMED');
    expect(el().querySelector('[data-testid="detail-status-tag"]')?.textContent?.trim()).toContain(
      'Pagada / Confirmada',
    );
    // No se tocan otros campos del asistente.
    expect(page.attendees().find((a) => a.id === 'r1')).toEqual(attendee('r1', 'Ana', 'CONFIRMED'));
  });

  it('cambio rápido desde la tabla: deshabilita el estado actual y usa la misma lógica', async () => {
    const items = rowMenu('r1'); // Ana, PENDING
    expect(items.map((i) => [i.label, !!i.disabled])).toEqual([
      ['Marcar como pagada', false],
      ['Marcar como pendiente', true],
      ['Anular inscripción', false],
    ]);

    runCommand(items[0]);
    await vi.waitFor(() => expect(statusOf('r1')).toBe('CONFIRMED'));
    expect(registrationsRepo.updateStatus).toHaveBeenCalledWith('r1', 'CONFIRMED');
    expect(lastConfirm).toBeNull();
  });

  it('pide confirmación antes de anular y no cambia nada si se cancela', async () => {
    runCommand(rowMenu('r2')[2]); // Bruno -> Anular
    await vi.waitFor(() => expect(lastConfirm).not.toBeNull());
    expect(lastConfirm!.message).toContain('Bruno Demo (Ticket Básico)');

    lastConfirm!.reject!();
    await fixture.whenStable();
    expect(registrationsRepo.updateStatus).not.toHaveBeenCalled();
    expect(statusOf('r2')).toBe('CONFIRMED');
  });

  it('anula al confirmar y restaura desde CANCELLED', async () => {
    runCommand(rowMenu('r2')[2]);
    await vi.waitFor(() => expect(lastConfirm).not.toBeNull());
    lastConfirm!.accept!();
    await vi.waitFor(() => expect(statusOf('r2')).toBe('CANCELLED'));
    expect(registrationsRepo.updateStatus).toHaveBeenCalledWith('r2', 'CANCELLED');

    lastConfirm = null;
    runCommand(rowMenu('r2')[0]); // restaurar -> pagada, sin confirmación
    await vi.waitFor(() => expect(statusOf('r2')).toBe('CONFIRMED'));
    expect(lastConfirm).toBeNull();
  });

  describe('modal real de anulación (sin mock de confirm)', () => {
    const dialogButton = (cls: string) => document.body.querySelector<HTMLButtonElement>(`.${cls}`);

    beforeEach(() => {
      vi.mocked(fixture.debugElement.injector.get(ConfirmationService).confirm).mockRestore();
    });

    async function openCancelDialog() {
      runCommand(rowMenu('r2')[2]); // Bruno -> Anular
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(dialogButton('p-confirm-dialog-accept')).not.toBeNull();
      });
    }

    it('muestra título, mensaje y botones del modal', async () => {
      await openCancelDialog();
      const text = document.body.textContent ?? '';
      expect(text).toContain('Anular inscripción');
      expect(text).toContain('Bruno Demo (Ticket Básico)');
      expect(dialogButton('p-confirm-dialog-reject')?.textContent?.trim()).toBe('Volver');
      expect(dialogButton('p-confirm-dialog-accept')?.textContent).toContain('Anular inscripción');
    });

    it('"Volver" cierra sin modificar el estado', async () => {
      await openCancelDialog();
      dialogButton('p-confirm-dialog-reject')!.click();
      await fixture.whenStable();
      expect(registrationsRepo.updateStatus).not.toHaveBeenCalled();
      expect(statusOf('r2')).toBe('CONFIRMED');
    });

    it('confirmar anula la inscripción', async () => {
      await openCancelDialog();
      dialogButton('p-confirm-dialog-accept')!.click();
      await vi.waitFor(() => expect(statusOf('r2')).toBe('CANCELLED'));
      expect(registrationsRepo.updateStatus).toHaveBeenCalledWith('r2', 'CANCELLED');
    });
  });

  it('si la BD rechaza el cambio, tabla y detalle conservan el estado', async () => {
    registrationsRepo.updateStatus.mockRejectedValue(
      new DomainError('No tienes permisos para realizar esta acción.', 'FORBIDDEN'),
    );
    await openDetail('r1');
    await page.changeStatus(page.attendees()[0], 'CONFIRMED');
    expect(statusOf('r1')).toBe('PENDING');
    expect(page.selectedAttendee()?.status).toBe('PENDING');
  });

  it('un cambio desde la tabla actualiza el detalle abierto de esa persona', async () => {
    await openDetail('r1');
    runCommand(rowMenu('r1')[0]);
    await vi.waitFor(() => expect(page.selectedAttendee()?.status).toBe('CONFIRMED'));
  });

  it('filtra por estado con conteos y mantiene la lista completa para exportar', async () => {
    expect(page.statusOptions().map((o) => o.label)).toEqual([
      'Todos los estados (3)',
      'Confirmados / pagados (1)',
      'Pendientes (1)',
      'Anulados (1)',
    ]);

    page.setFilter('status', 'PENDING');
    await render();
    expect(visibleIds()).toEqual(['r1']);
    expect(el().querySelectorAll('[data-testid="row-status-action"]')).toHaveLength(1);
    expect(page.attendees()).toHaveLength(3); // la exportación usa attendees()

    page.setFilter('status', 'CANCELLED');
    expect(visibleIds()).toEqual(['r3']);
    page.setFilter('status', 'CONFIRMED');
    expect(visibleIds()).toEqual(['r2']);
    page.setFilter('status', '');
    expect(visibleIds()).toHaveLength(3);
  });

  it('con un filtro activo, la fila sale de la vista al cambiar de estado', async () => {
    page.setFilter('status', 'PENDING');
    runCommand(rowMenu('r1')[0]);
    await vi.waitFor(() => expect(visibleIds()).toEqual([]));
    expect(page.statusOptions()[1].label).toBe('Confirmados / pagados (2)');
    await render();
    expect(el().textContent).toContain('Ningún inscrito coincide con los filtros');
  });

  it('una inscripción anulada no permite registrar asistencia manual', async () => {
    await openDetail('r3');
    const checkin = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Marcar Check-in'),
    )!;
    expect(checkin.disabled).toBe(true);
    expect(el().textContent).toContain('Inscripción cancelada: no se puede registrar asistencia');
  });

  describe('sin permiso de edición (STAFF)', () => {
    beforeEach(async () => {
      role.set('STAFF');
      await render();
    });

    it('no muestra acciones de cambio en la tabla ni en el detalle', async () => {
      expect(el().querySelectorAll('[data-testid="row-status-action"]')).toHaveLength(0);
      await openDetail('r1');
      expect(el().querySelector('[data-testid="detail-status-CONFIRMED"]')).toBeNull();
      expect(el().textContent).toContain('Solo un Super Admin puede cambiar el estado');
    });

    it('ignora intentos programáticos', async () => {
      page.openStatusMenu(new MouseEvent('click'), page.attendees()[0]);
      expect(page.statusMenuItems()).toEqual([]);
      await page.changeStatus(page.attendees()[0], 'CONFIRMED');
      expect(registrationsRepo.updateStatus).not.toHaveBeenCalled();
      expect(statusOf('r1')).toBe('PENDING');
    });

    it('el filtro sigue disponible', async () => {
      page.setFilter('status', 'CANCELLED');
      expect(visibleIds()).toEqual(['r3']);
    });
  });
});
