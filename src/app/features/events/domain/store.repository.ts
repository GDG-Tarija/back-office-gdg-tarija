import {
  StoreOrder,
  StoreOrderHistoryEntry,
  StoreOrderStatus,
  StoreProduct,
  StoreProductInput,
  StoreProductOrderCounts,
} from './store.model';

export abstract class StoreProductsRepository {
  abstract list(eventId: string): Promise<StoreProduct[]>;
  /** Compras por producto y estado (incluye anuladas: bloquean el borrado). */
  abstract getOrderCounts(eventId: string): Promise<Record<string, StoreProductOrderCounts>>;
  /** Crea (id null) o actualiza un producto y reemplaza su galería de forma atómica. */
  abstract save(
    eventId: string,
    id: string | null,
    input: StoreProductInput,
  ): Promise<StoreProduct>;
  abstract setActive(id: string, isActive: boolean): Promise<StoreProduct>;
  /** Falla con DomainError(HAS_REGISTRATIONS) si el producto tiene compras. */
  abstract delete(id: string): Promise<void>;
  /** QR de pago de la tienda (uno por evento, monto libre). */
  abstract getPaymentQr(eventId: string): Promise<string | null>;
  abstract setPaymentQr(eventId: string, url: string | null): Promise<void>;
}

export abstract class StoreOrdersRepository {
  /** Compras del evento con comprador, ítems y estado de la inscripción. */
  abstract list(eventId: string): Promise<StoreOrder[]>;
  abstract getHistory(orderId: string): Promise<StoreOrderHistoryEntry[]>;
  /**
   * Único camino para cambiar el estado (RPC solo SUPERADMIN). El motivo es obligatorio en una
   * corrección (PAID | CANCELLED -> PENDING) y opcional en la revisión normal.
   */
  abstract setStatus(
    orderId: string,
    status: StoreOrderStatus,
    reason: string | null,
  ): Promise<StoreOrder>;
  /** URL firmada de corta duración para ver el comprobante privado. */
  abstract getProofUrl(path: string): Promise<string>;
}

/** Imágenes de productos en el bucket público `store-images`. */
export abstract class StoreImagesRepository {
  /** Sube el archivo y devuelve la URL pública. */
  abstract upload(file: File, eventId: string): Promise<string>;
  /** Elimina por URL pública; no falla si la URL no es del bucket. */
  abstract remove(url: string): Promise<void>;
}
