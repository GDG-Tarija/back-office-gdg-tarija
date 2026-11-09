import { TicketPhase, TicketPhaseInput } from './ticket-phase.model';
import { TicketType, TicketTypeInput } from './ticket-type.model';

/** Fase en el formulario: números como texto; `id` null = aún no guardada. */
export interface PhaseFormValue {
  id: string | null;
  name: string;
  price: string;
  capacity: string;
  paymentQrUrl: string | null;
}

/** Valor del formulario de paquete: números como texto para inputs nativos. */
export interface TicketTypeFormValue {
  name: string;
  description: string;
  price: string;
  ticketCapacity: string;
  imageUrl: string | null;
  paymentQrUrl: string | null;
  /** El paquete vende por fases; entonces precio y QR salen de las fases. */
  usesPhases: boolean;
  phases: PhaseFormValue[];
}

export function emptyPhaseFormValue(name = ''): PhaseFormValue {
  return { id: null, name, price: '0', capacity: '', paymentQrUrl: null };
}

export function phaseToFormValue(p: TicketPhase): PhaseFormValue {
  return {
    id: p.id,
    name: p.name,
    price: String(p.price),
    capacity: p.capacity === null ? '' : String(p.capacity),
    paymentQrUrl: p.paymentQrUrl,
  };
}

/** Texto no numérico produce NaN para que el validador lo rechace. */
export function formValueToPhaseInput(v: PhaseFormValue): TicketPhaseInput {
  const priceText = v.price.trim().replace(',', '.');
  const capText = v.capacity.trim();
  return {
    id: v.id,
    name: v.name,
    price: priceText === '' ? NaN : Number(priceText),
    capacity: capText === '' ? null : Number(capText),
    paymentQrUrl: v.paymentQrUrl,
  };
}

/**
 * Convierte un paquete sin fases en uno con fases: la primera hereda precio y QR del paquete
 * (así el QR subido no queda huérfano) y se añade una "Entrada normal" vacía.
 */
export function enablePhases(value: TicketTypeFormValue): TicketTypeFormValue {
  if (value.phases.length > 0) return { ...value, usesPhases: true };
  return {
    ...value,
    usesPhases: true,
    paymentQrUrl: null,
    phases: [
      { ...emptyPhaseFormValue('Preventa'), price: value.price, paymentQrUrl: value.paymentQrUrl },
      emptyPhaseFormValue('Entrada normal'),
    ],
  };
}

/** Mueve la fase `index` una posición (-1 arriba, +1 abajo); fuera de rango no hace nada. */
export function movePhase(
  phases: PhaseFormValue[],
  index: number,
  direction: -1 | 1,
): PhaseFormValue[] {
  const target = index + direction;
  if (index < 0 || index >= phases.length || target < 0 || target >= phases.length) return phases;
  const next = [...phases];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Una fase con ventas no se puede eliminar (espejo del trigger de la BD). */
export function phaseDeleteBlockReason(sold: number): string | null {
  return sold > 0 ? `No se puede quitar: tiene ${sold} inscripción(es).` : null;
}

/** Una fase gratuita no lleva QR: se descartan los QR (devueltos para limpiarlos). */
export function applyPhasePricesToQr(value: TicketTypeFormValue): {
  value: TicketTypeFormValue;
  discardedQrs: string[];
} {
  const discardedQrs: string[] = [];
  const phases = value.phases.map((p) => {
    const price = Number(p.price.trim().replace(',', '.'));
    if (p.price.trim() !== '' && price === 0 && p.paymentQrUrl) {
      discardedQrs.push(p.paymentQrUrl);
      return { ...p, paymentQrUrl: null };
    }
    return p;
  });
  return discardedQrs.length
    ? { value: { ...value, phases }, discardedQrs }
    : { value, discardedQrs };
}

export function emptyTicketTypeFormValue(): TicketTypeFormValue {
  return {
    name: '',
    description: '',
    price: '0',
    ticketCapacity: '',
    imageUrl: null,
    paymentQrUrl: null,
    usesPhases: false,
    phases: [],
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
    usesPhases: t.phases.length > 0,
    phases: t.phases.map(phaseToFormValue),
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
    phases: v.usesPhases ? v.phases.map(formValueToPhaseInput) : null,
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
