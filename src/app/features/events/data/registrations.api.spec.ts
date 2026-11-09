import { TestBed } from '@angular/core/testing';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { DomainError } from '../domain/domain-error';
import { RegistrationStatus } from '../domain/registration-status';
import { RegistrationsApi } from './registrations.api';

interface Result {
  data: unknown;
  error: unknown;
}

/** Simula la cadena from().update().eq().select().maybeSingle() de supabase-js. */
function fakeSupabase(result: Result) {
  const chain = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  const from = vi.fn().mockReturnValue(chain);
  return { client: { from }, from, chain };
}

describe('RegistrationsApi.updateStatus', () => {
  function setup(result: Result) {
    const fake = fakeSupabase(result);
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: fake.client }],
    });
    return { api: TestBed.inject(RegistrationsApi), ...fake };
  }

  it('envía solo `status`, filtra por id y devuelve lo guardado', async () => {
    const { api, from, chain } = setup({
      data: { id: 'r1', status: 'CONFIRMED', updated_at: '2026-11-07T10:00:00Z' },
      error: null,
    });

    const saved = await api.updateStatus('r1', 'CONFIRMED');

    expect(from).toHaveBeenCalledWith('registrations');
    expect(chain.update).toHaveBeenCalledWith({ status: 'CONFIRMED' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'r1');
    expect(saved).toEqual({
      id: 'r1',
      status: 'CONFIRMED',
      updatedAt: new Date('2026-11-07T10:00:00Z'),
    });
  });

  it.each<RegistrationStatus>(['PENDING', 'CANCELLED'])('persiste %s', async (status) => {
    const { api, chain } = setup({ data: { id: 'r1', status, updated_at: null }, error: null });
    await expect(api.updateStatus('r1', status)).resolves.toMatchObject({ status });
    expect(chain.update).toHaveBeenCalledWith({ status });
  });

  it('rechaza un estado no válido sin llamar a la BD', async () => {
    const { api, from } = setup({ data: null, error: null });
    await expect(api.updateStatus('r1', 'PAID' as RegistrationStatus)).rejects.toMatchObject({
      code: 'INVALID',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('0 filas actualizadas (RLS) es un error, no un éxito', async () => {
    const { api } = setup({ data: null, error: null });
    const err = await api.updateStatus('r1', 'CONFIRMED').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('traduce errores de Postgres a DomainError', async () => {
    const { api } = setup({
      data: null,
      error: { code: '42501', message: 'permission denied for table registrations' },
    });
    await expect(api.updateStatus('r1', 'CANCELLED')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tienes permisos para realizar esta acción.',
    });
  });

  it('propaga el mensaje de un error desconocido (p. ej. CHECK)', async () => {
    const { api } = setup({
      data: null,
      error: { code: '23514', message: 'violates check constraint "registrations_status_check"' },
    });
    await expect(api.updateStatus('r1', 'PENDING')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('desconfía de una respuesta con un estado distinto al pedido', async () => {
    const { api } = setup({ data: { id: 'r1', status: 'PENDING', updated_at: null }, error: null });
    await expect(api.updateStatus('r1', 'CONFIRMED')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});
