import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { feedbackStub } from '../../../../../testing/feedback-stub';
import { AssetsRepository } from '../../../domain/assets.repository';
import { CouponsRepository } from '../../../domain/coupons.repository';
import type { Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { SessionsRepository } from '../../../domain/sessions.repository';
import { StaffAssignmentsRepository } from '../../../domain/staff-assignments.repository';
import {
  StoreImagesRepository,
  StoreOrdersRepository,
  StoreProductsRepository,
} from '../../../domain/store.repository';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';
import { StorePage, parseStoreView } from './store-page';

registerLocaleData(localeEsBo, 'es-BO');

const event = {
  id: 'e1',
  title: 'DevFest',
  slug: 'devfest',
  eventType: 'MEETUP',
  capacity: 50,
  dateStart: new Date('2026-12-12T13:00:00.000Z'),
  dateEnd: null,
  isPublished: true,
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

describe('StorePage', () => {
  const events = { getEventById: vi.fn() };
  const products = {
    list: vi.fn(),
    getOrderCounts: vi.fn(),
    save: vi.fn(),
    setActive: vi.fn(),
    delete: vi.fn(),
    getPaymentQr: vi.fn(),
    setPaymentQr: vi.fn(),
  };
  const orders = { list: vi.fn(), getHistory: vi.fn(), setStatus: vi.fn(), getProofUrl: vi.fn() };
  const none = { list: vi.fn().mockResolvedValue([]) };

  function setup(query: Record<string, string> = {}, role = 'SUPERADMIN') {
    events.getEventById.mockReset().mockResolvedValue(event);
    products.list.mockReset().mockResolvedValue([]);
    products.getOrderCounts.mockReset().mockResolvedValue({});
    products.getPaymentQr.mockReset().mockResolvedValue(null);
    orders.list.mockReset().mockResolvedValue([]);
    TestBed.configureTestingModule({
      imports: [StorePage],
      providers: [
        provideRouter([]),
        feedbackStub(),
        { provide: AuthService, useValue: { role: signal(role) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: 'e1' }),
              queryParamMap: convertToParamMap(query),
            },
            queryParamMap: of(convertToParamMap(query)),
          },
        },
      ],
    });
    TestBed.overrideComponent(StorePage, {
      set: {
        providers: [
          { provide: EventsRepository, useValue: events },
          { provide: AssetsRepository, useValue: { upload: vi.fn(), remove: vi.fn() } },
          { provide: TicketTypesRepository, useValue: none },
          { provide: SessionsRepository, useValue: none },
          { provide: CouponsRepository, useValue: none },
          { provide: StaffAssignmentsRepository, useValue: none },
          { provide: StoreProductsRepository, useValue: products },
          { provide: StoreOrdersRepository, useValue: orders },
          { provide: StoreImagesRepository, useValue: { upload: vi.fn(), remove: vi.fn() } },
        ],
      },
    });
  }

  async function create() {
    const fixture = TestBed.createComponent(StorePage);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('la vista sale del query param y cae en productos si no es válida', () => {
    expect(parseStoreView('compras')).toBe('compras');
    expect(parseStoreView('otra')).toBe('productos');
    expect(parseStoreView(null)).toBe('productos');
  });

  it('carga el evento y monta ambas pestañas; solo la activa es visible', async () => {
    setup();
    const { el } = await create();
    expect(events.getEventById).toHaveBeenCalledWith('e1');
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(el.querySelector<HTMLElement>('#store-panel-productos')?.hidden).toBe(false);
    expect(el.querySelector<HTMLElement>('#store-panel-compras')?.hidden).toBe(true);
    expect(products.list).toHaveBeenCalled();
    expect(orders.list).toHaveBeenCalled();
  });

  it('avisa que la tienda no puede recibir compras sin QR ni productos activos', async () => {
    setup();
    const { el } = await create();
    await vi.waitFor(() => expect(el.textContent).toContain('falta el QR de pago'));
    expect(el.textContent).toContain('no hay productos activos');
  });

  it('abre directo en compras con ?vista=compras', async () => {
    setup({ vista: 'compras' });
    const { el, cmp } = await create();
    expect(cmp.view()).toBe('compras');
    expect(el.querySelector<HTMLElement>('#store-panel-compras')?.hidden).toBe(false);
  });

  it('las flechas, Inicio y Fin cambian de pestaña y actualizan la URL', async () => {
    setup();
    const { cmp } = await create();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    cmp.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }), 0);
    expect(cmp.view()).toBe('compras');
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { vista: 'compras' }, replaceUrl: true }),
    );
    cmp.onTabKeydown(new KeyboardEvent('keydown', { key: 'Home' }), 1);
    expect(cmp.view()).toBe('productos');
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { vista: null } }),
    );
    cmp.onTabKeydown(new KeyboardEvent('keydown', { key: 'End' }), 0);
    expect(cmp.view()).toBe('compras');
    cmp.onTabKeydown(new KeyboardEvent('keydown', { key: 'a' }), 1);
    expect(cmp.view()).toBe('compras');
  });

  it('el contador de pendientes aparece en la pestaña Compras', async () => {
    setup();
    const { cmp, fixture, el } = await create();
    cmp.pending.set(2);
    fixture.detectChanges();
    expect(el.querySelector('#store-tab-compras')?.textContent).toContain('2');
    expect(el.querySelector('#store-tab-compras')?.textContent).toContain('por revisar');
  });

  it('evento inexistente o error de carga muestran un mensaje con salida', async () => {
    setup();
    events.getEventById.mockResolvedValue(null);
    let { el } = await create();
    expect(el.textContent).toContain('no existe');
    expect(el.textContent).toContain('Volver a Eventos');

    TestBed.resetTestingModule();
    setup();
    events.getEventById.mockRejectedValue(new Error('x'));
    ({ el } = await create());
    expect(el.textContent).toContain('error al cargar la tienda');
  });

  it('solo SUPERADMIN gestiona las compras', async () => {
    setup({}, 'STAFF');
    const { cmp } = await create();
    expect(cmp.canManage()).toBe(false);
  });
});
