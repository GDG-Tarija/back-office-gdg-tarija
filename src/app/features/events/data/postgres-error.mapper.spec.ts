import { describe, expect, it } from 'vitest';

import { DomainError } from '../domain/domain-error';
import { errorField, toDomainError, toUserMessage } from './postgres-error.mapper';

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
    expect(a.message).toContain('inscritas');
    expect(toDomainError({ code: '23503' }, 'session').message).toContain('inscritas');
  });
  it('mapea permisos RLS', () => {
    expect(toDomainError({ code: '42501' }, 'track').code).toBe('FORBIDDEN');
  });
  it('nunca expone el mensaje crudo en errores desconocidos', () => {
    const e = toDomainError({ code: 'XX', message: 'boom: relation "x" does not exist' }, 'event');
    expect(e.message).toContain('inesperado');
    expect(e.message).not.toContain('boom');
    expect(toDomainError({}, 'event').code).toBe('UNKNOWN');
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

describe('toDomainError (otros códigos)', () => {
  it('23503 distingue borrar con dependientes de guardar con referencia rota', () => {
    const del = toDomainError(
      { code: '23503', message: 'update or delete on table "events" violates foreign key' },
      'event',
    );
    expect(del.code).toBe('HAS_REGISTRATIONS');
    const save = toDomainError(
      { code: '23503', message: 'insert or update on table "sessions" violates foreign key' },
      'session',
    );
    expect(save.code).toBe('REFERENCED');
    expect(save.message).not.toContain('No se puede eliminar');
  });
  it('mapea 23514, 22P02, 22001 y 23502 a INVALID en español', () => {
    for (const code of ['23514', '22P02', '22001', '23502']) {
      const e = toDomainError({ code, message: 'violates check constraint "x"' }, 'event');
      expect(e.code).toBe('INVALID');
      expect(e.message).not.toMatch(/violates|constraint/);
    }
    expect(toDomainError({ code: '22001' }, 'event').message).toContain('largo');
  });
  it('mapea PGRST116, sesión vencida y otros PGRST', () => {
    expect(toDomainError({ code: 'PGRST116' }, 'event').code).toBe('NOT_FOUND');
    expect(toDomainError({ code: 'PGRST301' }, 'event').message).toContain('sesión');
    const other = toDomainError({ code: 'PGRST999', message: 'JSON object requested' }, 'event');
    expect(other.message).not.toContain('JSON');
  });
  it('mapea errores de red', () => {
    const e = toDomainError({ message: 'TypeError: Failed to fetch' }, 'event');
    expect(e.code).toBe('NETWORK');
    expect(e.message).toContain('No hay conexión');
  });
  it('mapea errores de Storage por estado o texto', () => {
    expect(toDomainError({ statusCode: '413', message: 'x' }, 'asset').message).toContain(
      'demasiado grande',
    );
    expect(
      toDomainError({ message: 'mime type image/gif is not supported' }, 'asset').message,
    ).toContain('JPG');
    expect(
      toDomainError(
        { statusCode: '403', message: 'new row violates row-level security policy' },
        'asset',
      ).code,
    ).toBe('INVALID');
    expect(
      toDomainError({ statusCode: '409', message: 'The resource already exists' }, 'asset').message,
    ).toContain('Ya existe');
  });
});

describe('toUserMessage', () => {
  it('devuelve el mensaje de un DomainError conocido', () => {
    expect(toUserMessage(toDomainError({ code: '42501' }, 'track'), 'Falló.')).toContain(
      'permisos',
    );
  });
  it('traduce errores crudos de Postgres', () => {
    expect(
      toUserMessage({ code: '23505', message: 'duplicate key' }, 'Falló.', 'coupon'),
    ).toContain('cupón');
  });
  it('usa el fallback para errores desconocidos y nunca el texto crudo', () => {
    expect(toUserMessage(new Error('TypeError: x is undefined'), 'No se pudo guardar.')).toBe(
      'No se pudo guardar.',
    );
    expect(toUserMessage('algo', 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });
  it('detecta red en Error nativo', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'), 'x')).toContain('No hay conexión');
  });
});

describe('errorField', () => {
  it('devuelve el campo de un DomainError', () => {
    expect(errorField(toDomainError({ code: '23505' }, 'event'))).toBe('slug');
    expect(errorField(new Error('x'))).toBeNull();
  });
});
