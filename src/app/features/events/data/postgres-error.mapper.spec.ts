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
