import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { DomainError } from '../domain/domain-error';
import { PROOF_URL_TTL_SECONDS, STORE_PROOFS_BUCKET } from '../domain/store-asset-path';
import { StoreOrdersRepository } from '../domain/store.repository';
import { StoreOrder, StoreOrderHistoryEntry, StoreOrderStatus } from '../domain/store.model';
import { toDomainError } from './postgres-error.mapper';
import { STORE_ORDER_SELECT, StoreOrderHistoryRow, StoreOrderRow } from './store.dto';
import { toDomainStoreOrder, toDomainStoreOrderHistory } from './store.mapper';

const PAGE_SIZE = 1000;

@Injectable({ providedIn: 'root' })
export class StoreOrdersApi implements StoreOrdersRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<StoreOrder[]> {
    // PostgREST corta en 1000 filas (max_rows): se pagina con range() y orden estable.
    const rows: StoreOrderRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase
        .from('store_orders')
        .select(STORE_ORDER_SELECT)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw toDomainError(error, 'store_order');
      const page = (data ?? []) as unknown as StoreOrderRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows.map(toDomainStoreOrder);
  }

  async getHistory(orderId: string): Promise<StoreOrderHistoryEntry[]> {
    const { data, error } = await this.supabase
      .from('store_order_status_history')
      .select('id, from_status, to_status, reason, is_correction, changed_by, changed_at')
      .eq('order_id', orderId)
      .order('id', { ascending: true });
    if (error) throw toDomainError(error, 'store_order');
    const rows = (data ?? []) as StoreOrderHistoryRow[];
    const names = await this.resolveNames(rows.map((r) => r.changed_by));
    return rows.map((r) => toDomainStoreOrderHistory(r, names));
  }

  async setStatus(
    orderId: string,
    status: StoreOrderStatus,
    reason: string | null,
  ): Promise<StoreOrder> {
    const { error } = await this.supabase.rpc('set_store_order_status', {
      p_order_id: orderId,
      p_status: status,
      p_reason: reason?.trim() || undefined,
    });
    if (error) throw toDomainError(error, 'store_order');
    const { data, error: readError } = await this.supabase
      .from('store_orders')
      .select(STORE_ORDER_SELECT)
      .eq('id', orderId)
      .single();
    if (readError) throw toDomainError(readError, 'store_order');
    const saved = toDomainStoreOrder(data as unknown as StoreOrderRow);
    if (saved.status !== status) {
      throw new DomainError(
        'La base de datos no confirmó el nuevo estado. Recarga la página e inténtalo de nuevo.',
        'UNKNOWN',
      );
    }
    return saved;
  }

  async getProofUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(STORE_PROOFS_BUCKET)
      .createSignedUrl(path, PROOF_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new DomainError(
        'No se pudo abrir el comprobante. Puede que el archivo ya no exista o que no tengas permisos.',
        'NOT_FOUND',
      );
    }
    return data.signedUrl;
  }

  /** Nombre (o correo) de quien cambió el estado; si no se puede leer, se omite. */
  private async resolveNames(ids: (string | null)[]): Promise<Record<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return {};
    const { data, error } = await this.supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .in('id', unique);
    if (error || !data) return {};
    return Object.fromEntries(
      data.map((u) => [u.id, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email]),
    );
  }
}
