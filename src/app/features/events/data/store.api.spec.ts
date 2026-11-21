import { TestBed } from '@angular/core/testing';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { DomainError } from '../domain/domain-error';
import { StoreOrderRow, StoreProductRow } from './store.dto';
import { StoreOrdersApi } from './store-orders.api';
import { StoreProductsApi } from './store-products.api';

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * Cadena encadenable de supabase-js: cada método devuelve la cadena y al final (await, single,
 * maybeSingle) resuelve el siguiente resultado de la cola.
 */
function fakeSupabase(results: Result[], rpcResults: Result[] = []) {
  const queue = [...results];
  const next = () => Promise.resolve(queue.shift() ?? { data: null, error: null });
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'range', 'update', 'delete', 'insert']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    });
  }
  chain['single'] = vi.fn(next);
  chain['maybeSingle'] = vi.fn(next);
  chain['then'] = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
    next().then(resolve, reject);
  const from = vi.fn((table: string) => {
    calls.push({ method: 'from', args: [table] });
    return chain;
  });
  const rpcQueue = [...rpcResults];
  const rpc = vi.fn(() => Promise.resolve(rpcQueue.shift() ?? { data: null, error: null }));
  const createSignedUrl = vi.fn();
  const storage = { from: vi.fn(() => ({ createSignedUrl })) };
  return { client: { from, rpc, storage }, from, rpc, calls, createSignedUrl, storage };
}

const productRow: StoreProductRow = {
  id: 'p1',
  event_id: 'e1',
  name: 'Kit',
  description: null,
  price: 80,
  is_active: true,
  position: 1,
  store_product_images: [],
};

const orderRow = (status: string): StoreOrderRow => ({
  id: 'o1',
  event_id: 'e1',
  registration_id: 'r1',
  user_id: 'u1',
  status,
  total: 80,
  payment_proof_path: 'u1/e1/a.png',
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-11-10T10:00:00Z',
  store_order_items: [],
  registration: { status: 'CONFIRMED' },
  buyer: null,
});

describe('StoreProductsApi', () => {
  function setup(results: Result[], rpcResults: Result[] = []) {
    const fake = fakeSupabase(results, rpcResults);
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: fake.client }] });
    return { api: TestBed.inject(StoreProductsApi), ...fake };
  }

  it('guarda con el RPC atómico y devuelve el producto releído', async () => {
    const { api, rpc } = setup([{ data: productRow, error: null }], [{ data: 'p1', error: null }]);
    const saved = await api.save('e1', null, {
      name: 'Kit',
      description: null,
      price: 80,
      isActive: true,
      images: [{ url: 'https://x.test/1.png', altText: null }],
    });
    expect(rpc).toHaveBeenCalledWith(
      'save_store_product',
      expect.objectContaining({
        p_event_id: 'e1',
        p_product_id: null,
        p_images: [{ url: 'https://x.test/1.png', alt_text: null }],
      }),
    );
    expect(saved.id).toBe('p1');
  });

  it('traduce errores propios de la Tienda con el mensaje de la BD', async () => {
    const { api } = setup(
      [],
      [{ data: null, error: { code: 'P0056', message: 'La galería tiene imágenes repetidas.' } }],
    );
    await expect(
      api.save('e1', null, {
        name: 'Kit',
        description: null,
        price: 1,
        isActive: true,
        images: [],
      }),
    ).rejects.toMatchObject({ message: 'La galería tiene imágenes repetidas.', code: 'INVALID' });
  });

  it('nombre repetido: DomainError ligado al campo nombre', async () => {
    const { api } = setup([], [{ data: null, error: { code: '23505', message: 'duplicate key' } }]);
    await expect(
      api.save('e1', null, {
        name: 'Kit',
        description: null,
        price: 1,
        isActive: true,
        images: [],
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE', field: 'name' });
  });

  it('borrar con compras muestra el motivo del trigger', async () => {
    const { api } = setup([
      {
        data: null,
        error: {
          code: '23001',
          message:
            'No se puede eliminar el producto "Kit": tiene compras. Desactívalo en su lugar.',
        },
      },
    ]);
    await expect(api.delete('p1')).rejects.toMatchObject({
      code: 'HAS_REGISTRATIONS',
      message: expect.stringContaining('Desactívalo'),
    });
  });

  it('0 filas afectadas (RLS) no es éxito al borrar, activar ni guardar el QR', async () => {
    let { api } = setup([{ data: [], error: null }]);
    await expect(api.delete('p1')).rejects.toBeInstanceOf(DomainError);
    TestBed.resetTestingModule();
    ({ api } = setup([{ data: null, error: null }]));
    await expect(api.setActive('p1', false)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    TestBed.resetTestingModule();
    ({ api } = setup([{ data: [], error: null }]));
    await expect(api.setPaymentQr('e1', 'https://x.test/qr.png')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('cuenta compras por producto filtrando por el evento', async () => {
    const { api, calls } = setup([
      {
        data: [{ product_id: 'p1', order_id: 'o1', quantity: 2, store_orders: { status: 'PAID' } }],
        error: null,
      },
    ]);
    expect(await api.getOrderCounts('e1')).toEqual({
      p1: { pending: 0, paid: 1, cancelled: 0, paidUnits: 2 },
    });
    expect(calls).toContainEqual({ method: 'eq', args: ['store_orders.event_id', 'e1'] });
  });

  it('pagina los ítems con range() para no cortar en 1000 filas', async () => {
    const item = (i: number) => ({
      product_id: 'p1',
      order_id: `o${i}`,
      quantity: 1,
      store_orders: { status: 'PAID' },
    });
    const { api, calls } = setup([
      { data: Array.from({ length: 1000 }, (_, i) => item(i)), error: null },
      { data: [item(1000)], error: null },
    ]);
    expect((await api.getOrderCounts('e1'))['p1'].paid).toBe(1001);
    expect(calls.filter((c) => c.method === 'range').map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(calls).toContainEqual({ method: 'order', args: ['id', { ascending: true }] });
  });
});

describe('StoreOrdersApi', () => {
  function setup(results: Result[], rpcResults: Result[] = []) {
    const fake = fakeSupabase(results, rpcResults);
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: fake.client }] });
    return { api: TestBed.inject(StoreOrdersApi), ...fake };
  }

  it('lista todas las compras paginando con range() y orden estable', async () => {
    const { api, calls } = setup([
      { data: Array.from({ length: 1000 }, () => orderRow('PENDING')), error: null },
      { data: [orderRow('PAID')], error: null },
    ]);
    const orders = await api.list('e1');
    expect(orders).toHaveLength(1001);
    expect(orders.at(-1)?.status).toBe('PAID');
    expect(calls.filter((c) => c.method === 'range').map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(calls).toContainEqual({ method: 'order', args: ['id', { ascending: true }] });
  });

  it('cambia el estado solo por el RPC y pasa el motivo', async () => {
    const { api, rpc } = setup(
      [{ data: orderRow('PENDING'), error: null }],
      [{ data: {}, error: null }],
    );
    const saved = await api.setStatus('o1', 'PENDING', '  Comprobante de otra persona ');
    expect(rpc).toHaveBeenCalledWith('set_store_order_status', {
      p_order_id: 'o1',
      p_status: 'PENDING',
      p_reason: 'Comprobante de otra persona',
    });
    expect(saved.status).toBe('PENDING');
  });

  it('sin motivo no se envía uno vacío', async () => {
    const { api, rpc } = setup(
      [{ data: orderRow('PAID'), error: null }],
      [{ data: {}, error: null }],
    );
    await api.setStatus('o1', 'PAID', null);
    expect(rpc).toHaveBeenCalledWith('set_store_order_status', {
      p_order_id: 'o1',
      p_status: 'PAID',
      p_reason: undefined,
    });
  });

  it('un rechazo de la BD no se da por exitoso', async () => {
    const { api } = setup(
      [],
      [
        {
          data: null,
          error: {
            code: 'P0051',
            message: 'No se puede corregir: la compra ya tiene productos entregados.',
          },
        },
      ],
    );
    await expect(api.setStatus('o1', 'PENDING', 'Motivo suficiente')).rejects.toMatchObject({
      message: 'No se puede corregir: la compra ya tiene productos entregados.',
    });
  });

  it('desconfía si la relectura no muestra el estado pedido', async () => {
    const { api } = setup(
      [{ data: orderRow('PENDING'), error: null }],
      [{ data: {}, error: null }],
    );
    await expect(api.setStatus('o1', 'PAID', null)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('el comprobante privado se abre con una URL firmada de corta duración', async () => {
    const { api, createSignedUrl, storage } = setup([]);
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://x.test/firmada' },
      error: null,
    });
    expect(await api.getProofUrl('u1/e1/a.png')).toBe('https://x.test/firmada');
    expect(storage.from).toHaveBeenCalledWith('store-payment-proofs');
    expect(createSignedUrl).toHaveBeenCalledWith('u1/e1/a.png', 600);
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(api.getProofUrl('u1/e1/b.png')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('historial con nombres resueltos (y sin fallar si no se pueden leer)', async () => {
    const history = [
      {
        id: 1,
        from_status: null,
        to_status: 'PENDING',
        reason: null,
        is_correction: false,
        changed_by: 'u1',
        changed_at: '2026-11-10T10:00:00Z',
      },
      {
        id: 2,
        from_status: 'PENDING',
        to_status: 'PAID',
        reason: null,
        is_correction: false,
        changed_by: 'sa',
        changed_at: '2026-11-10T11:00:00Z',
      },
    ];
    const { api } = setup([
      { data: history, error: null },
      {
        data: [{ id: 'sa', first_name: 'Olivia', last_name: 'Org', email: 'o@x.test' }],
        error: null,
      },
    ]);
    const entries = await api.getHistory('o1');
    expect(entries.map((e) => e.changedByName)).toEqual([null, 'Olivia Org']);
  });
});
