import { describe, expect, it } from 'vitest';

import { toCouponRow, toDomainCoupon } from './coupons.mapper';
import { toDomainSession, toSessionRow } from './sessions.mapper';
import { toDomainStaffAssignment } from './staff-assignments.mapper';
import { toDomainTicketType, toTicketTypeRow } from './ticket-types.mapper';
import { toDomainTrack, toTrackRow } from './tracks.mapper';

describe('ticket-types mapper', () => {
  it('mapea fila a dominio y de vuelta', () => {
    const t = toDomainTicketType({
      id: 't1',
      event_id: 'e1',
      name: 'VIP',
      description: null,
      price: 50,
      ticket_capacity: 10,
      image_url: null,
      payment_qr_url: 'qr',
      created_at: null,
      updated_at: null,
    });
    expect(t).toMatchObject({
      id: 't1',
      eventId: 'e1',
      price: 50,
      paymentQrUrl: 'qr',
      ticketCapacity: 10,
    });
    const row = toTicketTypeRow({ ...t, name: ' VIP ' });
    expect(row.name).toBe('VIP');
    expect(row.payment_qr_url).toBe('qr');
  });
  it('descarta el QR si el precio es 0', () => {
    const row = toTicketTypeRow({
      name: 'Free',
      description: '',
      price: 0,
      ticketCapacity: null,
      imageUrl: null,
      paymentQrUrl: 'qr',
    });
    expect(row.payment_qr_url).toBeNull();
    expect(row.description).toBeNull();
  });
});

describe('tracks mapper', () => {
  it('usa columnas en español', () => {
    const t = toDomainTrack({
      id: 'k1',
      evento_id: 'e1',
      nombre: 'Web',
      descripcion: 'd',
      created_at: '',
      updated_at: '',
    });
    expect(t).toEqual({ id: 'k1', eventId: 'e1', name: 'Web', description: 'd' });
    expect(toTrackRow({ name: ' Web ', description: ' ' })).toEqual({
      nombre: 'Web',
      descripcion: null,
    });
  });
});

describe('sessions mapper', () => {
  const row = {
    id: 's1',
    event_id: 'e1',
    track_id: 'k1',
    title: 'Keynote',
    speaker: 'Ana',
    speaker_avatar_url: null,
    city: null,
    level: 'Basico' as const,
    topic: 'IA, Web ,ia',
    capacity: 50,
    date: '2026-10-15',
    start_time: '09:00:00',
    end_time: '10:30:00',
    created_at: null,
    updated_at: null,
  };
  it('recorta horas a HH:mm y separa temas', () => {
    const s = toDomainSession(row);
    expect(s.startTime).toBe('09:00');
    expect(s.endTime).toBe('10:30');
    expect(s.topics).toEqual(['IA', 'Web']);
  });
  it('serializa temas como CSV y vacíos como null', () => {
    const s = toDomainSession(row);
    expect(toSessionRow(s).topic).toBe('IA, Web');
    expect(toSessionRow({ ...s, topics: [] }).topic).toBeNull();
    expect(toDomainSession({ ...row, topic: null, start_time: null }).startTime).toBeNull();
  });
});

describe('coupons mapper', () => {
  it('añade usos y normaliza el código', () => {
    const c = toDomainCoupon(
      {
        id: 'c1',
        event_id: 'e1',
        code: 'VIP',
        role: 'STAFF',
        max_uses: 5,
        created_at: null,
        updated_at: null,
      },
      2,
    );
    expect(c).toMatchObject({ role: 'STAFF', usedCount: 2, maxUses: 5 });
    expect(toCouponRow({ code: ' vip ', role: 'STAFF', maxUses: 5 }).code).toBe('VIP');
  });
});

describe('staff-assignments mapper', () => {
  it('convierte fecha', () => {
    const s = toDomainStaffAssignment({
      id: 'a1',
      event_id: 'e1',
      staff_email: 'a@b.com',
      assigned_at: '2026-01-01T00:00:00Z',
    });
    expect(s.assignedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
