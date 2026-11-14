import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { signal } from '@angular/core';
import { AuthService } from '../../../../../core/auth/services/auth.service';
import { feedbackStub } from '../../../../../testing/feedback-stub';
import { AssetsRepository } from '../../../domain/assets.repository';
import { CouponsRepository } from '../../../domain/coupons.repository';
import type { Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { SessionsRepository } from '../../../domain/sessions.repository';
import { StaffAssignmentsRepository } from '../../../domain/staff-assignments.repository';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';
import { EventWorkspace } from '../event-workspace/event-workspace';
import { EventManagePage } from './event-manage-page';

const event = {
  id: 'e1',
  title: 'Demo',
  slug: 'demo',
  eventType: 'MEETUP',
  capacity: 50,
  dateStart: new Date('2026-12-12T13:00:00.000Z'),
  dateEnd: null,
  isPublished: false,
  description: null,
  imageUrl: null,
  bannerUrl: null,
  locationType: 'PHYSICAL',
  locationName: null,
  addressLink: null,
  category: null,
  extraInfo: null,
  formFields: [],
  createdAt: null,
  updatedAt: null,
} as Event;

describe('EventManagePage', () => {
  const events = {
    getEventById: vi.fn(),
    countRegistrations: vi.fn(),
    countActiveRegistrations: vi.fn(),
    getEvents: vi.fn(),
    isSlugAvailable: vi.fn(),
    update: vi.fn(),
    setPublished: vi.fn(),
  };
  const none = {
    list: vi.fn().mockResolvedValue([]),
    getRegistrationCounts: vi.fn(),
    getActiveRegistrationCounts: vi.fn(),
    getPhaseAvailability: vi.fn(),
  };
  const feedback = feedbackStub();

  beforeEach(() => {
    events.getEventById.mockResolvedValue(event);
    events.countRegistrations.mockResolvedValue(3);
    events.countActiveRegistrations.mockResolvedValue(3);
    events.getEvents.mockResolvedValue([]);
    events.isSlugAvailable.mockResolvedValue(true);
    none.getRegistrationCounts.mockResolvedValue({});
    none.getActiveRegistrationCounts.mockResolvedValue({});
    none.getPhaseAvailability.mockResolvedValue({});
    TestBed.configureTestingModule({
      imports: [EventManagePage],
      providers: [
        provideRouter([]),
        feedback,
        { provide: AuthService, useValue: { role: signal('SUPERADMIN') } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: 'e1' }),
              queryParamMap: convertToParamMap({ tab: 'datos' }),
            },
            queryParamMap: of(convertToParamMap({ tab: 'datos' })),
          },
        },
      ],
    });
    TestBed.overrideComponent(EventManagePage, {
      set: {
        providers: [
          { provide: EventsRepository, useValue: events },
          { provide: AssetsRepository, useValue: { upload: vi.fn(), remove: vi.fn() } },
          { provide: TicketTypesRepository, useValue: none },
          { provide: SessionsRepository, useValue: none },
          { provide: CouponsRepository, useValue: none },
          { provide: StaffAssignmentsRepository, useValue: none },
          EventWorkspace,
        ],
      },
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(EventManagePage);
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('Despublicar cuenta solo las inscripciones activas, no las anuladas', async () => {
    events.getEventById.mockResolvedValue({ ...event, isPublished: true });
    events.countRegistrations.mockResolvedValue(8);
    events.countActiveRegistrations.mockResolvedValue(5);
    events.setPublished.mockResolvedValue({ ...event, isPublished: false });
    const page = (await create()).componentInstance;

    await page.togglePublished();

    const { mensaje } = feedback.useValue.confirm.mock.calls.at(-1)![0] as { mensaje: string };
    expect(mensaje).toContain('Tiene 5 personas inscritas');
    expect(mensaje).not.toContain('8');
  });

  it('deja salir sin preguntar si no hay cambios', async () => {
    const page = (await create()).componentInstance;
    expect(page.dirty()).toBe(false);
    expect(await page.canLeave('/events')).toBe(true);
  });

  it('pregunta al salir con cambios y respeta "seguir editando" y "descartar"', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    const form = fixture.nativeElement.querySelector('#ev-title') as HTMLInputElement;
    form.value = 'Otro título';
    form.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(page.dirty()).toBe(true);

    const stay = page.canLeave('/events');
    expect(page.prompt.visible()).toBe(true);
    page.prompt.answer('stay');
    expect(await stay).toBe(false);

    const discard = page.canLeave('/events');
    page.prompt.answer('discard');
    expect(await discard).toBe(true);
  });

  it('no pregunta al refrescar la misma pestaña del mismo evento', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    const form = fixture.nativeElement.querySelector('#ev-title') as HTMLInputElement;
    form.value = 'Otro título';
    form.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(await page.canLeave('/events/e1/edit?tab=datos&setup=1')).toBe(true);
    expect(page.prompt.visible()).toBe(false);
  });

  it('el evento incompleto lista los pendientes en el estado de cada paso', async () => {
    const page = (await create()).componentInstance;
    expect(page.statuses().datos).toBe('pending');
    expect(page.statuses().extras).toBe('optional');
    expect(page.pendingCount()).toBeGreaterThan(0);
  });
});
