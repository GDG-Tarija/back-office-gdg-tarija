import { describe, it, expect } from 'vitest';

import {
  toDomainEvent,
  toDomainAttendee,
  toEventRow,
  parseFormFields,
  serializeFormFields,
} from './events.mapper';
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
      scan_logs: [{ id: 'scan-1', scan_type: 'checkin', scanned_at: '2026-01-01T00:00:00Z' }],
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

describe('Events Mapper - fase y monto del asistente', () => {
  const base: RegistrationWithDetailsRow = {
    id: 'r1',
    event_id: 'e1',
    user_id: 'u1',
    ticket_type_id: 't1',
    event_role: 'ATTENDEE',
    status: 'PENDING',
    created_at: '2026-11-08T10:00:00Z',
    updated_at: null,
    custom_responses: null,
    payment_proof_url: null,
    scan_logs: [],
    users: null,
    ticket_types: { id: 't1', name: 'Entrada de Pago', price: 15 },
  };

  it('usa el precio de la fase asignada y no el del paquete', () => {
    const a = toDomainAttendee({
      ...base,
      ticket_phase_id: 'p2',
      ticket_phases: { id: 'p2', name: 'Normal', price: 20 },
    });
    expect(a.phaseName).toBe('Normal');
    expect(a.phasePrice).toBe(20);
    expect(a.ticketPrice).toBe(15);
    expect(a.amountDue).toBe(20);
  });

  it('sin fase (inscripción antigua o paquete sin fases) usa el precio del paquete', () => {
    const a = toDomainAttendee({ ...base, ticket_phases: null });
    expect(a.phaseName).toBeNull();
    expect(a.phasePrice).toBeNull();
    expect(a.amountDue).toBe(15);
  });

  it('una fase gratuita no cae al precio del paquete', () => {
    const a = toDomainAttendee({
      ...base,
      ticket_phases: { id: 'p0', name: 'Early', price: 0 },
    });
    expect(a.amountDue).toBe(0);
  });

  it('con cupón el monto es 0 y se conserva el código', () => {
    const a = toDomainAttendee({
      ...base,
      coupon_id: 'c1',
      event_coupons: { code: 'INVITADO' },
      ticket_phases: { id: 'p2', name: 'Normal', price: 20 },
    });
    expect(a.amountDue).toBe(0);
    expect(a.couponId).toBe('c1');
    expect(a.couponCode).toBe('INVITADO');
  });

  it('lee la hora del check-in desde scan_logs', () => {
    const a = toDomainAttendee({
      ...base,
      scan_logs: [{ id: 's1', scan_type: 'checkin', scanned_at: '2026-11-09T15:30:00Z' }],
    });
    expect(a.checkedIn).toBe(true);
    expect(a.checkedInAt?.toISOString()).toBe('2026-11-09T15:30:00.000Z');
  });
});

describe('Events Mapper - form fields y escritura', () => {
  it('parsea form_fields tolerando datos inválidos', () => {
    const fields = parseFormFields({
      form_fields: [
        { key: 'a', label: 'A', type: 'select', required: true, options: ['x', 'y', 3] },
        { key: 'b', type: 'raro' },
        { label: 'sin key' },
        'basura',
      ],
    });
    expect(fields).toEqual([
      { key: 'a', label: 'A', type: 'select', required: true, options: ['x', 'y'] },
      { key: 'b', label: 'b', type: 'text', required: false },
    ]);
    expect(parseFormFields(null)).toEqual([]);
    expect(parseFormFields({ form_fields: 'x' })).toEqual([]);
  });

  it('serializa opciones solo para select y omite placeholder vacío', () => {
    expect(
      serializeFormFields([
        { key: 'a', label: ' A ', type: 'text', required: false, placeholder: ' ', options: ['x'] },
        { key: 'b', label: 'B', type: 'select', required: true, options: [' x ', ''] },
      ]),
    ).toEqual([
      { key: 'a', label: 'A', type: 'text', required: false },
      { key: 'b', label: 'B', type: 'select', required: true, options: ['x'] },
    ]);
  });

  it('toEventRow conserva otras claves de extra_info', () => {
    const row = toEventRow(
      {
        title: ' T ',
        slug: 't',
        eventType: 'MEETUP',
        category: '',
        locationType: 'PHYSICAL',
        locationName: null,
        addressLink: null,
        dateStart: new Date('2026-10-15T13:00:00Z'),
        dateEnd: null,
        capacity: 10,
        description: null,
        imageUrl: null,
        bannerUrl: null,
        formFields: [{ key: 'a', label: 'A', type: 'text', required: false }],
      },
      { otra: 1, form_fields: [] },
    );
    expect(row.title).toBe('T');
    expect(row.category).toBeNull();
    expect(row.date_start).toBe('2026-10-15T13:00:00.000Z');
    expect(row.extra_info).toEqual({
      otra: 1,
      form_fields: [{ key: 'a', label: 'A', type: 'text', required: false }],
    });
  });
});
