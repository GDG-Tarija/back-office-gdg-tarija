import { describe, expect, it } from 'vitest';

import { EventInput } from './event.model';
import {
  SessionSlot,
  findSessionOverlaps,
  fieldKeyFromLabel,
  fromLaPaz,
  isValid,
  isValidSlug,
  normalizeCouponCode,
  normalizeTopics,
  slugify,
  toLaPazIso,
  validateCoupon,
  validateEvent,
  validateFormFields,
  validateImageFile,
  validatePublish,
  validateSession,
  validateStaffEmail,
  validateTicketCapacities,
  validateTicketType,
  validateTrack,
} from './event-validators';
import { SessionInput } from './session.model';

const baseEvent: EventInput = {
  title: 'DevFest Tarija 2026',
  slug: 'devfest-tarija-2026',
  eventType: 'CONFERENCE',
  category: null,
  locationType: 'PHYSICAL',
  locationName: 'UAJMS',
  addressLink: 'https://maps.google.com/?q=uajms',
  dateStart: new Date('2026-10-15T13:00:00Z'),
  dateEnd: new Date('2026-10-16T22:00:00Z'),
  capacity: 200,
  description: 'Gran evento',
  imageUrl: 'https://x.test/cover.png',
  bannerUrl: null,
  formFields: [],
};

const fields = (r: { errors: { field: string }[] }) => r.errors.map((e) => e.field);

describe('slugify / isValidSlug', () => {
  it('normaliza tildes, espacios y símbolos', () => {
    expect(slugify('  ¡Build con IA: Edición 2026!  ')).toBe('build-con-ia-edicion-2026');
    expect(slugify('Ñandú & Café')).toBe('nandu-cafe');
  });
  it('valida el formato', () => {
    expect(isValidSlug('mi-evento-2026')).toBe(true);
    expect(isValidSlug('Mi-Evento')).toBe(false);
    expect(isValidSlug('mi--evento')).toBe(false);
    expect(isValidSlug('-mi-evento')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });
});

describe('zona La Paz', () => {
  it('convierte a ISO UTC sumando 4 horas', () => {
    expect(toLaPazIso('2026-10-15', '09:00')).toBe('2026-10-15T13:00:00.000Z');
    expect(toLaPazIso('2026-10-15', '22:30')).toBe('2026-10-16T02:30:00.000Z');
  });
  it('hace el camino inverso, incluso cruzando de día', () => {
    expect(fromLaPaz('2026-10-16T02:30:00Z')).toEqual({ date: '2026-10-15', time: '22:30' });
    expect(fromLaPaz(new Date('2026-10-15T03:00:00Z'))).toEqual({
      date: '2026-10-14',
      time: '23:00',
    });
  });
  it('rechaza entradas inválidas', () => {
    expect(() => toLaPazIso('2026-13-01', '09:00')).toThrow();
    expect(() => toLaPazIso('2026-10-15', '25:00')).toThrow();
  });
});

describe('validateEvent', () => {
  it('acepta un evento válido', () => {
    const r = validateEvent(baseEvent);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it('valida título, slug, capacidad y fechas', () => {
    const r = validateEvent({
      ...baseEvent,
      title: 'ab',
      slug: 'Mal Slug',
      capacity: 0,
      dateEnd: baseEvent.dateStart,
    });
    expect(fields(r)).toEqual(expect.arrayContaining(['title', 'slug', 'capacity', 'dateEnd']));
  });
  it('rechaza capacidad decimal', () => {
    expect(fields(validateEvent({ ...baseEvent, capacity: 10.5 }))).toContain('capacity');
  });
  it('detecta slug duplicado', () => {
    expect(fields(validateEvent(baseEvent, { slugTaken: true }))).toContain('slug');
  });
  it('bloquea cambiar slug si está publicado o tiene inscritos', () => {
    const changed = { ...baseEvent, slug: 'otro' };
    expect(
      fields(validateEvent(changed, { isPublished: true, originalSlug: 'devfest-tarija-2026' })),
    ).toContain('slug');
    expect(
      fields(
        validateEvent(changed, { hasRegistrations: true, originalSlug: 'devfest-tarija-2026' }),
      ),
    ).toContain('slug');
    expect(validateEvent(changed, { originalSlug: 'devfest-tarija-2026' }).errors).toEqual([]);
  });
  it('valida URL y exige enlace en VIRTUAL/HYBRID', () => {
    expect(fields(validateEvent({ ...baseEvent, addressLink: 'no-es-url' }))).toContain(
      'addressLink',
    );
    expect(
      fields(validateEvent({ ...baseEvent, locationType: 'VIRTUAL', addressLink: null })),
    ).toContain('addressLink');
    expect(
      fields(validateEvent({ ...baseEvent, locationType: 'HYBRID', addressLink: ' ' })),
    ).toContain('addressLink');
    expect(validateEvent({ ...baseEvent, addressLink: null }).errors).toEqual([]);
  });
  it('avisa al cambiar fechas o capacidad con inscritos', () => {
    const r = validateEvent(
      { ...baseEvent, capacity: 300 },
      { hasRegistrations: true, originalEvent: baseEvent },
    );
    expect(r.warnings).toHaveLength(1);
    expect(
      validateEvent(baseEvent, { hasRegistrations: true, originalEvent: baseEvent }).warnings,
    ).toEqual([]);
  });
});

describe('validateTicketType', () => {
  const free = {
    name: 'General',
    description: null,
    price: 0,
    ticketCapacity: 50,
    imageUrl: null,
    paymentQrUrl: null,
  };
  const paid = { ...free, name: 'VIP', price: 50, paymentQrUrl: 'https://x.test/qr.png' };

  it('acepta gratuito sin QR y de pago con QR', () => {
    expect(validateTicketType(free, { otherNames: [] }).errors).toEqual([]);
    expect(validateTicketType(paid, { otherNames: ['General'] }).errors).toEqual([]);
  });
  it('espeja el CHECK precio/QR', () => {
    expect(
      fields(validateTicketType({ ...paid, paymentQrUrl: null }, { otherNames: [] })),
    ).toContain('paymentQrUrl');
    expect(
      fields(
        validateTicketType({ ...free, paymentQrUrl: 'https://x.test/qr.png' }, { otherNames: [] }),
      ),
    ).toContain('paymentQrUrl');
  });
  it('valida nombre único (sin distinguir mayúsculas) y obligatorio', () => {
    expect(
      fields(validateTicketType({ ...free, name: 'general ' }, { otherNames: ['General'] })),
    ).toContain('name');
    expect(fields(validateTicketType({ ...free, name: ' ' }, { otherNames: [] }))).toContain(
      'name',
    );
  });
  it('valida precio negativo y más de 2 decimales', () => {
    expect(fields(validateTicketType({ ...free, price: -1 }, { otherNames: [] }))).toContain(
      'price',
    );
    expect(fields(validateTicketType({ ...paid, price: 10.999 }, { otherNames: [] }))).toContain(
      'price',
    );
    expect(validateTicketType({ ...paid, price: 10.5 }, { otherNames: [] }).errors).toEqual([]);
  });
  it('valida cupo y que no baje de los inscritos', () => {
    expect(
      fields(validateTicketType({ ...free, ticketCapacity: 0 }, { otherNames: [] })),
    ).toContain('ticketCapacity');
    expect(
      validateTicketType({ ...free, ticketCapacity: null }, { otherNames: [] }).errors,
    ).toEqual([]);
    expect(
      fields(
        validateTicketType({ ...free, ticketCapacity: 5 }, { otherNames: [], registeredCount: 8 }),
      ),
    ).toContain('ticketCapacity');
  });
  it('avisa al cambiar el precio con inscritos', () => {
    const r = validateTicketType(paid, { otherNames: [], registeredCount: 3, originalPrice: 30 });
    expect(r.warnings).toHaveLength(1);
  });
  it('avisa si la suma de cupos supera la capacidad', () => {
    expect(
      validateTicketCapacities(
        [{ ticketCapacity: 150 }, { ticketCapacity: 100 }, { ticketCapacity: null }],
        200,
      ).warnings,
    ).toHaveLength(1);
    expect(validateTicketCapacities([{ ticketCapacity: 100 }], 200).warnings).toEqual([]);
  });
});

describe('validateTrack', () => {
  it('exige nombre único', () => {
    expect(validateTrack({ name: 'Web' }, { otherNames: [] }).errors).toEqual([]);
    expect(fields(validateTrack({ name: '' }, { otherNames: [] }))).toContain('name');
    expect(fields(validateTrack({ name: 'web' }, { otherNames: ['Web'] }))).toContain('name');
  });
});

describe('validateSession', () => {
  const session: SessionInput = {
    trackId: 't1',
    title: 'Keynote',
    speaker: null,
    speakerAvatarUrl: null,
    city: null,
    level: 'Basico',
    topics: [],
    capacity: 100,
    date: '2026-10-15',
    startTime: '09:00',
    endTime: '10:00',
  };
  const ctx = {
    eventStart: baseEvent.dateStart,
    eventEnd: baseEvent.dateEnd,
    eventTrackIds: ['t1'],
  };

  it('acepta una sesión válida', () => {
    const r = validateSession(session, ctx);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it('valida el rango de fechas del evento en hora de La Paz', () => {
    expect(fields(validateSession({ ...session, date: '2026-10-14' }, ctx))).toContain('date');
    expect(fields(validateSession({ ...session, date: '2026-10-17' }, ctx))).toContain('date');
    expect(validateSession({ ...session, date: '2026-10-16' }, ctx).errors).toEqual([]);
  });
  it('exige título, fecha y horas coherentes', () => {
    expect(fields(validateSession({ ...session, title: ' ' }, ctx))).toContain('title');
    expect(fields(validateSession({ ...session, date: null }, ctx))).toContain('date');
    expect(fields(validateSession({ ...session, startTime: null }, ctx))).toContain('startTime');
    expect(fields(validateSession({ ...session, endTime: '09:00' }, ctx))).toContain('endTime');
    expect(fields(validateSession({ ...session, endTime: '08:00' }, ctx))).toContain('endTime');
  });
  it('valida capacidad, track y nivel', () => {
    expect(fields(validateSession({ ...session, capacity: 0 }, ctx))).toContain('capacity');
    expect(fields(validateSession({ ...session, trackId: 'ajeno' }, ctx))).toContain('trackId');
    expect(validateSession({ ...session, trackId: null }, ctx).errors).toEqual([]);
    expect(
      fields(validateSession({ ...session, level: 'Experto' as unknown as 'Basico' }, ctx)),
    ).toContain('level');
  });
  it('avisa del solape en el mismo track pero no en otro', () => {
    const other: SessionSlot = {
      id: 's2',
      title: 'Taller',
      trackId: 't1',
      date: '2026-10-15',
      startTime: '09:30',
      endTime: '10:30',
    };
    expect(validateSession(session, { ...ctx, otherSessions: [other] }).warnings).toHaveLength(1);
    expect(
      validateSession(session, { ...ctx, otherSessions: [{ ...other, trackId: 't2' }] }).warnings,
    ).toEqual([]);
    expect(
      validateSession(session, { ...ctx, otherSessions: [{ ...other, startTime: '10:00' }] })
        .warnings,
    ).toEqual([]);
    expect(
      validateSession(session, { ...ctx, otherSessions: [other], selfId: 's2' }).warnings,
    ).toEqual([]);
  });
  it('normaliza temas', () => {
    expect(normalizeTopics([' IA ', 'ia', '', 'Web'])).toEqual(['IA', 'Web']);
  });
  it('findSessionOverlaps detecta pares del mismo track y día', () => {
    const a: SessionSlot = {
      title: 'A',
      trackId: 't1',
      date: '2026-10-15',
      startTime: '09:00',
      endTime: '10:00',
    };
    const b: SessionSlot = { ...a, title: 'B', startTime: '09:59', endTime: '11:00' };
    const c: SessionSlot = { ...a, title: 'C', date: '2026-10-16' };
    expect(findSessionOverlaps([a, b, c])).toEqual([[a, b]]);
  });
});

describe('validateCoupon', () => {
  const coupon = { code: 'SPEAKER26', role: 'SPEAKER' as const, maxUses: 10 };
  it('acepta un cupón válido', () => {
    expect(validateCoupon(coupon, { otherCodes: [] }).errors).toEqual([]);
  });
  it('valida formato del código', () => {
    expect(fields(validateCoupon({ ...coupon, code: 'AB' }, { otherCodes: [] }))).toContain('code');
    expect(
      fields(validateCoupon({ ...coupon, code: 'A'.repeat(51) }, { otherCodes: [] })),
    ).toContain('code');
    expect(fields(validateCoupon({ ...coupon, code: 'MI CODIGO' }, { otherCodes: [] }))).toContain(
      'code',
    );
    expect(fields(validateCoupon({ ...coupon, code: 'minusc' }, { otherCodes: [] }))).toContain(
      'code',
    );
  });
  it('valida unicidad, usos y rol', () => {
    expect(fields(validateCoupon(coupon, { otherCodes: ['speaker26'] }))).toContain('code');
    expect(fields(validateCoupon({ ...coupon, maxUses: 0 }, { otherCodes: [] }))).toContain(
      'maxUses',
    );
    expect(
      fields(validateCoupon({ ...coupon, maxUses: 3 }, { otherCodes: [], usedCount: 5 })),
    ).toContain('maxUses');
    expect(
      fields(
        validateCoupon({ ...coupon, role: 'ADMIN' as unknown as 'STAFF' }, { otherCodes: [] }),
      ),
    ).toContain('role');
  });
  it('normaliza el código', () => {
    expect(normalizeCouponCode('  vip2026 ')).toBe('VIP2026');
  });
});

describe('validateStaffEmail', () => {
  it('valida formato y duplicados', () => {
    expect(validateStaffEmail('a@b.com', []).errors).toEqual([]);
    expect(fields(validateStaffEmail('nope', []))).toContain('staffEmail');
    expect(fields(validateStaffEmail('A@B.com', ['a@b.com']))).toContain('staffEmail');
  });
});

describe('validateFormFields', () => {
  it('acepta campos válidos', () => {
    const r = validateFormFields([
      { key: 'empresa', label: 'Empresa', type: 'text', required: true },
      { key: 'talla', label: 'Talla', type: 'select', required: false, options: ['S', 'M'] },
    ]);
    expect(r.errors).toEqual([]);
  });
  it('rechaza keys inválidas y repetidas', () => {
    const r = validateFormFields([
      { key: 'Mi Campo', label: 'A', type: 'text', required: false },
      { key: 'dup', label: 'B', type: 'text', required: false },
      { key: 'dup', label: 'C', type: 'number', required: false },
    ]);
    expect(fields(r)).toEqual(['fields[0].key', 'fields[2].key']);
  });
  it('exige label y select con al menos 2 opciones', () => {
    const r = validateFormFields([
      { key: 'a', label: ' ', type: 'text', required: false },
      { key: 'b', label: 'B', type: 'select', required: false, options: ['solo', ' '] },
    ]);
    expect(fields(r)).toEqual(['fields[0].label', 'fields[1].options']);
  });
  it('genera keys desde etiquetas', () => {
    expect(fieldKeyFromLabel('Nombre de Empresa')).toBe('nombre_de_empresa');
    expect(fieldKeyFromLabel('2do apellido')).toBe('campo_2do_apellido');
  });
});

describe('validateImageFile', () => {
  it('acepta tipos y tamaños permitidos', () => {
    expect(validateImageFile({ type: 'image/png', size: 2 * 1024 * 1024 }, 'cover').errors).toEqual(
      [],
    );
    expect(validateImageFile({ type: 'image/webp', size: 500 * 1024 }, 'qr').errors).toEqual([]);
  });
  it('rechaza tipo y exceso de tamaño', () => {
    expect(validateImageFile({ type: 'image/gif', size: 10 }, 'cover').errors).toHaveLength(1);
    expect(
      validateImageFile({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }, 'banner').errors,
    ).toHaveLength(1);
    const qr = validateImageFile({ type: 'image/png', size: 600 * 1024 }, 'avatar');
    expect(qr.errors[0].message).toContain('500 KB');
  });
});

describe('validatePublish', () => {
  const ok = {
    event: baseEvent,
    ticketTypes: [{ ticketCapacity: 100 }],
    sessions: [
      { title: 'A', trackId: null, date: '2026-10-15', startTime: '09:00', endTime: '10:00' },
    ],
  };
  it('permite publicar con todo completo', () => {
    expect(isValid(validatePublish(ok))).toBe(true);
  });
  it('bloquea sin paquetes, portada, o con form/sesiones inválidos', () => {
    const r = validatePublish({
      event: {
        ...baseEvent,
        imageUrl: null,
        formFields: [{ key: 'x', label: '', type: 'text', required: false }],
      },
      ticketTypes: [],
      sessions: [{ title: 'B', trackId: null, date: null, startTime: null, endTime: null }],
    });
    expect(fields(r)).toEqual(
      expect.arrayContaining(['ticketTypes', 'imageUrl', 'fields[0].label', 'sessions']),
    );
  });
  it('bloquea con datos del evento incompletos', () => {
    const r = validatePublish({ ...ok, event: { ...baseEvent, description: null, dateEnd: null } });
    expect(fields(r)).toContain('event');
  });
  it('emite avisos sin bloquear', () => {
    const r = validatePublish({
      ...ok,
      ticketTypes: [{ ticketCapacity: 150 }, { ticketCapacity: 150 }],
      sessions: [
        { title: 'A', trackId: 't1', date: '2026-10-15', startTime: '09:00', endTime: '10:00' },
        { title: 'B', trackId: 't1', date: '2026-10-15', startTime: '09:30', endTime: '10:30' },
      ],
    });
    expect(isValid(r)).toBe(true);
    expect(r.warnings).toHaveLength(2);
  });
});
