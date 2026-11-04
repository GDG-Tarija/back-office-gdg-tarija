import { Coupon, CouponInput, CouponRole } from './coupon.model';
import { normalizeCouponCode } from './event-validators';

/** Valor del formulario de cupón: números como texto para inputs nativos. */
export interface CouponFormValue {
  code: string;
  role: CouponRole;
  maxUses: string;
}

export function emptyCouponFormValue(): CouponFormValue {
  return { code: '', role: 'ATTENDEE', maxUses: '1' };
}

export function couponToFormValue(c: Coupon): CouponFormValue {
  return { code: c.code, role: c.role, maxUses: String(c.maxUses) };
}

/** Texto no numérico produce NaN para que el validador lo rechace. */
export function formValueToCouponInput(v: CouponFormValue): CouponInput {
  const text = v.maxUses.trim();
  return {
    code: normalizeCouponCode(v.code),
    role: v.role,
    maxUses: text === '' ? NaN : Number(text),
  };
}

export const COUPON_ROLE_LABELS: Record<CouponRole, string> = {
  ATTENDEE: 'Asistente',
  SPEAKER: 'Speaker',
  SPONSOR: 'Sponsor',
  STAFF: 'Staff',
};

export function couponRemaining(c: Pick<Coupon, 'maxUses' | 'usedCount'>): number {
  return Math.max(0, c.maxUses - c.usedCount);
}

/** Decisión segura: un cupón usado no se elimina (ON DELETE SET NULL dejaría inscripciones sin cupón). */
export function couponDeleteBlockReason(usedCount: number): string | null {
  return usedCount > 0
    ? `No se puede eliminar: ya se usó ${usedCount} vez/veces. Puedes reducir sus usos máximos para cerrarlo.`
    : null;
}

// Sin 0/O/1/I/L para evitar confusiones al dictar o leer el código.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** `random` devuelve un entero en [0, max); inyectable para tests. */
export function generateCouponCode(
  random: (max: number) => number = cryptoRandomInt,
  length = 8,
): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return out;
}

function cryptoRandomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max; // evita sesgo de módulo
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}
