import { Session } from './session.model';
import { Track } from './track.model';
import {
  countBySession,
  emptySessionFormValue,
  findSameStartPairs,
  formValueToSessionInput,
  groupAgenda,
  parseTopics,
  sessionCapacityWarning,
  sessionDeleteBlockReason,
  sessionToFormValue,
  trackDeleteMessage,
  validateSessionCapacityFloor,
} from './session-form';

const session = (o: Partial<Session> = {}): Session => ({
  id: 's1',
  eventId: 'e1',
  trackId: null,
  title: 'Charla',
  speaker: null,
  speakerAvatarUrl: null,
  city: null,
  level: null,
  topics: [],
  capacity: 20,
  date: '2026-10-15',
  startTime: '09:00',
  endTime: '10:00',
  ...o,
});

const track = (id: string, name: string): Track => ({
  id,
  eventId: 'e1',
  name,
  description: null,
});

describe('session-form', () => {
  it('parsea temas CSV sin vacíos ni duplicados', () => {
    expect(parseTopics(' IA, web ,, ia ,Cloud')).toEqual(['IA', 'web', 'Cloud']);
  });

  it('convierte formulario a input', () => {
    const v = {
      ...emptySessionFormValue('2026-10-15'),
      title: ' T ',
      level: 'Basico',
      topics: 'a, b',
      capacity: '30',
    };
    expect(formValueToSessionInput(v)).toMatchObject({
      level: 'Basico',
      topics: ['a', 'b'],
      capacity: 30,
      trackId: null,
      speaker: null,
    });
    expect(formValueToSessionInput({ ...v, capacity: 'x' }).capacity).toBeNaN();
    expect(formValueToSessionInput({ ...v, capacity: '' }).capacity).toBeNaN();
  });

  it('round-trip sesión -> formulario', () => {
    const s = session({ topics: ['a', 'b'], trackId: 't1', level: 'Avanzado' });
    const v = sessionToFormValue(s);
    expect(v.topics).toBe('a, b');
    expect(formValueToSessionInput(v)).toMatchObject({ topics: ['a', 'b'], trackId: 't1' });
  });

  it('bloquea borrado y baja de capacidad con inscritos', () => {
    expect(sessionDeleteBlockReason(0)).toBeNull();
    expect(sessionDeleteBlockReason(3)).toContain('3');
    expect(validateSessionCapacityFloor(2, 3)?.field).toBe('capacity');
    expect(validateSessionCapacityFloor(3, 3)).toBeNull();
    expect(validateSessionCapacityFloor(1, 0)).toBeNull();
  });

  it('avisa si la capacidad supera la del evento', () => {
    expect(sessionCapacityWarning(51, 50)).not.toBeNull();
    expect(sessionCapacityWarning(50, 50)).toBeNull();
  });

  it('cuenta inscritos por sesión', () => {
    expect(countBySession([{ session_id: 'a' }, { session_id: 'a' }, { session_id: 'b' }])).toEqual(
      { a: 2, b: 1 },
    );
  });

  it('detecta misma hora de inicio en distinto track', () => {
    const a = session({ id: 'a', trackId: 't1' });
    const b = session({ id: 'b', trackId: 't2' });
    const c = session({ id: 'c', trackId: 't1', startTime: '09:00' });
    expect(findSameStartPairs([a, b])).toHaveLength(1);
    expect(findSameStartPairs([a, c])).toHaveLength(0);
    expect(findSameStartPairs([a, session({ id: 'd', startTime: '11:00' })])).toHaveLength(0);
  });

  it('mensaje de borrado de track con conteo', () => {
    expect(trackDeleteMessage({ name: 'Web' }, 0)).not.toContain('sin track');
    expect(trackDeleteMessage({ name: 'Web' }, 4)).toContain('4 sesión(es)');
  });

  it('agrupa por día, track y hora', () => {
    const tracks = [track('t2', 'Web'), track('t1', 'AI')];
    const sessions = [
      session({ id: '1', date: '2026-10-16', trackId: 't2', startTime: '10:00', endTime: '11:00' }),
      session({ id: '2', date: '2026-10-15', trackId: 't2', startTime: '11:00', endTime: '12:00' }),
      session({ id: '3', date: '2026-10-15', trackId: 't2', startTime: '09:00', endTime: '10:00' }),
      session({ id: '4', date: '2026-10-15', trackId: null }),
      session({ id: '5', date: '2026-10-15', trackId: 't1' }),
      session({ id: '6', date: null, startTime: null, endTime: null }),
    ];
    const agenda = groupAgenda(sessions, tracks);
    expect(agenda.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16', null]);
    expect(agenda[0].groups.map((g) => g.name)).toEqual(['AI', 'Web', 'Sin track']);
    expect(agenda[0].groups[1].sessions.map((s) => s.id)).toEqual(['3', '2']);
    expect(agenda[2].label).toBe('Sin fecha');
    expect(agenda[0].label).toContain('15');
  });
});
