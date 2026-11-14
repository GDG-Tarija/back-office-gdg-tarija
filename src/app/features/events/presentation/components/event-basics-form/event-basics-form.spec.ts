import { feedbackStub } from '../../../../../testing/feedback-stub';
import { TestBed } from '@angular/core/testing';

import { AssetsRepository } from '../../../domain/assets.repository';
import { Event, EventInput } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { EventBasicsForm } from './event-basics-form';

describe('EventBasicsForm', () => {
  const isSlugAvailable = vi.fn();
  const getEvents = vi.fn();
  const remove = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    isSlugAvailable.mockReset().mockResolvedValue(true);
    getEvents.mockReset().mockResolvedValue([]);
    remove.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [EventBasicsForm],
      providers: [
        feedbackStub(),
        { provide: EventsRepository, useValue: { isSlugAvailable, getEvents } },
        { provide: AssetsRepository, useValue: { upload: vi.fn(), remove } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  function create(event: Event | null = null, registrations = 0) {
    const fixture = TestBed.createComponent(EventBasicsForm);
    fixture.componentRef.setInput('event', event);
    fixture.componentRef.setInput('registrationCount', registrations);
    fixture.detectChanges();
    return fixture;
  }

  it('genera el slug desde el título y consulta unicidad con debounce', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp.model.update((v) => ({ ...v, title: 'Build with AI 2026' }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);

    expect(cmp.model().slug).toBe('build-with-ai-2026');
    expect(isSlugAvailable).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(isSlugAvailable).toHaveBeenCalledWith('build-with-ai-2026', undefined);
  });

  it('deja de seguir al título cuando el slug se editó a mano', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp.onSlugInput();
    cmp.model.update((v) => ({ ...v, title: 'Otro', slug: 'mi-slug' }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(cmp.model().slug).toBe('mi-slug');
  });

  it('con errores no emite, muestra el resumen y enfoca el primer campo', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    const emitted: EventInput[] = [];
    cmp.save.subscribe((v) => emitted.push(v));
    const button = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(cmp.fieldError('title')).toBeNull();

    await cmp.submit();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(cmp.summary().map((i) => i.label)).toEqual(
      expect.arrayContaining(['Título', 'Fecha de inicio', 'Capacidad']),
    );
    expect(cmp.fieldError('title')).toContain('título');
    expect(fixture.nativeElement.querySelector('app-error-summary [role="alert"]')).not.toBeNull();
  });

  it('muestra el error de un campo al salir de él', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    expect(cmp.fieldError('title')).toBeNull();
    cmp.markBlurred('title');
    expect(cmp.fieldError('title')).not.toBeNull();
  });

  it('emite EventInput cuando es válido y reporta cambios sin guardar', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    expect(cmp.dirty()).toBe(false);

    const emitted: EventInput[] = [];
    cmp.save.subscribe((v) => emitted.push(v));
    cmp.model.update((v) => ({
      ...v,
      title: 'Mi evento',
      startDate: '2026-12-01',
      capacity: '100',
    }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(600);
    expect(cmp.dirty()).toBe(true);

    const pending = cmp.submit();
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    expect(emitted[0].slug).toBe('mi-evento');
    expect(emitted[0].capacity).toBe(100);

    cmp.markSaved();
    expect(cmp.dirty()).toBe(false);
  });

  it('incluye el error del servidor en el resumen junto al campo', async () => {
    const fixture = create();
    fixture.componentRef.setInput('serverError', { field: 'slug', message: 'Ya existe.' });
    const cmp = fixture.componentInstance;
    cmp.model.update((v) => ({ ...v, title: 'Mi evento', slug: 'mi-evento' }));
    await cmp.requestSave();
    expect(cmp.fieldError('slug')).toBe('Ya existe.');
    expect(cmp.summary().some((i) => i.label === 'Slug')).toBe(true);
  });

  it('bloquea el slug y avisa al cambiar la capacidad con inscritos', () => {
    const event = {
      id: 'e1',
      title: 'Demo',
      slug: 'demo',
      eventType: 'MEETUP',
      capacity: 50,
      dateStart: new Date('2026-10-15T13:00:00.000Z'),
      dateEnd: null,
      isPublished: false,
      createdAt: null,
      updatedAt: null,
      description: null,
      imageUrl: null,
      bannerUrl: null,
      locationType: 'PHYSICAL',
      locationName: null,
      addressLink: null,
      category: null,
      extraInfo: null,
      formFields: [],
    } as Event;
    const fixture = create(event, 3);
    const cmp = fixture.componentInstance;
    expect(cmp.slugLocked()).toBe(true);
    cmp.model.update((v) => ({ ...v, capacity: '80' }));
    expect(cmp.validation().warnings.length).toBe(1);
  });

  it('borra la imagen reemplazada solo tras commitAssets', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp.onImageUploaded('new');
    cmp.onImageDiscarded('old');
    expect(remove).not.toHaveBeenCalled();
    await cmp.commitAssets();
    expect(remove).toHaveBeenCalledWith('old');
    expect(remove).not.toHaveBeenCalledWith('new');
  });

  it('al destruirse sin guardar borra lo subido y conserva lo guardado', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp.onImageUploaded('new');
    cmp.onImageDiscarded('old');
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(0);
    expect(remove).toHaveBeenCalledWith('new');
    expect(remove).not.toHaveBeenCalledWith('old');
  });
});
