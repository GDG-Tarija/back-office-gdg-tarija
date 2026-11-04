import { Coupon } from './coupon.model';
import {
  couponDeleteBlockReason,
  couponRemaining,
  couponToFormValue,
  emptyCouponFormValue,
  formValueToCouponInput,
  generateCouponCode,
} from './coupon-form';
import { validateCoupon } from './event-validators';

const coupon: Coupon = {
  id: 'c1',
  eventId: 'e1',
  code: 'GDG2026',
  role: 'SPEAKER',
  maxUses: 5,
  usedCount: 2,
};

describe('coupon-form', () => {
  it('normaliza el código a mayúsculas y convierte usos', () => {
    expect(formValueToCouponInput({ code: '  gdg-26 ', role: 'STAFF', maxUses: ' 3 ' })).toEqual({
      code: 'GDG-26',
      role: 'STAFF',
      maxUses: 3,
    });
  });

  it('usos vacíos o no numéricos dan NaN y el validador los rechaza', () => {
    for (const maxUses of ['', 'abc', '1.5', '0']) {
      const input = formValueToCouponInput({ ...emptyCouponFormValue(), code: 'ABC', maxUses });
      expect(validateCoupon(input, { otherCodes: [] }).errors.map((e) => e.field)).toContain(
        'maxUses',
      );
    }
  });

  it('rechaza usos menores a los ya usados y duplicados', () => {
    const input = formValueToCouponInput({ ...couponToFormValue(coupon), maxUses: '1' });
    expect(validateCoupon(input, { otherCodes: [], usedCount: 2 }).errors[0].field).toBe('maxUses');
    const dup = formValueToCouponInput({ ...couponToFormValue(coupon), code: 'otro' });
    expect(validateCoupon(dup, { otherCodes: ['OTRO'] }).errors[0].field).toBe('code');
  });

  it('calcula usos restantes sin bajar de 0', () => {
    expect(couponRemaining(coupon)).toBe(3);
    expect(couponRemaining({ maxUses: 1, usedCount: 4 })).toBe(0);
  });

  it('bloquea el borrado si hay usos', () => {
    expect(couponDeleteBlockReason(0)).toBeNull();
    expect(couponDeleteBlockReason(2)).toContain('2');
  });

  it('genera códigos válidos de 8 caracteres', () => {
    const code = generateCouponCode();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(generateCouponCode(() => 0)).toBe('AAAAAAAA');
    expect(
      validateCoupon({ code, role: 'ATTENDEE', maxUses: 1 }, { otherCodes: [] }).errors,
    ).toEqual([]);
  });
});
