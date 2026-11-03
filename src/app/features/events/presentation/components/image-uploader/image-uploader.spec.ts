import { TestBed } from '@angular/core/testing';

import { AssetsRepository } from '../../../domain/assets.repository';
import { ImageUploader } from './image-uploader';

describe('ImageUploader', () => {
  const upload = vi.fn<AssetsRepository['upload']>();
  const remove = vi.fn<AssetsRepository['remove']>();

  beforeEach(() => {
    upload.mockReset();
    remove.mockReset();
    TestBed.configureTestingModule({
      imports: [ImageUploader],
      providers: [{ provide: AssetsRepository, useValue: { upload, remove } }],
    });
  });

  function create(value: string | null = null) {
    const fixture = TestBed.createComponent(ImageUploader);
    fixture.componentRef.setInput('kind', 'cover');
    fixture.componentRef.setInput('eventId', 'ev-1');
    fixture.componentRef.setInput('label', 'Portada');
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture;
  }

  const png = (size = 10) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' });

  it('sube, emite la URL y muestra la vista previa', async () => {
    upload.mockResolvedValue('https://cdn/event-assets/events/ev-1/cover-1.png');
    const fixture = create();
    await fixture.componentInstance.upload(png());
    fixture.detectChanges();

    expect(upload.mock.calls[0][1]).toMatch(/^events\/ev-1\/cover-\d+\.png$/);
    expect(fixture.componentInstance.value()).toBe(
      'https://cdn/event-assets/events/ev-1/cover-1.png',
    );
    expect(fixture.nativeElement.querySelector('img')).toBeTruthy();
  });

  it('al reemplazar NO borra el anterior: emite uploaded y discarded', async () => {
    upload.mockResolvedValue('https://cdn/new.png');
    const fixture = create('https://cdn/old.png');
    const uploaded: string[] = [];
    const discarded: string[] = [];
    fixture.componentInstance.uploaded.subscribe((u) => uploaded.push(u));
    fixture.componentInstance.discarded.subscribe((u) => discarded.push(u));
    await fixture.componentInstance.upload(png());

    expect(remove).not.toHaveBeenCalled();
    expect(uploaded).toEqual(['https://cdn/new.png']);
    expect(discarded).toEqual(['https://cdn/old.png']);
    expect(fixture.componentInstance.value()).toBe('https://cdn/new.png');
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('quitar emite discarded sin borrar el archivo', () => {
    const fixture = create('https://cdn/old.png');
    const discarded: string[] = [];
    fixture.componentInstance.discarded.subscribe((u) => discarded.push(u));
    fixture.componentInstance.clear();

    expect(remove).not.toHaveBeenCalled();
    expect(discarded).toEqual(['https://cdn/old.png']);
    expect(fixture.componentInstance.value()).toBeNull();
  });

  it('rechaza archivos inválidos sin subir', async () => {
    const fixture = create();
    await fixture.componentInstance.upload(new File(['x'], 'a.gif', { type: 'image/gif' }));
    await fixture.componentInstance.upload(png(3 * 1024 * 1024));

    expect(upload).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('2 MB');
  });

  it('muestra el error cuando falla la subida y conserva el valor previo', async () => {
    upload.mockRejectedValue(new Error('Sin permisos'));
    const fixture = create('https://cdn/old.png');
    const discarded = vi.fn();
    fixture.componentInstance.discarded.subscribe(discarded);
    await fixture.componentInstance.upload(png());

    expect(discarded).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBe('Sin permisos');
    expect(fixture.componentInstance.value()).toBe('https://cdn/old.png');
  });
});
