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

  it('deshabilita guardar con errores y emite EventInput cuando es válido', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    expect(cmp.canSave()).toBe(false);

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

    expect(cmp.canSave()).toBe(true);
    cmp.submit();
    expect(emitted[0].slug).toBe('mi-evento');
    expect(emitted[0].capacity).toBe(100);
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
