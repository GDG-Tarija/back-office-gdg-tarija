import { describe, it, expect } from 'vitest';

import { toDomainEvent, toDomainAttendee } from './events.mapper';
import { EventRow, RegistrationWithDetailsRow } from './events.dto';

describe('Events Mapper', () => {
  it('should map EventRow to Domain Event', () => {
    const rawRow: EventRow = {
      id: 'event-uuid-1',
      title: 'DevFest Tarija 2026',
      slug: 'devfest-tarija-2026',
      event_type: 'CONFERENCE',
      capacity: 250,
      date_start: '2026-10-15T09:00:00Z',
      date_end: '2026-10-15T18:00:00Z',
      is_published: true,
      created_at: '2026-06-01T10:00:00Z',
      updated_at: '2026-06-02T12:00:00Z',
      description: 'Gran evento de tecnología',
      image_url: 'https://example.com/image.png',
      banner_url: 'https://example.com/banner.png',
      location_type: 'PHYSICAL',
      location_name: 'Edificio Postgrado UAJMS',
      address_link: 'https://maps.google.com/?q=UAJMS',
      category: 'Mobile / AI',
      extra_info: { form_fields: [] },
    };

    const domainEvent = toDomainEvent(rawRow);

    expect(domainEvent.id).toBe(rawRow.id);
    expect(domainEvent.title).toBe(rawRow.title);
    expect(domainEvent.slug).toBe(rawRow.slug);
    expect(domainEvent.eventType).toBe(rawRow.event_type);
    expect(domainEvent.capacity).toBe(rawRow.capacity);
    expect(domainEvent.dateStart.toISOString()).toBe(new Date(rawRow.date_start).toISOString());
    expect(domainEvent.dateEnd?.toISOString()).toBe(new Date(rawRow.date_end!).toISOString());
    expect(domainEvent.isPublished).toBe(true);
    expect(domainEvent.locationName).toBe('Edificio Postgrado UAJMS');
    expect(domainEvent.category).toBe('Mobile / AI');
  });

  it('should map RegistrationWithDetailsRow to Domain Attendee', () => {
    const rawRow: RegistrationWithDetailsRow = {
      id: 'reg-uuid-1',
      event_id: 'event-uuid-1',
      user_id: 'user-uuid-1',
      ticket_type_id: 'ticket-uuid-1',
      event_role: 'SPEAKER',
      status: 'CONFIRMED',
      created_at: '2026-06-05T15:30:00Z',
      updated_at: '2026-06-05T16:00:00Z',
      custom_responses: { t_shirt_size: 'L' },
      payment_proof_url: 'https://example.com/proof.png',
      users: {
        id: 'user-uuid-1',
        email: 'expositor@gdgtarija.org',
        first_name: 'Carlos',
        last_name: 'Pérez',
        avatar_url: 'https://lh3.googleusercontent.com/a/avatar',
        phone: '+59170000000',
      },
      ticket_types: {
        id: 'ticket-uuid-1',
        name: 'Pase Expositor',
        price: 0,
      },
      scan_logs: [{ id: 'scan-1' }],
    };

    const domainAttendee = toDomainAttendee(rawRow);

    expect(domainAttendee.id).toBe(rawRow.id);
    expect(domainAttendee.email).toBe('expositor@gdgtarija.org');
    expect(domainAttendee.firstName).toBe('Carlos');
    expect(domainAttendee.lastName).toBe('Pérez');
    expect(domainAttendee.avatarUrl).toBe('https://lh3.googleusercontent.com/a/avatar');
    expect(domainAttendee.phone).toBe('+59170000000');
    expect(domainAttendee.role).toBe('SPEAKER');
    expect(domainAttendee.status).toBe('CONFIRMED');
    expect(domainAttendee.ticketName).toBe('Pase Expositor');
    expect(domainAttendee.ticketPrice).toBe(0);
    expect(domainAttendee.registeredAt?.toISOString()).toBe(
      new Date(rawRow.created_at!).toISOString(),
    );
    expect(domainAttendee.customResponses).toEqual({ t_shirt_size: 'L' });
    expect(domainAttendee.paymentProofUrl).toBe('https://example.com/proof.png');
    expect(domainAttendee.checkedIn).toBe(true);
  });
});
