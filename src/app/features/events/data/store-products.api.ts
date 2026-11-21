import { Injectable, inject } from '@angular/core';

import { Database, SUPABASE } from '../../../core/supabase/supabase.client';
import { DomainError } from '../domain/domain-error';
import { StoreProductsRepository } from '../domain/store.repository';
import { StoreProduct, StoreProductInput, StoreProductOrderCounts } from '../domain/store.model';
import { toDomainError } from './postgres-error.mapper';
import { STORE_PRODUCT_SELECT, StoreProductOrderRow, StoreProductRow } from './store.dto';
import {
  countOrdersByProduct,
  sortStoreProducts,
  toDomainStoreProduct,
  toSaveStoreProductArgs,
} from './store.mapper';

type SaveStoreProductArgs = Database['public']['Functions']['save_store_product']['Args'];

const PAGE_SIZE = 1000;

@Injectable({ providedIn: 'root' })
export class StoreProductsApi implements StoreProductsRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<StoreProduct[]> {
    const { data, error } = await this.supabase
      .from('store_products')
      .select(STORE_PRODUCT_SELECT)
      .eq('event_id', eventId);
    if (error) throw toDomainError(error, 'store_product');
    return sortStoreProducts(
      ((data ?? []) as unknown as StoreProductRow[]).map(toDomainStoreProduct),
    );
  }

  async getOrderCounts(eventId: string): Promise<Record<string, StoreProductOrderCounts>> {
    // PostgREST corta en 1000 filas (max_rows): se pagina con range() y orden estable.
    const rows: StoreProductOrderRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase
        .from('store_order_items')
        .select('product_id, order_id, quantity, store_orders!inner(status, event_id)')
        .eq('store_orders.event_id', eventId)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw toDomainError(error, 'store_product');
      const page = (data ?? []) as unknown as StoreProductOrderRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return countOrdersByProduct(rows);
  }

  async save(eventId: string, id: string | null, input: StoreProductInput): Promise<StoreProduct> {
    // El generador no marca como nulos/arrays los argumentos que la función sí acepta.
    const args = toSaveStoreProductArgs(eventId, id, input) as unknown as SaveStoreProductArgs;
    const { data, error } = await this.supabase.rpc('save_store_product', args);
    if (error) throw toDomainError(error, 'store_product');
    // El RPC es atómico, pero la relectura va aparte: si falla, el producto ya puede estar guardado.
    return this.getById(data as string);
  }

  async setActive(id: string, isActive: boolean): Promise<StoreProduct> {
    const { data, error } = await this.supabase
      .from('store_products')
      .update({ is_active: isActive })
      .eq('id', id)
      .select(STORE_PRODUCT_SELECT)
      .maybeSingle();
    if (error) throw toDomainError(error, 'store_product');
    if (!data) throw this.notUpdated();
    return toDomainStoreProduct(data as unknown as StoreProductRow);
  }

  async delete(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('store_products')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw toDomainError(error, 'store_product');
    // RLS no lanza error al filtrar un DELETE: 0 filas no es un éxito.
    if (!data?.length) throw this.notUpdated();
  }

  async getPaymentQr(eventId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('events')
      .select('store_payment_qr_url')
      .eq('id', eventId)
      .maybeSingle();
    if (error) throw toDomainError(error, 'event');
    return data?.store_payment_qr_url ?? null;
  }

  async setPaymentQr(eventId: string, url: string | null): Promise<void> {
    const { data, error } = await this.supabase
      .from('events')
      .update({ store_payment_qr_url: url?.trim() || null })
      .eq('id', eventId)
      .select('id');
    if (error) throw toDomainError(error, 'event');
    if (!data?.length) throw this.notUpdated();
  }

  private async getById(id: string): Promise<StoreProduct> {
    const { data, error } = await this.supabase
      .from('store_products')
      .select(STORE_PRODUCT_SELECT)
      .eq('id', id)
      .single();
    if (error) throw toDomainError(error, 'store_product');
    return toDomainStoreProduct(data as unknown as StoreProductRow);
  }

  private notUpdated(): DomainError {
    return new DomainError(
      'No se pudo guardar: no tienes permisos o el producto ya no existe. Recarga la página.',
      'FORBIDDEN',
    );
  }
}
