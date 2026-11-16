import { buildStoreImagePath, extractStoreImagePath, isPdfPath } from './store-asset-path';
import {
  buyerName,
  computeStoreOrderStats,
  correctionBlockReason,
  correctionReasonError,
  filterStoreOrders,
  hasActiveStoreOrderFilters,
  markPaidBlockReason,
  optionalReasonError,
  parseStoreOrderStatus,
  sortStoreOrders,
  storeOrderStatusLabel,
  storeOrderStatusSeverity,
  totalUnits,
} from './store-orders';
import { StoreOrder } from './store.model';

function order(o: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id: 'o1',
    eventId: 'e1',
    registrationId: 'r1',
    userId: 'u1',
    buyer: { firstName: 'Ana', lastName: 'Asistente', email: 'ana@ejemplo.test', phone: '700' },
    registrationStatus: 'CONFIRMED',
    status: 'PENDING',
    total: 220,
    paymentProofPath: 'u1/e1/a.png',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    items: [
      {
        id: 'i1',
        productId: 'p1',
        productName: 'Kit DevFest',
        unitPrice: 80,
        quantity: 2,
        subtotal: 160,
        deliveredQuantity: 0,
      },
      {
        id: 'i2',
        productId: 'p2',
        productName: 'Polera',
        unitPrice: 60,
        quantity: 1,
        subtotal: 60,
        deliveredQuantity: 0,
      },
    ],
    ...o,
  };
}

describe('store-orders', () => {
  it('normaliza estados y da etiquetas y severidades', () => {
    expect(parseStoreOrderStatus(' paid ')).toBe('PAID');
    expect(parseStoreOrderStatus('REFUNDED')).toBeNull();
    expect(storeOrderStatusLabel('PENDING')).toBe('Pendiente de pago');
    expect(storeOrderStatusLabel('PAID')).toBe('Pagada');
    expect(storeOrderStatusLabel('CANCELLED')).toBe('Anulada');
    expect(storeOrderStatusSeverity('PAID')).toBe('success');
    expect(storeOrderStatusSeverity('otro')).toBe('secondary');
  });

  it('marcar pagada: solo pendientes y nunca con la inscripción anulada', () => {
    expect(markPaidBlockReason(order())).toBeNull();
    expect(markPaidBlockReason(order({ status: 'PAID' }))).toContain('pendientes');
    expect(markPaidBlockReason(order({ registrationStatus: 'CANCELLED' }))).toContain('anulada');
  });

  it('corrección: solo desde pagada o anulada y sin entregas', () => {
    expect(correctionBlockReason(order())).toContain('ya está pendiente');
    expect(correctionBlockReason(order({ status: 'PAID' }))).toBeNull();
    expect(correctionBlockReason(order({ status: 'CANCELLED' }))).toBeNull();
    const delivered = order({ status: 'PAID' });
    delivered.items[0].deliveredQuantity = 1;
    expect(correctionBlockReason(delivered)).toContain('entregaron');
  });

  it('el motivo de corrección es obligatorio y de 10 a 500 caracteres', () => {
    expect(correctionReasonError('   ')).toContain('Indica');
    expect(correctionReasonError(' corto ')).toContain('al menos 10');
    expect(correctionReasonError('x'.repeat(501))).toContain('500');
    expect(correctionReasonError('Comprobante de otra persona')).toBeNull();
    expect(optionalReasonError('')).toBeNull();
    expect(optionalReasonError('x'.repeat(501))).toContain('500');
  });

  it('filtra por estado y busca por comprador o producto sin tildes', () => {
    const list = [
      order(),
      order({
        id: 'o2',
        status: 'PAID',
        buyer: { firstName: 'José', lastName: 'Pérez', email: 'jose@x.test', phone: null },
      }),
    ];
    expect(filterStoreOrders(list, { status: 'PAID', search: '' }).map((o) => o.id)).toEqual([
      'o2',
    ]);
    expect(
      filterStoreOrders(list, { status: 'ALL', search: 'jose perez' }).map((o) => o.id),
    ).toEqual(['o2']);
    expect(filterStoreOrders(list, { status: 'ALL', search: 'polera' })).toHaveLength(2);
    expect(filterStoreOrders(list, { status: 'ALL', search: '700' }).map((o) => o.id)).toEqual([
      'o1',
    ]);
    expect(hasActiveStoreOrderFilters({ status: 'ALL', search: ' ' })).toBe(false);
    expect(hasActiveStoreOrderFilters({ status: 'PENDING', search: '' })).toBe(true);
  });

  it('resume cantidades y montos por estado', () => {
    const stats = computeStoreOrderStats([
      order(),
      order({ id: 'o2', status: 'PAID', total: 60.5 }),
      order({ id: 'o3', status: 'PAID', total: 10.25 }),
      order({ id: 'o4', status: 'CANCELLED' }),
    ]);
    expect(stats).toEqual({
      total: 4,
      pending: 1,
      paid: 2,
      cancelled: 1,
      paidAmount: 70.75,
      pendingAmount: 220,
    });
  });

  it('ordena pendientes primero (las más antiguas antes) y luego las demás recientes', () => {
    const sorted = sortStoreOrders([
      order({ id: 'paid-new', status: 'PAID', createdAt: new Date('2026-11-12') }),
      order({ id: 'pend-new', createdAt: new Date('2026-11-11') }),
      order({ id: 'pend-old', createdAt: new Date('2026-11-09') }),
      order({ id: 'paid-old', status: 'PAID', createdAt: new Date('2026-11-01') }),
    ]);
    expect(sorted.map((o) => o.id)).toEqual(['pend-old', 'pend-new', 'paid-new', 'paid-old']);
  });

  it('nombre del comprador y unidades', () => {
    expect(buyerName(order())).toBe('Ana Asistente');
    expect(buyerName(order({ buyer: null }))).toBe('Comprador sin perfil');
    expect(totalUnits(order())).toBe(3);
  });

  it('rutas del bucket de imágenes y detección de PDF', () => {
    expect(buildStoreImagePath('e1', 'image/png', 123, 'abc')).toBe('events/e1/store/123-abc.png');
    expect(
      extractStoreImagePath(
        'http://127.0.0.1:54321/storage/v1/object/public/store-images/events/e1/store/a%20b.png?t=1',
      ),
    ).toBe('events/e1/store/a b.png');
    expect(extractStoreImagePath('https://otro.test/x.png')).toBeNull();
    expect(isPdfPath('u/e/comprobante.PDF')).toBe(true);
    expect(isPdfPath('u/e/comprobante.png')).toBe(false);
  });
});
