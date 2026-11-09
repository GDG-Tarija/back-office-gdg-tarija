import { TicketPhase, TicketPhaseInput } from './ticket-phase.model';
import { PhaseSyncOp, TEMP_POSITION_OFFSET, planPhaseSync } from './ticket-phase-sync';

function phase(id: string, position: number, capacity: number | null, price = 0): TicketPhase {
  return {
    id,
    ticketTypeId: 't',
    name: id,
    position,
    price,
    capacity,
    paymentQrUrl: price > 0 ? 'qr' : null,
  };
}

function input(p: TicketPhase | null, over: Partial<TicketPhaseInput> = {}): TicketPhaseInput {
  return {
    id: p?.id ?? null,
    name: p?.name ?? 'Nueva',
    price: p?.price ?? 0,
    capacity: p?.capacity ?? null,
    paymentQrUrl: p?.paymentQrUrl ?? null,
    ...over,
  };
}

/**
 * Simula las reglas de la BD (UNIQUE posición, cupo NULL solo en la última) fila a fila.
 * Devuelve el primer error o null.
 */
function replay(existing: TicketPhase[], ops: PhaseSyncOp[]): string | null {
  const rows = existing.map((p) => ({ ...p }));
  let n = 0;
  const check = (r: { id: string; position: number; capacity: number | null }): string | null => {
    if (rows.filter((x) => x.position === r.position).length > 1) return 'unique';
    for (const o of rows) {
      if (o.id === r.id) continue;
      if (r.capacity === null && o.position > r.position) return 'null-not-last';
      if (r.capacity !== null && o.capacity === null && o.position < r.position)
        return 'null-before';
    }
    return null;
  };
  for (const op of ops) {
    if (op.kind === 'delete') {
      rows.splice(
        rows.findIndex((r) => r.id === op.id),
        1,
      );
    } else if (op.kind === 'update') {
      const r = rows.find((x) => x.id === op.id)!;
      if (op.patch.position !== undefined) r.position = op.patch.position;
      if (op.patch.capacity !== undefined) r.capacity = op.patch.capacity;
      const err = check(r);
      if (err) return err;
    } else {
      const r = { ...phase(`new${n++}`, op.position, op.input.capacity), id: `new${n}` };
      rows.push(r);
      const err = check(r);
      if (err) return err;
    }
  }
  return null;
}

describe('planPhaseSync', () => {
  const pre = phase('pre', 1, 50, 30);
  const normal = phase('normal', 2, null, 50);

  it('sin cambios no emite operaciones', () => {
    expect(planPhaseSync([pre, normal], [input(pre), input(normal)])).toEqual([]);
  });

  it('crea las fases de un paquete nuevo en orden', () => {
    const ops = planPhaseSync([], [input(null, { name: 'A', capacity: 5 }), input(null)]);
    expect(ops.map((o) => (o.kind === 'insert' ? o.position : -1))).toEqual([1, 2]);
  });

  it('borra las fases que ya no están', () => {
    expect(planPhaseSync([pre, normal], [input(pre)])).toContainEqual({
      kind: 'delete',
      id: 'normal',
    });
  });

  it('precio y QR viajan juntos en el mismo parche', () => {
    const ops = planPhaseSync(
      [pre, normal],
      [input(pre, { paymentQrUrl: 'nuevo' }), input(normal)],
    );
    expect(ops).toEqual([
      { kind: 'update', id: 'pre', patch: { price: 30, paymentQrUrl: 'nuevo' } },
    ]);
  });

  it('insertar una fase en medio respeta las reglas de la BD', () => {
    const mid = input(null, { name: 'Mid', capacity: 20 });
    const ops = planPhaseSync([pre, normal], [input(pre), mid, input(normal)]);
    expect(replay([pre, normal], ops)).toBeNull();
    expect(ops.some((o) => o.kind === 'insert' && o.position === 2)).toBe(true);
  });

  it('reordenar dos fases con cupo no choca con UNIQUE', () => {
    const a = phase('a', 1, 10);
    const b = phase('b', 2, 20);
    const c = phase('c', 3, null);
    const ops = planPhaseSync([a, b, c], [input(b), input(a), input(c)]);
    expect(replay([a, b, c], ops)).toBeNull();
    const positions = ops.flatMap((o) => (o.kind === 'update' ? [o.patch.position] : []));
    expect(positions.some((p) => p !== undefined && p >= TEMP_POSITION_OFFSET)).toBe(true);
  });

  it('la fase ilimitada pasa a limitada y otra queda ilimitada al final', () => {
    // [pre(50), normal(null)] -> [normal(80), pre(null)]
    const ops = planPhaseSync(
      [pre, normal],
      [input(normal, { capacity: 80 }), input(pre, { capacity: null })],
    );
    expect(replay([pre, normal], ops)).toBeNull();
  });

  it('quitar la intermedia y añadir una ilimitada nueva al final', () => {
    const a = phase('a', 1, 10);
    const b = phase('b', 2, 20);
    const ops = planPhaseSync([a, b], [input(a), input(null, { capacity: null })]);
    expect(replay([a, b], ops)).toBeNull();
  });

  it('dar cupo a la ilimitada actual antes de añadir otra ilimitada', () => {
    const ops = planPhaseSync(
      [pre, normal],
      [input(pre), input(normal, { capacity: 100 }), input(null, { capacity: null })],
    );
    expect(replay([pre, normal], ops)).toBeNull();
  });
});
