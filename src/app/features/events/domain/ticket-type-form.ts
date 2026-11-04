import { TicketType, TicketTypeInput } from './ticket-type.model';

/** Valor del formulario de paquete: números como texto para inputs nativos. */
export interface TicketTypeFormValue {
  name: string;
  description: string;
  price: string;
  ticketCapacity: string;
  imageUrl: string | null;
  paymentQrUrl: string | null;
}

export function emptyTicketTypeFormValue(): TicketTypeFormValue {
  return {
    name: '',
    description: '',
    price: '0',
    ticketCapacity: '',
    imageUrl: null,
    paymentQrUrl: null,
  };
}

export function ticketTypeToFormValue(t: TicketType): TicketTypeFormValue {
  return {
    name: t.name,
    description: t.description ?? '',
    price: String(t.price),
    ticketCapacity: t.ticketCapacity === null ? '' : String(t.ticketCapacity),
    imageUrl: t.imageUrl,
    paymentQrUrl: t.paymentQrUrl,
  };
}

/** Texto no numérico produce NaN para que el validador lo rechace. */
export function formValueToTicketTypeInput(v: TicketTypeFormValue): TicketTypeInput {
  const priceText = v.price.trim().replace(',', '.');
  const capText = v.ticketCapacity.trim();
  return {
    name: v.name,
    description: v.description.trim() || null,
    price: priceText === '' ? NaN : Number(priceText),
    ticketCapacity: capText === '' ? null : Number(capText),
    imageUrl: v.imageUrl,
    paymentQrUrl: v.paymentQrUrl,
  };
}

/** Un paquete con inscritos no se puede eliminar (espejo del FK RESTRICT). */
export function ticketDeleteBlockReason(registeredCount: number): string | null {
  return registeredCount > 0 ? `No se puede eliminar: tiene ${registeredCount} inscrito(s).` : null;
}

/** Un paquete gratuito no lleva QR: se descarta el QR (devuelto para limpiarlo). */
export function applyPriceToQr(value: TicketTypeFormValue): {
  value: TicketTypeFormValue;
  discardedQr: string | null;
} {
  const price = Number(value.price.trim().replace(',', '.'));
  if (value.price.trim() !== '' && price === 0 && value.paymentQrUrl) {
    return { value: { ...value, paymentQrUrl: null }, discardedQr: value.paymentQrUrl };
  }
  return { value, discardedQr: null };
}
