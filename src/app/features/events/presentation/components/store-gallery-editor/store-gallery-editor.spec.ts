import { TestBed } from '@angular/core/testing';

import { feedbackStub } from '../../../../../testing/feedback-stub';
import { StoreImagesRepository } from '../../../domain/store.repository';
import { StoreGalleryEditor } from './store-gallery-editor';

const png = (name: string, size = 1000) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });

describe('StoreGalleryEditor', () => {
  const repo = { upload: vi.fn(), remove: vi.fn() };

  function create(confirm = true) {
    repo.upload.mockReset();
    repo.remove.mockReset();
    TestBed.configureTestingModule({
      imports: [StoreGalleryEditor],
      providers: [feedbackStub(confirm), { provide: StoreImagesRepository, useValue: repo }],
    });
    const fixture = TestBed.createComponent(StoreGalleryEditor);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.componentRef.setInput('images', [
      { url: 'https://x.test/1.png', altText: null },
      { url: 'https://x.test/2.png', altText: 'Detalle' },
      { url: 'https://x.test/3.png', altText: null },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra la portada y un estado vacío cuando no hay imágenes', () => {
    const fixture = create();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('li')).toHaveLength(3);
    expect(el.textContent).toContain('Portada');
    fixture.componentRef.setInput('images', []);
    fixture.detectChanges();
    expect(el.textContent).toContain('Sin imágenes');
  });

  it('sube varias imágenes en orden, avisa al padre y descarta las inválidas', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    const uploaded: string[] = [];
    cmp.uploaded.subscribe((u) => uploaded.push(u));
    repo.upload.mockImplementation((file: File) =>
      Promise.resolve(`https://x.test/new-${file.name}`),
    );

    await cmp.uploadFiles([
      png('a.png'),
      new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
      png('grande.png', 3 * 1024 * 1024),
      png('b.png'),
    ]);

    expect(repo.upload).toHaveBeenCalledTimes(2);
    expect(uploaded).toEqual(['https://x.test/new-a.png', 'https://x.test/new-b.png']);
    expect(
      cmp
        .images()
        .slice(-2)
        .map((i) => i.url),
    ).toEqual(uploaded);
    expect(cmp.errors()).toHaveLength(2);
    expect(cmp.errors()[0]).toContain('doc.pdf');
    expect(cmp.uploading()).toBe(0);
    expect(cmp.announcement()).toContain('2 imágenes');
  });

  it('un fallo de subida se informa sin perder las demás', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    repo.upload
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('https://x.test/ok.png');
    await cmp.uploadFiles([png('falla.png'), png('ok.png')]);
    expect(cmp.images().map((i) => i.url)).toContain('https://x.test/ok.png');
    expect(cmp.errors()[0]).toContain('falla.png');
  });

  it('reordena, define portada y respeta los extremos', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp.move(0, -1);
    expect(cmp.images()[0].url).toBe('https://x.test/1.png');
    cmp.move(0, 1);
    expect(cmp.images().map((i) => i.url)).toEqual([
      'https://x.test/2.png',
      'https://x.test/1.png',
      'https://x.test/3.png',
    ]);
    expect(cmp.announcement()).toContain('posición 2');
    cmp.setCover(2);
    expect(cmp.images()[0].url).toBe('https://x.test/3.png');
    expect(cmp.announcement()).toContain('portada');
  });

  it('botones de mover deshabilitados en los extremos y con etiquetas accesibles', () => {
    const fixture = create();
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'button[aria-label]',
      ),
    );
    const before1 = buttons.find((b) => b.getAttribute('aria-label') === 'Mover la imagen 1 antes');
    const after3 = buttons.find(
      (b) => b.getAttribute('aria-label') === 'Mover la imagen 3 después',
    );
    expect(before1?.disabled).toBe(true);
    expect(after3?.disabled).toBe(true);
  });

  it('quitar pide confirmación y avisa al padre; cancelar no cambia nada', async () => {
    let fixture = create(false);
    let cmp = fixture.componentInstance;
    await cmp.remove(1);
    expect(cmp.images()).toHaveLength(3);

    TestBed.resetTestingModule();
    fixture = create(true);
    cmp = fixture.componentInstance;
    const discarded: string[] = [];
    cmp.discarded.subscribe((u) => discarded.push(u));
    await cmp.remove(1);
    expect(cmp.images().map((i) => i.url)).toEqual([
      'https://x.test/1.png',
      'https://x.test/3.png',
    ]);
    expect(discarded).toEqual(['https://x.test/2.png']);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('avisa al padre mientras sube imágenes', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    const states: boolean[] = [];
    cmp.uploadingChange.subscribe((s) => states.push(s));
    repo.upload.mockResolvedValue('https://x.test/n.png');
    await cmp.uploadFiles([png('a.png')]);
    expect(states).toEqual([true, false]);
  });

  it('si se cierra durante la subida, borra el archivo y no avisa al padre', async () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    const uploaded: string[] = [];
    cmp.uploaded.subscribe((u) => uploaded.push(u));
    let resolve!: (url: string) => void;
    repo.upload.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    repo.remove.mockResolvedValue(undefined);
    const pending = cmp.uploadFiles([png('a.png'), png('b.png')]);
    fixture.destroy();
    resolve('https://x.test/huerfana.png');
    await pending;
    expect(repo.remove).toHaveBeenCalledWith('https://x.test/huerfana.png');
    expect(repo.upload).toHaveBeenCalledTimes(1);
    expect(uploaded).toEqual([]);
  });

  it('edita el texto alternativo', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp.setAlt(0, 'Frente del kit');
    cmp.setAlt(1, '');
    expect(cmp.images()[0].altText).toBe('Frente del kit');
    expect(cmp.images()[1].altText).toBeNull();
  });
});
