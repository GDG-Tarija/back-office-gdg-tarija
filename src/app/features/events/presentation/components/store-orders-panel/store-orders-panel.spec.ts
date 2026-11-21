import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { TestBed } from '@angular/core/testing';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { feedbackStub } from '../../../../../testing/feedback-stub';
import { DomainError } from '../../../domain/domain-error';
import { StoreOrder } from '../../../domain/store.model';
import { StoreOrdersRepository } from '../../../domain/store.repository';
import { StoreOrdersPanel } from './store-orders-panel';

registerLocaleData(localeEsBo, 'es-BO');

function order(o: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id: 'o1',
    eventId: 'e1',
    registrationId: 'r1',
    userId: 'u1',
    buyer: { firstName: 'Ana', lastName: 'Asistente', email: 'ana@ejemplo.test', phone: null },
    registrationStatus: 'CONFIRMED',
    status: 'PENDING',
    total: 130,
    paymentProofPath: 'u1/e1/a.png',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    items: [
      {
        id: 'i1',
        productId: 'p1',
        productName: 'Kit DevFest',
        unitPrice: 65,
        quantity: 2,
        subtotal: 130,
        deliveredQuantity: 0,
      },
    ],
    ...o,
  };
}

const pending = order();
const paid = order({
  id: 'o2',
  status: 'PAID',
  total: 200,
  buyer: { firstName: 'José', lastName: 'Pérez', email: 'jose@ejemplo.test', phone: null },
  createdAt: new Date('2026-11-08T10:00:00Z'),
});
const cancelled = order({ id: 'o3', status: 'CANCELLED', total: 60 });

describe('StoreOrdersPanel', () => {
  const repo = { list: vi.fn(), getHistory: vi.fn(), setStatus: vi.fn(), getProofUrl: vi.fn() };

  beforeEach(() => {
    Object.values(repo).forEach((m) => m.mockReset());
    repo.list.mockResolvedValue([paid, pending, cancelled]);
    repo.getHistory.mockResolvedValue([]);
    repo.getProofUrl.mockResolvedValue('https://x.test/firmada.png');
    TestBed.configureTestingModule({
      imports: [StoreOrdersPanel],
      providers: [feedbackStub(), { provide: StoreOrdersRepository, useValue: repo }],
    });
  });

  async function create(canManage = true) {
    const fixture = TestBed.createComponent(StoreOrdersPanel);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.componentRef.setInput('canManage', canManage);
    const pendingCounts: number[] = [];
    fixture.componentInstance.pendingChange.subscribe((n) => pendingCounts.push(n));
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, pendingCounts };
  }

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('carga las compras, resume por estado y pone las pendientes primero', async () => {
    const { cmp, fixture, pendingCounts } = await create();
    expect(repo.list).toHaveBeenCalledWith('e1');
    expect(cmp.stats()).toMatchObject({ total: 3, pending: 1, paid: 1, cancelled: 1 });
    expect(cmp.visible()[0].id).toBe('o1');
    expect(pendingCounts).toEqual([1]);
    expect(text(fixture)).toContain('Por revisar');
    expect(text(fixture)).toContain('Kit DevFest × 2');
  });

  it('filtra por estado y búsqueda, y muestra el estado vacío de filtros', async () => {
    const { cmp, fixture } = await create();
    cmp.setStatusFilter('PAID');
    expect(cmp.visible().map((o) => o.id)).toEqual(['o2']);
    expect(cmp.countFor('ALL')).toBe(3);
    expect(cmp.countFor('CANCELLED')).toBe(1);
    cmp.setStatusFilter('ALL');
    cmp.setSearch('jose perez');
    expect(cmp.visible().map((o) => o.id)).toEqual(['o2']);
    cmp.setSearch('nadie');
    fixture.detectChanges();
    expect(text(fixture)).toContain('Ninguna compra coincide');
    cmp.clearFilters();
    expect(cmp.hasFilters()).toBe(false);
    expect(cmp.visible()).toHaveLength(3);
  });

  it('estado vacío sin compras y error de carga con reintento', async () => {
    repo.list.mockResolvedValueOnce([]);
    let { fixture } = await create();
    expect(text(fixture)).toContain('Aún no hay compras');

    repo.list.mockRejectedValueOnce(new DomainError('Sin conexión con el servidor.', 'NETWORK'));
    ({ fixture } = await create());
    expect(fixture.componentInstance.loadError()).toBe('Sin conexión con el servidor.');
    expect(text(fixture)).toContain('Reintentar');
    await fixture.componentInstance.load();
    expect(fixture.componentInstance.loadError()).toBeNull();
    expect(fixture.componentInstance.orders()).toHaveLength(3);
  });

  it('abre una compra y navega dentro de la lista filtrada', async () => {
    const { cmp } = await create();
    cmp.open(pending);
    expect(cmp.selected()?.id).toBe('o1');
    expect(cmp.selectedIndex()).toBe(0);
    // Pendientes primero; luego las resueltas más recientes (o3 del 10/11 antes que o2 del 8/11).
    expect(cmp.visible().map((o) => o.id)).toEqual(['o1', 'o3', 'o2']);
    cmp.step(1);
    expect(cmp.selected()?.id).toBe('o3');
    cmp.step(1);
    cmp.step(1);
    expect(cmp.selected()?.id).toBe('o2');
    cmp.step(-1);
    expect(cmp.selected()?.id).toBe('o3');
    cmp.close();
    expect(cmp.selected()).toBeNull();
  });

  it('marcar pagada actualiza la lista, el contador y avisa', async () => {
    const { cmp, pendingCounts } = await create();
    repo.setStatus.mockResolvedValue({ ...pending, status: 'PAID' });
    await cmp.changeStatus({ order: pending, status: 'PAID', reason: null });
    expect(repo.setStatus).toHaveBeenCalledWith('o1', 'PAID', null);
    expect(cmp.orders().find((o) => o.id === 'o1')?.status).toBe('PAID');
    expect(pendingCounts.at(-1)).toBe(0);
    expect(TestBed.inject(FeedbackService).success).toHaveBeenCalledWith(
      'Compra marcada como pagada.',
    );
    expect(cmp.busy()).toBe(false);
  });

  it('la corrección envía el motivo dado en esa operación', async () => {
    const { cmp } = await create();
    repo.setStatus.mockResolvedValue({ ...paid, status: 'PENDING' });
    await cmp.changeStatus({
      order: paid,
      status: 'PENDING',
      reason: 'Comprobante de otra persona',
    });
    expect(repo.setStatus).toHaveBeenCalledWith('o2', 'PENDING', 'Comprobante de otra persona');
    expect(TestBed.inject(FeedbackService).success).toHaveBeenCalledWith(
      'La compra volvió a pendiente.',
    );
  });

  it('si el servidor rechaza el cambio muestra el motivo y recarga el estado real', async () => {
    const { cmp } = await create();
    repo.setStatus.mockRejectedValue(new DomainError('La compra ya no está pendiente.', 'INVALID'));
    repo.list.mockResolvedValueOnce([paid, { ...pending, status: 'CANCELLED' }, cancelled]);
    await cmp.changeStatus({ order: pending, status: 'PAID', reason: null });
    expect(cmp.actionError()).toBe('La compra ya no está pendiente.');
    expect(cmp.orders().find((o) => o.id === 'o1')?.status).toBe('CANCELLED');
    expect(TestBed.inject(FeedbackService).success).not.toHaveBeenCalled();
  });

  it('sin permiso no cambia estados', async () => {
    const { cmp } = await create(false);
    await cmp.changeStatus({ order: pending, status: 'PAID', reason: null });
    expect(repo.setStatus).not.toHaveBeenCalled();
  });

  it('los botones de revisar tienen etiqueta accesible con el comprador', async () => {
    const { fixture } = await create();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button[aria-label]'),
    ).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Revisar compra de Ana Asistente');
    expect(labels).toContain('Ver compra de José Pérez');
  });
});
