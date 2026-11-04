import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { Coupon, CouponInput } from '../domain/coupon.model';
import { CouponsRepository } from '../domain/coupons.repository';
import { toCouponRow, toDomainCoupon } from './coupons.mapper';
import { CouponRow } from './coupons.dto';
import { toDomainError } from './postgres-error.mapper';

@Injectable({ providedIn: 'root' })
export class CouponsApi implements CouponsRepository {
  private readonly supabase = inject(SUPABASE);

  async list(eventId: string): Promise<Coupon[]> {
    const { data, error } = await this.supabase
      .from('event_coupons')
      .select('*')
      .eq('event_id', eventId)
      .order('code', { ascending: true });
    if (error) throw toDomainError(error, 'coupon');
    return Promise.all((data ?? []).map((row) => this.withUsage(row)));
  }

  async create(eventId: string, input: CouponInput): Promise<Coupon> {
    const { data, error } = await this.supabase
      .from('event_coupons')
      .insert({ ...toCouponRow(input), event_id: eventId })
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'coupon');
    return toDomainCoupon(data, 0);
  }

  async update(id: string, input: CouponInput): Promise<Coupon> {
    const { data, error } = await this.supabase
      .from('event_coupons')
      .update(toCouponRow(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw toDomainError(error, 'coupon');
    return this.withUsage(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('event_coupons').delete().eq('id', id);
    if (error) throw toDomainError(error, 'coupon');
  }

  private async withUsage(row: CouponRow): Promise<Coupon> {
    const { data, error } = await this.supabase.rpc('get_coupon_uses', { p_coupon_id: row.id });
    if (error) throw toDomainError(error, 'coupon');
    return toDomainCoupon(row, data ?? 0);
  }
}
