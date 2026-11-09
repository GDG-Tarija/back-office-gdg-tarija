import { describe, expect, it } from 'vitest';

import { DomainError } from '../domain/domain-error';
import { toDomainError } from './postgres-error.mapper';

describe('toDomainError', () => {
  it('mapea 23505 a mensaje de duplicado por contexto', () => {
    const e = toDomainError({ code: '23505' }, 'event');
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('DUPLICATE');
    expect(e.field).toBe('slug');
    expect(e.message).toContain('slug');
    expect(toDomainError({ code: '23505' }, 'ticket_type').message).toContain('paquete');
    expect(toDomainError({ code: '23505' }, 'coupon').field).toBe('code');
  });
  it('mapea restrict_violation y FK a "tiene inscritos"', () => {
    const a = toDomainError({ code: '23001' }, 'event');
    expect(a.code).toBe('HAS_REGISTRATIONS');
    expect(a.message).toContain('inscritos');
    expect(toDomainError({ code: '23503' }, 'session').message).toContain('inscritos');
  });
  it('mapea permisos RLS', () => {
    expect(toDomainError({ code: '42501' }, 'track').code).toBe('FORBIDDEN');
  });
  it('conserva el mensaje en errores desconocidos y usa uno por defecto si falta', () => {
    expect(toDomainError({ code: 'XX', message: 'boom' }, 'event').message).toBe('boom');
    expect(toDomainError({}, 'event').message).toContain('inesperado');
  });
});

describe('toDomainError (fases y cupo)', () => {
  it('mapea P0010 a SOLD_OUT conservando el mensaje del servidor', () => {
    const e = toDomainError(
      { code: 'P0010', message: 'Se agotó el cupo de todas las fases de este paquete.' },
      'ticket_type',
    );
    expect(e.code).toBe('SOLD_OUT');
    expect(e.message).toContain('Se agotó');
    expect(toDomainError({ code: 'P0010' }, 'ticket_type').message).toContain('agotado');
  });
  it('mapea P0011 (fase ajena)', () => {
    expect(toDomainError({ code: 'P0011' }, 'ticket_phase').message).toContain('fase');
  });
  it('restrict_violation en fases muestra el motivo del trigger', () => {
    const e = toDomainError(
      { code: '23001', message: 'No se puede eliminar la fase "Preventa": tiene inscripciones.' },
      'ticket_phase',
    );
    expect(e.code).toBe('HAS_REGISTRATIONS');
    expect(e.message).toContain('Preventa');
    expect(toDomainError({ code: '23001' }, 'ticket_phase').message).toContain('fase');
  });
});
