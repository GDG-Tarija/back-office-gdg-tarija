import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { SUPABASE } from '../../../../../core/supabase/supabase.client';
import { CheckinRepository } from '../../../../checkin/domain/checkin.repository';
import { Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { EventsPage } from './events-page';

const event = (id: string): Event =>
  ({
    id,
    title: `Evento ${id}`,
    eventType: 'WORKSHOP',
    capacity: 50,
    dateStart: new Date('2030-01-01T14:00:00Z'),
    dateEnd: null,
    isPublished: true,
    locationName: null,
    category: null,
  }) as Event;

describe('EventsPage — alcance por rol', () => {
  const role = signal<'SUPERADMIN' | 'STAFF' | null>('SUPERADMIN');
  const eventsRepo = {
    getEvents: vi.fn(),
    countActiveRegistrationsByEvent: vi.fn(),
  };
  const checkinRepo = { getAssignedEventIds: vi.fn() };

  function createPage(): EventsPage {
    TestBed.configureTestingModule({
      imports: [EventsPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { role } },
        { provide: CheckinRepository, useValue: checkinRepo },
        // El generador de credenciales (hijo) pide el cliente, pero no se usa al listar.
        { provide: SUPABASE, useValue: {} },
      ],
    }).overrideComponent(EventsPage, {
      set: { providers: [{ provide: EventsRepository, useValue: eventsRepo }] },
    });
    return TestBed.createComponent(EventsPage).componentInstance;
  }

  beforeEach(() => {
    role.set('SUPERADMIN');
    [...Object.values(eventsRepo), ...Object.values(checkinRepo)].forEach((fn) => fn.mockReset());
    eventsRepo.getEvents.mockResolvedValue([event('a'), event('b'), event('c')]);
    eventsRepo.countActiveRegistrationsByEvent.mockResolvedValue({});
    checkinRepo.getAssignedEventIds.mockResolvedValue([]);
  });

  it('SUPERADMIN ve todos los eventos sin consultar asignaciones', async () => {
    const page = createPage();
    await page.loadEvents();

    expect(page.events().map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(checkinRepo.getAssignedEventIds).not.toHaveBeenCalled();
  });

  it('STAFF solo ve los eventos que tiene asignados', async () => {
    role.set('STAFF');
    checkinRepo.getAssignedEventIds.mockResolvedValue(['b']);
    const page = createPage();
    await page.loadEvents();

    expect(page.events().map((e) => e.id)).toEqual(['b']);
  });

  it('STAFF sin asignaciones ve la lista vacía con un mensaje claro', async () => {
    role.set('STAFF');
    const page = createPage();
    await page.loadEvents();

    expect(page.events()).toEqual([]);
    expect(page.errorMsg()).toBeNull();
  });

  it('si no se pueden leer las asignaciones de STAFF, muestra el error con reintento', async () => {
    role.set('STAFF');
    checkinRepo.getAssignedEventIds.mockRejectedValue(new Error('42501'));
    const page = createPage();
    await page.loadEvents();

    expect(page.errorMsg()).toContain('No pudimos cargar los eventos');
    expect(page.events()).toEqual([]);
  });
});
