/** Filas que devuelve PostgREST para la Tienda (con relaciones embebidas). */

export interface StoreProductImageRow {
  id: string;
  url: string;
  position: number;
  alt_text: string | null;
}

export interface StoreProductRow {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  position: number;
  store_product_images: StoreProductImageRow[] | null;
}

export const STORE_PRODUCT_SELECT =
  'id, event_id, name, description, price, is_active, position, store_product_images(id, url, position, alt_text)';

export interface StoreOrderItemRow {
  id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number | null;
  delivered_quantity: number;
}

export interface StoreOrderRow {
  id: string;
  event_id: string;
  registration_id: string;
  user_id: string | null;
  status: string;
  total: number;
  payment_proof_path: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  store_order_items: StoreOrderItemRow[] | null;
  registration: { status: string } | null;
  buyer: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

// Dos FK de store_orders apuntan a users (comprador y revisor): se elige la del comprador.
export const STORE_ORDER_SELECT =
  'id, event_id, registration_id, user_id, status, total, payment_proof_path, reviewed_by, reviewed_at, created_at, ' +
  'store_order_items(id, product_id, product_name, unit_price, quantity, subtotal, delivered_quantity), ' +
  'registration:registrations(status), ' +
  'buyer:users!store_orders_user_id_fkey(first_name, last_name, email, phone)';

export interface StoreOrderHistoryRow {
  id: number;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  is_correction: boolean;
  changed_by: string | null;
  changed_at: string;
}

/** Ítem con el estado de su compra, para contar compras por producto. */
export interface StoreProductOrderRow {
  product_id: string;
  order_id: string;
  quantity: number;
  store_orders: { status: string } | null;
}
