import { TestBed } from '@angular/core/testing';

import { AssetsRepository } from '../../../domain/assets.repository';
import { DomainError } from '../../../domain/domain-error';
import { SessionRegistrationsRepository } from '../../../domain/session-registrations.repository';
import { Session } from '../../../domain/session.model';
import { SessionsRepository } from '../../../domain/sessions.repository';
import { Track } from '../../../domain/track.model';
import { TracksRepository } from '../../../domain/tracks.repository';
import { TracksSessionsEditor } from './tracks-sessions-editor';

const track: Track = { id: 't1', eventId: 'e1', name: 'Web', description: null };
const session = (o: Partial<Session> = {}): Session => ({
  id: 's1',
  eventId: 'e1',
  trackId: 't1',
  title: 'Intro',
  speaker: 'Ana',
  speakerAvatarUrl: null,
  city: null,
  level: 'Basico',
  topics: [],
  capacity: 20,
  date: '2026-10-15',
  startTime: '09:00',
  endTime: '10:00',
  ...o,
});

describe('TracksSessionsEditor', () => {
  const tracks = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const sessions = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const regs = { getCounts: vi.fn() };

  beforeEach(() => {
    [tracks, sessions, regs].forEach((r) => Object.values(r).forEach((m) => m.mockReset()));
    tracks.list.mockResolvedValue([track]);
    sessions.list.mockResolvedValue([session()]);
    regs.getCounts.mockResolvedValue({ s1: 5 });
    TestBed.configureTestingModule({
      imports: [TracksSessionsEditor],
      providers: [{ provide: AssetsRepository, useValue: { upload: vi.fn(), remove: vi.fn() } }],
    });
    TestBed.overrideComponent(TracksSessionsEditor, {
      set: {
        providers: [
          { provide: TracksRepository, useValue: tracks },
          { provide: SessionsRepository, useValue: sessions },
          { provide: SessionRegistrationsRepository, useValue: regs },
        ],
      },
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(TracksSessionsEditor);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.componentRef.setInput('event', {
      dateStart: new Date('2026-10-15T13:00:00Z'), // 09:00 La Paz
      dateEnd: new Date('2026-10-16T22:00:00Z'),
      capacity: 100,
    });
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
    return fixture;
  }

  it('carga, agrupa la agenda y emite sesiones', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    const emitted: Session[][] = [];
    cmp.sessionsChange.subscribe((v) => emitted.push(v));
    await cmp.load();
    expect(emitted[0]).toHaveLength(1);
    expect(cmp.agenda()[0].groups[0].name).toBe('Web');
    expect(cmp.registered(session())).toBe(5);
  });

  it('muestra estado vacío sin sesiones', async () => {
    sessions.list.mockResolvedValue([]);
    regs.getCounts.mockResolvedValue({});
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Aún no hay sesiones');
  });

  it('muestra error de carga con reintento', async () => {
    tracks.list.mockRejectedValue(new Error('boom'));
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('boom');
  });

  it('deshabilita el borrado con inscritos', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.askDeleteSession(session());
    expect(cmp.sessionToDelete()).toBeNull();
    const del = fixture.nativeElement.querySelector('button[aria-label^="Eliminar sesión"]');
    expect(del.disabled).toBe(true);
  });

  it('muestra el DomainError si el servidor rechaza el borrado', async () => {
    regs.getCounts.mockResolvedValue({});
    const fixture = await create();
    const cmp = fixture.componentInstance;
    sessions.delete.mockRejectedValue(
      new DomainError('No se puede eliminar una sesión con inscritos.', 'HAS_REGISTRATIONS'),
    );
    cmp.askDeleteSession(session());
    await cmp.confirmDeleteSession();
    expect(cmp.sessionDeleteError()).toBe('No se puede eliminar una sesión con inscritos.');
    expect(cmp.sessions()).toHaveLength(1);
  });

  it('bloquea bajar la capacidad por debajo de los inscritos', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openEditSession(session());
    cmp.sessionModel.update((v) => ({ ...v, capacity: '3' }));
    expect(cmp.sessionValidation().errors.map((e) => e.field)).toContain('capacity');
    await cmp.saveSession();
    expect(sessions.update).not.toHaveBeenCalled();
    cmp.sessionModel.update((v) => ({ ...v, capacity: '5' }));
    expect(cmp.sessionValidation().errors).toHaveLength(0);
  });

  it('rechaza fechas fuera del rango del evento', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openCreateSession();
    cmp.sessionModel.update((v) => ({ ...v, title: 'X', capacity: '10', date: '2026-10-20' }));
    expect(cmp.sessionValidation().errors.map((e) => e.field)).toContain('date');
  });

  it('crea una sesión y emite la lista', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    const created = session({ id: 's2', title: 'Nueva', startTime: '11:00', endTime: '12:00' });
    sessions.create.mockResolvedValue(created);
    cmp.openCreateSession();
    cmp.sessionModel.update((v) => ({
      ...v,
      title: 'Nueva',
      capacity: '10',
      startTime: '11:00',
      endTime: '12:00',
    }));
    const emitted: Session[][] = [];
    cmp.sessionsChange.subscribe((v) => emitted.push(v));
    await cmp.saveSession();
    expect(sessions.create).toHaveBeenCalled();
    expect(emitted.at(-1)).toHaveLength(2);
    expect(cmp.sessionDialogOpen()).toBe(false);
  });

  it('avisa cuántas sesiones quedan sin track al borrar un track', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    tracks.delete.mockResolvedValue(undefined);
    cmp.askDeleteTrack(track);
    expect(cmp.trackDeleteText()).toContain('1 sesión(es)');
    await cmp.confirmDeleteTrack();
    expect(cmp.sessions()[0].trackId).toBeNull();
    expect(cmp.notice()).toContain('1 sesión(es) quedaron sin track');
  });

  it('valida nombre de track duplicado', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openCreateTrack();
    cmp.trackModel.set({ name: 'web', description: '' });
    await cmp.saveTrack();
    expect(tracks.create).not.toHaveBeenCalled();
    expect(cmp.trackFieldError()).toContain('Ya existe');
  });

  it('advierte solapes en el mismo track', async () => {
    sessions.list.mockResolvedValue([
      session(),
      session({ id: 's2', title: 'Otra', startTime: '09:30', endTime: '10:30' }),
    ]);
    const fixture = await create();
    expect(fixture.componentInstance.overlapWarnings()).toHaveLength(1);
  });
});
