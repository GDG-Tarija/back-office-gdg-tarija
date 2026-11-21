import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { feedbackStub } from '../../../../../testing/feedback-stub';
import { AssetsRepository } from '../../../domain/assets.repository';
import { DomainError } from '../../../domain/domain-error';
import { StoreProduct } from '../../../domain/store.model';
import { StoreImagesRepository, StoreProductsRepository } from '../../../domain/store.repository';
import { ImageUploader } from '../image-uploader/image-uploader';
import { StoreProductsEditor } from './store-products-editor';

registerLocaleData(localeEsBo, 'es-BO');

const kit: StoreProduct = {
  id: 'p1',
  eventId: 'e1',
  name: 'Kit DevFest',
  description: 'Mochila',
  price: 80,
  isActive: true,
  position: 1,
  images: [{ id: 'i1', url: 'https://x.test/kit.png', position: 1, altText: null }],
};
const taza: StoreProduct = {
  ...kit,
  id: 'p2',
  name: 'Taza',
  price: 35,
  isActive: false,
  images: [],
};

describe('StoreProductsEditor', () => {
  const repo = {
    list: vi.fn(),
    getOrderCounts: vi.fn(),
    save: vi.fn(),
    setActive: vi.fn(),
    delete: vi.fn(),
    getPaymentQr: vi.fn(),
    setPaymentQr: vi.fn(),
  };
  const images = { upload: vi.fn(), remove: vi.fn() };
  const assets = { upload: vi.fn(), remove: vi.fn() };

  beforeEach(() => {
    [...Object.values(repo), ...Object.values(images), ...Object.values(assets)].forEach((m) =>
      m.mockReset(),
    );
    repo.list.mockResolvedValue([kit, taza]);
    repo.getOrderCounts.mockResolvedValue({
      p1: { pending: 1, paid: 2, cancelled: 0, paidUnits: 3 },
    });
    repo.getPaymentQr.mockResolvedValue(null);
    images.remove.mockResolvedValue(undefined);
    assets.remove.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [StoreProductsEditor],
      providers: [
        feedbackStub(),
        { provide: StoreProductsRepository, useValue: repo },
        { provide: StoreImagesRepository, useValue: images },
        { provide: AssetsRepository, useValue: assets },
      ],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(StoreProductsEditor);
    fixture.componentRef.setInput('eventId', 'e1');
    const readiness: { hasQr: boolean; activeProducts: number }[] = [];
    fixture.componentInstance.readinessChange.subscribe((r) => readiness.push(r));
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, readiness };
  }

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('lista productos con estado, precio y compras; avisa del estado de la tienda', async () => {
    const { fixture, readiness } = await create();
    expect(text(fixture)).toContain('Kit DevFest');
    expect(text(fixture)).toContain('Activo');
    expect(text(fixture)).toContain('Inactivo');
    expect(text(fixture)).toContain('1 compra pendiente');
    expect(text(fixture)).toContain('(3 unidades)');
    expect(readiness.at(-1)).toEqual({ hasQr: false, activeProducts: 1 });
  });

  it('estado vacío y error de carga con reintento', async () => {
    repo.list.mockResolvedValue([]);
    let { fixture } = await create();
    expect(text(fixture)).toContain('Aún no hay productos');
    repo.list.mockRejectedValue(new DomainError('Sin conexión con el servidor.', 'NETWORK'));
    ({ fixture } = await create());
    expect(fixture.componentInstance.loadError()).toBe('Sin conexión con el servidor.');
    expect(text(fixture)).toContain('Reintentar');
  });

  it('borrar está deshabilitado si el producto tiene compras', async () => {
    const { fixture, cmp } = await create();
    cmp.askDelete(kit);
    expect(cmp.toDelete()).toBeNull();
    const del = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label^="Eliminar Kit DevFest"]',
    );
    expect(del?.disabled).toBe(true);
    expect(del?.getAttribute('aria-label')).toContain('tiene compras');
  });

  it('elimina un producto sin compras y limpia sus imágenes', async () => {
    const { cmp } = await create();
    repo.delete.mockResolvedValue(undefined);
    cmp.askDelete({
      ...taza,
      images: [{ id: 'x', url: 'https://x.test/t.png', position: 1, altText: null }],
    });
    await cmp.confirmDelete();
    expect(repo.delete).toHaveBeenCalledWith('p2');
    expect(cmp.products().map((p) => p.id)).toEqual(['p1']);
    expect(images.remove).toHaveBeenCalledWith('https://x.test/t.png');
  });

  it('si la BD rechaza el borrado muestra el motivo y recarga los contadores', async () => {
    const { cmp } = await create();
    repo.delete.mockRejectedValue(
      new DomainError(
        'No se puede eliminar el producto "Taza": tiene compras.',
        'HAS_REGISTRATIONS',
      ),
    );
    const before = repo.getOrderCounts.mock.calls.length;
    cmp.askDelete(taza);
    await cmp.confirmDelete();
    expect(cmp.deleteError()).toContain('tiene compras');
    expect(cmp.products()).toHaveLength(2);
    expect(repo.getOrderCounts.mock.calls.length).toBe(before + 1);
  });

  it('activa y desactiva un producto', async () => {
    const { cmp, readiness } = await create();
    repo.setActive.mockResolvedValue({ ...taza, isActive: true });
    await cmp.toggleActive(taza);
    expect(repo.setActive).toHaveBeenCalledWith('p2', true);
    expect(cmp.products().find((p) => p.id === 'p2')?.isActive).toBe(true);
    expect(readiness.at(-1)?.activeProducts).toBe(2);
  });

  it('valida antes de guardar y no llama al servidor si hay errores', async () => {
    const { cmp } = await create();
    cmp.openCreate();
    cmp.model.set({ name: 'kit devfest', description: '', price: '0', isActive: true, images: [] });
    await cmp.save();
    expect(cmp.fieldError('name')).toContain('Ya existe');
    expect(cmp.fieldError('price')).toContain('mayor que 0');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('crea un producto con su galería y confirma las imágenes subidas', async () => {
    const { cmp } = await create();
    cmp.openCreate();
    cmp.onImageUploaded('https://x.test/nueva.png');
    cmp.model.set({
      name: 'Polera',
      description: ' Algodón ',
      price: '60,50',
      isActive: true,
      images: [{ url: 'https://x.test/nueva.png', altText: null }],
    });
    const saved: StoreProduct = { ...kit, id: 'p3', name: 'Polera', price: 60.5 };
    repo.save.mockResolvedValue(saved);
    await cmp.save();
    expect(repo.save).toHaveBeenCalledWith('e1', null, {
      name: 'Polera',
      description: 'Algodón',
      price: 60.5,
      isActive: true,
      images: [{ url: 'https://x.test/nueva.png', altText: null }],
    });
    expect(cmp.dialogOpen()).toBe(false);
    expect(cmp.products().map((p) => p.id)).toContain('p3');
    // Guardado con éxito: la imagen subida queda y no se borra.
    expect(images.remove).not.toHaveBeenCalled();
  });

  it('al editar, la imagen quitada se borra recién después de guardar', async () => {
    const { cmp } = await create();
    cmp.openEdit(kit);
    cmp.onImageDiscarded('https://x.test/kit.png');
    cmp.setGallery([]);
    expect(images.remove).not.toHaveBeenCalled();
    repo.save.mockResolvedValue({ ...kit, images: [] });
    await cmp.save();
    expect(repo.save).toHaveBeenCalledWith('e1', 'p1', expect.objectContaining({ images: [] }));
    expect(images.remove).toHaveBeenCalledWith('https://x.test/kit.png');
  });

  it('cancelar el diálogo borra lo subido y conserva lo guardado', async () => {
    const { cmp } = await create();
    cmp.openEdit(kit);
    cmp.onImageUploaded('https://x.test/temporal.png');
    cmp.onImageDiscarded('https://x.test/kit.png');
    await cmp.closeDialog();
    expect(images.remove).toHaveBeenCalledWith('https://x.test/temporal.png');
    expect(images.remove).not.toHaveBeenCalledWith('https://x.test/kit.png');
  });

  it('si el guardado falla pero el producto quedó en la BD, cancelar no borra sus imágenes', async () => {
    const { cmp } = await create();
    cmp.openCreate();
    cmp.onImageUploaded('https://x.test/nueva.png');
    cmp.model.set({
      name: 'Polera',
      description: '',
      price: '60',
      isActive: true,
      images: [{ url: 'https://x.test/nueva.png', altText: null }],
    });
    // El RPC guardó, pero la relectura se perdió.
    repo.save.mockRejectedValue(new DomainError('Sin conexión con el servidor.', 'NETWORK'));
    const persisted: StoreProduct = {
      ...kit,
      id: 'p3',
      name: 'Polera',
      images: [{ id: 'i3', url: 'https://x.test/nueva.png', position: 1, altText: null }],
    };
    repo.list.mockResolvedValue([kit, taza, persisted]);
    await cmp.save();
    expect(cmp.dialogError()).toBe('Sin conexión con el servidor.');
    expect(cmp.products().map((p) => p.id)).toContain('p3');
    await cmp.closeDialog();
    expect(images.remove).not.toHaveBeenCalled();
  });

  it('no guarda mientras la galería sube imágenes', async () => {
    const { cmp } = await create();
    cmp.openCreate();
    cmp.model.set({ name: 'Polera', description: '', price: '10', isActive: true, images: [] });
    cmp.onGalleryUploading(true);
    await cmp.save();
    expect(repo.save).not.toHaveBeenCalled();
    expect(cmp.dialogError()).toContain('Espera');
    cmp.onGalleryUploading(false);
    expect(cmp.dialogError()).toBeNull();
  });

  it('no cierra la confirmación de borrado mientras elimina', async () => {
    const { cmp } = await create();
    cmp.askDelete(taza);
    cmp.deleting.set(true);
    cmp.cancelDelete();
    expect(cmp.toDelete()).toEqual(taza);
  });

  it('un nombre repetido del servidor se muestra en su campo', async () => {
    const { cmp } = await create();
    cmp.openCreate();
    cmp.model.set({ name: 'Nuevo', description: '', price: '10', isActive: true, images: [] });
    repo.save.mockRejectedValue(
      new DomainError('Ya existe un producto con ese nombre en la tienda.', 'DUPLICATE', 'name'),
    );
    await cmp.save();
    expect(cmp.fieldError('name')).toContain('Ya existe');
    expect(cmp.dialogOpen()).toBe(true);
  });

  it('el QR se guarda al subirlo y borra el anterior', async () => {
    repo.getPaymentQr.mockResolvedValue('https://x.test/qr-viejo.png');
    const { cmp, readiness } = await create();
    repo.setPaymentQr.mockResolvedValue(undefined);
    const saving = cmp.onQrChange('https://x.test/qr-nuevo.png');
    cmp.onQrDiscarded('https://x.test/qr-viejo.png');
    await saving;
    expect(repo.setPaymentQr).toHaveBeenCalledWith('e1', 'https://x.test/qr-nuevo.png');
    expect(assets.remove).toHaveBeenCalledWith('https://x.test/qr-viejo.png');
    expect(cmp.qrUrl()).toBe('https://x.test/qr-nuevo.png');
    expect(readiness.at(-1)?.hasQr).toBe(true);
    expect(TestBed.inject(FeedbackService).success).toHaveBeenCalled();
  });

  it('si guardar el QR falla, vuelve al anterior y borra el archivo nuevo', async () => {
    repo.getPaymentQr.mockResolvedValue('https://x.test/qr-viejo.png');
    const { cmp } = await create();
    repo.setPaymentQr.mockRejectedValue(new DomainError('No tienes permisos.', 'FORBIDDEN'));
    const saving = cmp.onQrChange('https://x.test/qr-nuevo.png');
    cmp.onQrDiscarded('https://x.test/qr-viejo.png');
    await saving;
    expect(cmp.qrUrl()).toBe('https://x.test/qr-viejo.png');
    expect(assets.remove).toHaveBeenCalledWith('https://x.test/qr-nuevo.png');
    expect(assets.remove).not.toHaveBeenCalledWith('https://x.test/qr-viejo.png');
    expect(cmp.qrError()).toBe('No tienes permisos.');
  });

  it('el uploader se bloquea mientras guarda el QR y, si falla, vuelve a mostrar el anterior', async () => {
    repo.getPaymentQr.mockResolvedValue('https://x.test/qr-viejo.png');
    const { fixture, cmp } = await create();
    let reject!: (err: unknown) => void;
    repo.setPaymentQr.mockReturnValue(new Promise((_, r) => (reject = r)));
    const uploader = fixture.debugElement.query(By.directive(ImageUploader))
      .componentInstance as ImageUploader;
    // Igual que tras subir un archivo: el uploader emite el valor nuevo.
    uploader.value.set('https://x.test/qr-nuevo.png');
    fixture.detectChanges();
    expect(uploader.disabled()).toBe(true);
    reject(new DomainError('No tienes permisos.', 'FORBIDDEN'));
    await vi.waitFor(() => expect(cmp.qrSaving()).toBe(false));
    fixture.detectChanges();
    expect(uploader.value()).toBe('https://x.test/qr-viejo.png');
    expect(uploader.disabled()).toBe(false);
  });
});
