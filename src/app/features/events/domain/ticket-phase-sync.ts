import { TicketPhase, TicketPhaseInput } from './ticket-phase.model';

export interface PhaseRowPatch {
  name?: string;
  price?: number;
  paymentQrUrl?: string | null;
  capacity?: number | null;
  position?: number;
}

export type PhaseSyncOp =
  | { kind: 'delete'; id: string }
  | { kind: 'update'; id: string; patch: PhaseRowPatch }
  | { kind: 'insert'; position: number; input: TicketPhaseInput };

/** Posiciones temporales para reordenar sin chocar con UNIQUE (ticket_type_id, position). */
export const TEMP_POSITION_OFFSET = 1000;

/**
 * Convierte "fases guardadas -> fases deseadas" en operaciones ordenadas que respetan, en cada
 * paso, los triggers de la BD: UNIQUE por posición y "solo la última fase puede tener cupo NULL"
 * (validate_ticket_phase se evalúa fila a fila, sin diferirse).
 *
 * Orden: borrar -> campos (cupo solo si queda con valor) -> reordenar vía posiciones temporales
 * (la fase ilimitada se mueve primero y vuelve última) -> insertar -> cupo NULL final.
 */
export function planPhaseSync(existing: TicketPhase[], desired: TicketPhaseInput[]): PhaseSyncOp[] {
  const ops: PhaseSyncOp[] = [];
  const byId = new Map(existing.map((p) => [p.id, p]));
  const desiredIds = new Set(desired.map((d) => d.id).filter((id): id is string => !!id));

  for (const p of existing) {
    if (!desiredIds.has(p.id)) ops.push({ kind: 'delete', id: p.id });
  }

  const kept: { input: TicketPhaseInput; current: TicketPhase; position: number }[] = [];
  const inserts: { input: TicketPhaseInput; position: number }[] = [];
  desired.forEach((input, i) => {
    const current = input.id ? byId.get(input.id) : undefined;
    if (current) kept.push({ input, current, position: i + 1 });
    else inserts.push({ input, position: i + 1 });
  });

  // 1. Campos. Precio y QR viajan juntos para que el CHECK vea siempre un par coherente.
  const nullCapacityLater: { id: string }[] = [];
  for (const { input, current } of kept) {
    const patch: PhaseRowPatch = {};
    if (input.name !== current.name) patch.name = input.name;
    if (input.price !== current.price || input.paymentQrUrl !== current.paymentQrUrl) {
      patch.price = input.price;
      patch.paymentQrUrl = input.paymentQrUrl;
    }
    if (input.capacity !== current.capacity) {
      if (input.capacity === null) nullCapacityLater.push({ id: current.id });
      else patch.capacity = input.capacity;
    }
    if (Object.keys(patch).length) ops.push({ kind: 'update', id: current.id, patch });
  }

  // 2. Reordenar.
  const moved = kept.filter((k) => k.current.position !== k.position);
  if (moved.length) {
    // La fase ilimitada (cupo final null) debe quedar siempre después de las demás.
    const unlimited = kept.find((k) => k.input.capacity === null);
    const movers = unlimited && !moved.includes(unlimited) ? [unlimited, ...moved] : moved;
    const ordered = [
      ...movers.filter((k) => k === unlimited),
      ...movers.filter((k) => k !== unlimited),
    ];
    for (const k of ordered) {
      ops.push({
        kind: 'update',
        id: k.current.id,
        patch: { position: TEMP_POSITION_OFFSET + k.position },
      });
    }
    const back = [
      ...ordered.filter((k) => k !== unlimited),
      ...ordered.filter((k) => k === unlimited),
    ];
    for (const k of back) {
      ops.push({ kind: 'update', id: k.current.id, patch: { position: k.position } });
    }
  }

  // 3. Nuevas.
  for (const { input, position } of inserts) ops.push({ kind: 'insert', position, input });

  // 4. Cupo NULL al final, con la fase ya en su posición definitiva.
  for (const { id } of nullCapacityLater) {
    ops.push({ kind: 'update', id, patch: { capacity: null } });
  }
  return ops;
}
