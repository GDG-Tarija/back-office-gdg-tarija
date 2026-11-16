import { StatusOption } from './registration-status';

/**
 * Tienda del evento (issue #6): productos (kits, merch, combos) y compras con un comprobante.
 * En la UI se llama "Tienda" (producto / compra) para no confundirla con los paquetes de entrada.
 */

export interface StoreProductImage {
  id: string;
  url: string;
  /** 1 = portada. */
  position: number;
  altText: string | null;
}

export interface StoreProduct {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  position: number;
  /** Ordenadas por `position`; la primera es la portada. */
  images: StoreProductImage[];
}

export interface StoreProductImageInput {
  url: string;
  altText: string | null;
}

/** Datos editables de un producto; la galería va en su orden final. */
export interface StoreProductInput {
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  images: StoreProductImageInput[];
}

/** Compras que incluyen el producto, por estado (cualquiera bloquea el borrado). */
export interface StoreProductOrderCounts {
  pending: number;
  paid: number;
  cancelled: number;
  /** Unidades en compras pagadas. */
  paidUnits: number;
}

export type StoreOrderStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export const STORE_ORDER_STATUSES: readonly StoreOrderStatus[] = ['PENDING', 'PAID', 'CANCELLED'];

export const STORE_ORDER_STATUS_OPTIONS: readonly StatusOption<StoreOrderStatus>[] = [
  {
    value: 'PENDING',
    label: 'Pendiente de pago',
    pluralLabel: 'Pendientes',
    actionLabel: 'Volver a pendiente',
    description: 'Falta verificar el comprobante.',
    icon: 'schedule',
    severity: 'warn',
    requiresConfirmation: true,
  },
  {
    value: 'PAID',
    label: 'Pagada',
    pluralLabel: 'Pagadas',
    actionLabel: 'Marcar pagada',
    description: 'El pago está verificado: los productos se pueden entregar.',
    icon: 'paid',
    severity: 'success',
    requiresConfirmation: true,
  },
  {
    value: 'CANCELLED',
    label: 'Anulada',
    pluralLabel: 'Anuladas',
    actionLabel: 'Anular',
    description: 'La compra no es válida y no se entregará.',
    icon: 'block',
    severity: 'danger',
    requiresConfirmation: true,
  },
];

export interface StoreOrderItem {
  id: string;
  productId: string;
  /** Instantánea al momento de la compra. */
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  /** Issue #9 (entrega en check-in). */
  deliveredQuantity: number;
}

export interface StoreOrderBuyer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface StoreOrder {
  id: string;
  eventId: string;
  registrationId: string;
  userId: string | null;
  buyer: StoreOrderBuyer | null;
  /** Estado de la inscripción del comprador (una anulada no se puede marcar pagada). */
  registrationStatus: string | null;
  status: StoreOrderStatus;
  total: number;
  /** Ruta en el bucket privado; se ve con una URL firmada. */
  paymentProofPath: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  items: StoreOrderItem[];
}

export interface StoreOrderHistoryEntry {
  id: number;
  fromStatus: StoreOrderStatus | null;
  toStatus: StoreOrderStatus;
  reason: string | null;
  isCorrection: boolean;
  changedBy: string | null;
  /** Nombre o correo de quien hizo el cambio, si se pudo resolver. */
  changedByName: string | null;
  changedAt: Date;
}
