import { parseStoreOrderStatus } from '../domain/store-orders';
import {
  StoreOrder,
  StoreOrderHistoryEntry,
  StoreProduct,
  StoreProductInput,
  StoreProductOrderCounts,
} from '../domain/store.model';
import {
  StoreOrderHistoryRow,
  StoreOrderRow,
  StoreProductOrderRow,
  StoreProductRow,
} from './store.dto';

const money = (value: number | string | null | undefined): number => Number(value ?? 0);

export function toDomainStoreProduct(row: StoreProductRow): StoreProduct {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    price: money(row.price),
    isActive: row.is_active,
    position: row.position,
    images: [...(row.store_product_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, url: i.url, position: i.position, altText: i.alt_text })),
  };
}

/** Productos en el orden del catálogo (posición y luego nombre). */
export function sortStoreProducts(list: StoreProduct[]): StoreProduct[] {
  return [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'es'));
}

/** Argumentos de save_store_product (la galería va en su orden final). */
export function toSaveStoreProductArgs(
  eventId: string,
  id: string | null,
  input: StoreProductInput,
): {
  p_event_id: string;
  p_product_id: string | null;
  p_name: string;
  p_description: string | null;
  p_price: number;
  p_is_active: boolean;
  p_images: { url: string; alt_text: string | null }[];
} {
  return {
    p_event_id: eventId,
    p_product_id: id,
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_price: input.price,
    p_is_active: input.isActive,
    p_images: input.images.map((i) => ({ url: i.url, alt_text: i.altText?.trim() || null })),
  };
}

export function toDomainStoreOrder(row: StoreOrderRow): StoreOrder {
  const buyer = row.buyer;
  return {
    id: row.id,
    eventId: row.event_id,
    registrationId: row.registration_id,
    userId: row.user_id,
    buyer: buyer
      ? {
          firstName: buyer.first_name ?? '',
          lastName: buyer.last_name ?? '',
          email: buyer.email ?? '',
          phone: buyer.phone ?? null,
        }
      : null,
    registrationStatus: row.registration?.status ?? null,
    status: parseStoreOrderStatus(row.status) ?? 'PENDING',
    total: money(row.total),
    paymentProofPath: row.payment_proof_path,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    createdAt: new Date(row.created_at),
    items: [...(row.store_order_items ?? [])]
      .sort((a, b) => a.product_name.localeCompare(b.product_name, 'es'))
      .map((i) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        unitPrice: money(i.unit_price),
        quantity: i.quantity,
        subtotal: i.subtotal === null ? money(i.unit_price) * i.quantity : money(i.subtotal),
        deliveredQuantity: i.delivered_quantity,
      })),
  };
}

export function toDomainStoreOrderHistory(
  row: StoreOrderHistoryRow,
  names: Record<string, string> = {},
): StoreOrderHistoryEntry {
  return {
    id: row.id,
    fromStatus: parseStoreOrderStatus(row.from_status),
    toStatus: parseStoreOrderStatus(row.to_status) ?? 'PENDING',
    reason: row.reason,
    isCorrection: row.is_correction,
    changedBy: row.changed_by,
    changedByName: row.changed_by ? (names[row.changed_by] ?? null) : null,
    changedAt: new Date(row.changed_at),
  };
}

/** Cuenta compras distintas por producto y estado, y las unidades pagadas. */
export function countOrdersByProduct(
  rows: StoreProductOrderRow[],
): Record<string, StoreProductOrderCounts> {
  const result: Record<string, StoreProductOrderCounts> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const status = parseStoreOrderStatus(row.store_orders?.status);
    if (!status) continue;
    // UNIQUE (order_id, product_id): cada fila es una compra distinta, pero se protege igual.
    const key = `${row.product_id}|${row.order_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const counts = (result[row.product_id] ??= { pending: 0, paid: 0, cancelled: 0, paidUnits: 0 });
    if (status === 'PENDING') counts.pending++;
    else if (status === 'PAID') {
      counts.paid++;
      counts.paidUnits += row.quantity;
    } else counts.cancelled++;
  }
  return result;
}
