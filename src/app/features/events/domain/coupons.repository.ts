import { Coupon, CouponInput } from './coupon.model';

export abstract class CouponsRepository {
  abstract list(eventId: string): Promise<Coupon[]>;
  abstract create(eventId: string, input: CouponInput): Promise<Coupon>;
  abstract update(id: string, input: CouponInput): Promise<Coupon>;
  abstract delete(id: string): Promise<void>;
}
