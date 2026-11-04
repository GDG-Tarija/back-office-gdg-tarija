import { COUPON_ROLES, Coupon, CouponInput, CouponRole } from '../domain/coupon.model';
import { normalizeCouponCode } from '../domain/event-validators';
import { CouponRow } from './coupons.dto';

export function toDomainCoupon(row: CouponRow, usedCount: number): Coupon {
  const role = COUPON_ROLES.includes(row.role as CouponRole)
    ? (row.role as CouponRole)
    : 'ATTENDEE';
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    role,
    maxUses: row.max_uses,
    usedCount,
  };
}

export function toCouponRow(input: CouponInput): { code: string; role: string; max_uses: number } {
  return { code: normalizeCouponCode(input.code), role: input.role, max_uses: input.maxUses };
}
