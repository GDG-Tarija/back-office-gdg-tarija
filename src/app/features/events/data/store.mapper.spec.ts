import { StoreOrderRow, StoreProductRow } from './store.dto';
import {
  countOrdersByProduct,
  sortStoreProducts,
  toDomainStoreOrder,
  toDomainStoreOrderHistory,
  toDomainStoreProduct,
  toSaveStoreProductArgs,
} from './store.mapper';

const productRow: StoreProductRow = {
  id: 'p1',
  event_id: 'e1',
  name: 'Kit',
  description: null,
  price: 80,
  is_active: true,
  position: 2,
  store_product_images: [
    { id: 'i2', url: 'https://x.test/2.png', position: 2, alt_text: null },
    { id: 'i1', url: 'https://x.test/1.png', position: 1, alt_text: 'Frente' },
  ],
};

const orderRow: StoreOrderRow = {
  id: 'o1',
  event_id: 'e1',
  registration_id: 'r1',
  user_id: 'u1',
  status: 'PAID',
  total: 220,
  payment_proof_path: 'u1/e1/a.png',
  reviewed_by: 'sa',
  reviewed_at: '2026-11-10T12:00:00Z',
  created_at: '2026-11-10T10:00:00Z',
  store_order_items: [
    {
      id: 'i2',
      product_id: 'p2',
      product_name: 'Polera',
      unit_price: 60,
      quantity: 1,
      subtotal: 60,
      delivered_quantity: 0,
    },
    {
      id: 'i1',
      product_id: 'p1',
      product_name: 'Kit',
      unit_price: 80,
      quantity: 2,
      subtotal: 160,
      delivered_quantity: 1,
    },
  ],
  registration: { status: 'CONFIRMED' },
  buyer: { first_name: 'Ana', last_name: null, email: 'ana@x.test', phone: null },
};

describe('store.mapper', () => {
  it('producto: galería ordenada por posición', () => {
    const p = toDomainStoreProduct(productRow);
    expect(p.images.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(p.images[0].altText).toBe('Frente');
    expect(p.isActive).toBe(true);
  });

  it('productos ordenados por posición y nombre', () => {
    const a = toDomainStoreProduct({ ...productRow, id: 'a', name: 'B', position: 1 });
    const b = toDomainStoreProduct({ ...productRow, id: 'b', name: 'A', position: 1 });
    const c = toDomainStoreProduct({ ...productRow, id: 'c', name: 'A', position: 0 });
    expect(sortStoreProducts([a, b, c]).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('argumentos de save_store_product con galería y textos recortados', () => {
    expect(
      toSaveStoreProductArgs('e1', null, {
        name: ' Kit ',
        description: '  ',
        price: 80,
        isActive: false,
        images: [{ url: 'https://x.test/1.png', altText: ' ' }],
      }),
    ).toEqual({
      p_event_id: 'e1',
      p_product_id: null,
      p_name: 'Kit',
      p_description: null,
      p_price: 80,
      p_is_active: false,
      p_images: [{ url: 'https://x.test/1.png', alt_text: null }],
    });
  });

  it('compra con comprador, inscripción, ítems y fechas', () => {
    const o = toDomainStoreOrder(orderRow);
    expect(o.status).toBe('PAID');
    expect(o.buyer).toEqual({ firstName: 'Ana', lastName: '', email: 'ana@x.test', phone: null });
    expect(o.registrationStatus).toBe('CONFIRMED');
    expect(o.items.map((i) => i.productName)).toEqual(['Kit', 'Polera']);
    expect(o.items[0].deliveredQuantity).toBe(1);
    expect(o.reviewedAt).toEqual(new Date('2026-11-10T12:00:00Z'));
    expect(toDomainStoreOrder({ ...orderRow, buyer: null }).buyer).toBeNull();
  });

  it('historial con nombre de quien cambió el estado', () => {
    const h = toDomainStoreOrderHistory(
      {
        id: 3,
        from_status: 'PAID',
        to_status: 'PENDING',
        reason: 'Comprobante de otra persona',
        is_correction: true,
        changed_by: 'sa',
        changed_at: '2026-11-11T10:00:00Z',
      },
      { sa: 'Olivia Organizadora' },
    );
    expect(h).toMatchObject({
      fromStatus: 'PAID',
      toStatus: 'PENDING',
      isCorrection: true,
      changedByName: 'Olivia Organizadora',
    });
    expect(
      toDomainStoreOrderHistory({
        ...{
          id: 1,
          to_status: 'PENDING',
          reason: null,
          is_correction: false,
          changed_by: null,
          changed_at: '2026-11-11T10:00:00Z',
        },
        from_status: null,
      }).fromStatus,
    ).toBeNull();
  });

  it('cuenta compras por producto y estado, y unidades pagadas', () => {
    expect(
      countOrdersByProduct([
        { product_id: 'p1', order_id: 'o1', quantity: 2, store_orders: { status: 'PAID' } },
        { product_id: 'p1', order_id: 'o2', quantity: 1, store_orders: { status: 'PENDING' } },
        { product_id: 'p1', order_id: 'o3', quantity: 5, store_orders: { status: 'CANCELLED' } },
        { product_id: 'p2', order_id: 'o1', quantity: 3, store_orders: { status: 'PAID' } },
        { product_id: 'p2', order_id: 'o1', quantity: 3, store_orders: { status: 'PAID' } },
        { product_id: 'p3', order_id: 'o9', quantity: 1, store_orders: null },
      ]),
    ).toEqual({
      p1: { pending: 1, paid: 1, cancelled: 1, paidUnits: 2 },
      p2: { pending: 0, paid: 1, cancelled: 0, paidUnits: 3 },
    });
  });
});
