export type CouponRole = 'ATTENDEE' | 'SPEAKER' | 'SPONSOR' | 'STAFF';

export const COUPON_ROLES: readonly CouponRole[] = ['ATTENDEE', 'SPEAKER', 'SPONSOR', 'STAFF'];

export interface Coupon {
  id: string;
  eventId: string;
  code: string;
  role: CouponRole;
  maxUses: number;
  usedCount: number;
}

export type CouponInput = Pick<Coupon, 'code' | 'role' | 'maxUses'>;
