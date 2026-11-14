import { describe, expect, it } from 'vitest';

import { countByTicketType } from './ticket-types.mapper';

describe('countByTicketType', () => {
  it('agrupa inscritos por paquete', () => {
    expect(
      countByTicketType([
        { ticket_type_id: 'a' },
        { ticket_type_id: 'b' },
        { ticket_type_id: 'a' },
      ]),
    ).toEqual({ a: 2, b: 1 });
  });

  it('con activeOnly no cuenta las anuladas', () => {
    expect(
      countByTicketType(
        [
          { ticket_type_id: 'a', status: 'CONFIRMED' },
          { ticket_type_id: 'a', status: 'CANCELLED' },
          { ticket_type_id: 'b', status: 'CANCELLED' },
        ],
        { activeOnly: true },
      ),
    ).toEqual({ a: 1 });
  });

  it('devuelve objeto vacío sin registros', () => {
    expect(countByTicketType([])).toEqual({});
  });
});
