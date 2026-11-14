import { describe, expect, it } from 'vitest';

import { ScanFailureReason, ScanResult } from './checkin.model';
import { counterText, manualRowState, toDoorState } from './door-result';
import { markScanUndone, pushRecentScan, RecentScan } from './scan-history';

const fail = (reason: ScanFailureReason, extra: Partial<ScanResult> = {}): ScanResult => ({
  success: false,
  message: '',
  reason,
  ...extra,
});

describe('toDoorState', () => {
  it('registro exitoso es verde, se puede deshacer y dice según el modo', () => {
    const ok: ScanResult = { success: true, message: '', scanLogId: 'log-1' };
    expect(toDoorState(ok, 'checkin')).toMatchObject({
      tone: 'go',
      headline: 'Puede pasar',
      undoable: true,
    });
    expect(toDoorState(ok, 'refrigerio').headline).toBe('Entrega su refrigerio');
    expect(toDoorState(ok, 'session').headline).toBe('Puede entrar a la sesión');
  });

  it('sin id de registro no ofrece deshacer', () => {
    expect(toDoorState({ success: true, message: '' }, 'checkin').undoable).toBe(false);
  });

  it('pendiente de pago es ámbar y manda a la mesa de pagos', () => {
    const s = toDoorState(fail('pending'), 'checkin');
    expect(s.tone).toBe('wait');
    expect(s.action).toContain('mesa de pagos');
  });

  it('ya registrado es ámbar, cambia con el modo y muestra la hora', () => {
    const at = new Date(2026, 10, 20, 9, 5);
    const s = toDoorState(fail('already_scanned', { scannedAt: at }), 'refrigerio');
    expect(s.tone).toBe('wait');
    expect(s.headline).toBe('Ya recibió su refrigerio');
    expect(s.action).toContain('09:05');
  });

  it.each<[ScanFailureReason, string]>([
    ['cancelled', 'Inscripción anulada'],
    ['other_event', 'Es de otro evento'],
    ['not_found', 'QR no reconocido'],
    ['invalid_code', 'QR no reconocido'],
    ['not_in_session', 'No está inscrito en esta sesión'],
    ['error', 'No se pudo registrar'],
  ])('%s es rojo con un motivo claro', (reason, headline) => {
    const s = toDoorState(fail(reason), 'checkin');
    expect(s.tone).toBe('stop');
    expect(s.headline).toBe(headline);
    expect(s.action).not.toBe('');
    expect(s.undoable).toBe(false);
  });

  it('un fallo sin motivo conocido se trata como error rojo', () => {
    expect(toDoorState({ success: false, message: 'x' }, 'checkin').tone).toBe('stop');
  });

  it('cada estado trae ícono además del color', () => {
    const reasons: ScanFailureReason[] = ['pending', 'cancelled', 'already_scanned', 'error'];
    for (const r of reasons) expect(toDoorState(fail(r), 'checkin').icon).not.toBe('');
  });
});

describe('counterText', () => {
  const stats = { checkedInCount: 12, refrigerioCount: 3, totalRegistered: 80 };

  it('muestra "N de M ingresaron" en check-in y sesión', () => {
    expect(counterText('checkin', stats)).toBe('12 de 80 ingresaron');
    expect(counterText('session', stats)).toBe('12 de 80 ingresaron');
  });

  it('en refrigerio cuenta los refrigerios', () => {
    expect(counterText('refrigerio', stats)).toBe('3 de 80 recibieron refrigerio');
  });
});

describe('historial de registros', () => {
  const entry = (id: string): RecentScan => ({
    id,
    name: id,
    tone: 'go',
    label: 'Check-in',
    at: new Date(),
  });

  it('conserva solo los últimos 5, el más nuevo primero', () => {
    let list: RecentScan[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) list = pushRecentScan(list, entry(id));
    expect(list.map((s) => s.id)).toEqual(['f', 'e', 'd', 'c', 'b']);
  });

  it('marca un registro como deshecho sin quitarlo', () => {
    const list = markScanUndone([entry('a'), entry('b')], 'b');
    expect(list[1]).toMatchObject({ id: 'b', label: 'Deshecho', tone: 'wait' });
    expect(list[0].label).toBe('Check-in');
  });
});

describe('manualRowState', () => {
  it('una confirmada sin registrar se puede tocar', () => {
    expect(manualRowState('CONFIRMED', false, 'checkin')).toMatchObject({
      canRegister: true,
      label: 'Registrar',
    });
  });

  it('pendiente de pago no se puede tocar y explica qué hacer', () => {
    const s = manualRowState('PENDING', false, 'checkin');
    expect(s).toMatchObject({ canRegister: false, tone: 'wait', label: 'Pendiente de pago' });
    expect(s.hint).toContain('mesa de pagos');
  });

  it('anulada no se puede tocar', () => {
    const s = manualRowState('CANCELLED', false, 'checkin');
    expect(s).toMatchObject({ canRegister: false, tone: 'stop', label: 'Anulada' });
    expect(s.hint).not.toBe('');
  });

  it('confirmada ya registrada dice lo que pasó según el modo', () => {
    expect(manualRowState('CONFIRMED', true, 'refrigerio')).toMatchObject({
      canRegister: false,
      tone: 'done',
      label: 'Ya recibió su refrigerio',
    });
  });

  it('el estado no confirmado manda sobre haber sido registrado', () => {
    expect(manualRowState('PENDING', true, 'checkin').canRegister).toBe(false);
  });
});
