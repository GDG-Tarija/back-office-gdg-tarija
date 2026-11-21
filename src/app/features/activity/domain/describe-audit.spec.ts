import { AuditEntry } from './audit-entry.model';
import { actorKind, actorLabel, changeLines, describeAudit } from './describe-audit';

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: 1,
  occurredAt: new Date('2026-11-15T12:00:00Z'),
  actorId: 'admin',
  actorEmail: 'admin@gdg.test',
  actorRole: 'SUPERADMIN',
  actorName: 'Ada Admin',
  action: 'UPDATE',
  table: 'registrations',
  recordId: 'r1',
  eventId: 'e1',
  eventTitle: 'DevFest',
  subjectName: 'Ana Paz',
  changes: {},
  source: 'app',
  ...overrides,
});

const text = (overrides: Partial<AuditEntry>) => describeAudit(entry(overrides)).text;

describe('describeAudit — inscripciones', () => {
  it('distingue confirmar, desestimar, anular y restaurar', () => {
    expect(text({ changes: { status: ['PENDING', 'CONFIRMED'] } })).toBe(
      'Confirmó el pago de Ana Paz',
    );
    expect(text({ changes: { status: ['CONFIRMED', 'PENDING'] } })).toBe(
      'Desestimó el pago de Ana Paz: vuelve a pendiente de pago',
    );
    expect(text({ changes: { status: ['PENDING', 'CANCELLED'] } })).toBe(
      'Anuló la inscripción de Ana Paz',
    );
    expect(text({ changes: { status: ['CANCELLED', 'CONFIRMED'] } })).toBe(
      'Restauró la inscripción de Ana Paz como confirmada',
    );
  });

  it('una inscripción desde la web la hace la propia persona', () => {
    expect(text({ action: 'INSERT', actorRole: null })).toBe('Se inscribió');
    expect(text({ action: 'INSERT' })).toBe('Inscribió a Ana Paz');
    expect(
      text({ actorRole: null, changes: { payment_proof_url: [null, 'https://x/p.png'] } }),
    ).toBe('Subió su comprobante de pago');
  });
});

describe('describeAudit — check-in', () => {
  it('check-in, refrigerio y sesión, y sus "Deshacer"', () => {
    expect(text({ table: 'scan_logs', action: 'INSERT', changes: { scan_type: 'checkin' } })).toBe(
      'Hizo el check-in de Ana Paz',
    );
    expect(text({ table: 'scan_logs', action: 'DELETE', changes: { scan_type: 'checkin' } })).toBe(
      'Deshizo el check-in de Ana Paz',
    );
    expect(
      text({ table: 'scan_logs', action: 'INSERT', changes: { scan_type: 'refrigerio' } }),
    ).toBe('Entregó el refrigerio a Ana Paz');
    expect(
      text({ table: 'scan_logs', action: 'INSERT', changes: { scan_type: 'session_entry:abc' } }),
    ).toBe('Registró el ingreso de Ana Paz a una sesión');
  });
});

describe('describeAudit — accesos y configuración', () => {
  it('accesos al back-office con la etiqueta del rol', () => {
    const access = { table: 'staff_whitelist', subjectName: 'puerta@gdg.test' };
    expect(text({ ...access, action: 'INSERT', changes: { role: 'STAFF' } })).toBe(
      'Dio acceso a puerta@gdg.test como Staff de check-in',
    );
    expect(text({ ...access, changes: { role: ['STAFF', 'SUPERADMIN'] } })).toBe(
      'Cambió el rol de puerta@gdg.test a Superadmin',
    );
    expect(text({ ...access, action: 'DELETE' })).toBe('Quitó el acceso a puerta@gdg.test');
  });

  it('publicar, despublicar y editar con los campos que cambiaron', () => {
    const event = { table: 'events', subjectName: 'DevFest' };
    expect(text({ ...event, changes: { is_published: [false, true] } })).toBe(
      'Publicó el evento DevFest',
    );
    expect(text({ ...event, changes: { is_published: [true, false] } })).toBe(
      'Despublicó el evento DevFest',
    );
    expect(
      text({
        table: 'ticket_types',
        subjectName: 'General',
        changes: { price: [10, 15], ticket_capacity: [50, 60] },
      }),
    ).toBe('Editó el paquete General (Precio, Cupo)');
    expect(text({ table: 'event_coupons', subjectName: 'AMIGOS', action: 'INSERT' })).toBe(
      'Creó el cupón AMIGOS',
    );
    expect(
      text({
        table: 'store_products',
        subjectName: 'Polera',
        changes: { price: [60, 65], is_active: [true, false] },
      }),
    ).toBe('Editó el producto Polera (Precio, Activo)');
  });
});

describe('actor y cambios', () => {
  it('Sistema, back-office o la persona desde la web', () => {
    expect(actorLabel(entry({ actorId: null }))).toBe('Sistema');
    expect(actorKind(entry({ actorId: null }))).toBe('system');
    expect(actorKind(entry({ actorRole: null }))).toBe('web');
    expect(actorLabel(entry({ actorName: null }))).toBe('admin@gdg.test');
  });

  it('muestra antes → después con etiquetas legibles', () => {
    expect(
      changeLines(
        entry({ changes: { status: ['PENDING', 'CONFIRMED'], is_published: [false, true] } }),
      ),
    ).toEqual([
      { field: 'status', label: 'Estado', before: 'Pendiente de pago', after: 'Confirmada' },
      { field: 'is_published', label: 'Publicado', before: 'No', after: 'Sí' },
    ]);
    expect(changeLines(entry({ action: 'INSERT', changes: { status: 'PENDING' } }))).toEqual([]);
  });
});
