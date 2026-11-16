import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
// Signal Forms es experimental en Angular 21.2; ver nota en event-basics-form.
import { FormField, form } from '@angular/forms/signals';

import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { ErrorSummary } from '../../../../../shared/components/error-summary/error-summary';
import { BsPipe } from '../../../../../shared/pipes/bs.pipe';
import { ErrorSummaryItem, buildErrorSummary } from '../../../../../shared/utils/error-summary';
import { focusField } from '../../../../../shared/utils/focus';
import { errorField, toUserMessage } from '../../../data/postgres-error.mapper';
import { AssetCleanupTracker } from '../../../domain/asset-cleanup';
import { AssetsRepository } from '../../../domain/assets.repository';
import { ValidationIssue } from '../../../domain/event-validators';
import {
  STORE_PRODUCT_DESCRIPTION_MAX,
  StoreProductFormValue,
  emptyStoreProductFormValue,
  formValueToStoreProductInput,
  storeProductDeleteBlockReason,
  storeProductToFormValue,
  validateStoreProduct,
} from '../../../domain/store-product-form';
import {
  StoreProduct,
  StoreProductImageInput,
  StoreProductOrderCounts,
} from '../../../domain/store.model';
import { StoreImagesRepository, StoreProductsRepository } from '../../../domain/store.repository';
import { ImageUploader } from '../image-uploader/image-uploader';
import { StoreGalleryEditor } from '../store-gallery-editor/store-gallery-editor';

const WAIT_FOR_UPLOADS = 'Espera a que terminen de subirse las imágenes para guardar.';

/** Productos de la Tienda de un evento y su QR de pago (solo SUPERADMIN). */
@Component({
  selector: 'app-store-products-editor',
  standalone: true,
  imports: [
    BsPipe,
    FormField,
    InputTextModule,
    TagModule,
    TooltipModule,
    DialogFrame,
    ErrorSummary,
    ImageUploader,
    StoreGalleryEditor,
  ],
  templateUrl: './store-products-editor.html',
})
export class StoreProductsEditor implements OnInit, OnDestroy {
  private readonly repo = inject(StoreProductsRepository);
  private readonly images = inject(StoreImagesRepository);
  private readonly assets = inject(AssetsRepository);
  private readonly feedback = inject(FeedbackService);

  readonly eventId = input.required<string>();
  /** Un borrador no muestra la tienda al público: se avisa. */
  readonly eventPublished = input(true);

  /** Estado de la tienda para la cabecera de la página (QR y productos activos). */
  readonly readinessChange = output<{ hasQr: boolean; activeProducts: number }>();

  readonly descriptionMax = STORE_PRODUCT_DESCRIPTION_MAX;

  readonly products = signal<StoreProduct[]>([]);
  readonly counts = signal<Record<string, StoreProductOrderCounts>>({});
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  // QR de pago de la tienda
  readonly qrUrl = signal<string | null>(null);
  private savedQr: string | null = null;
  private qrPendingDelete: string[] = [];
  readonly qrSaving = signal(false);
  readonly qrError = signal<string | null>(null);

  // Activar / desactivar
  readonly togglingId = signal<string | null>(null);

  // Diálogo de edición
  readonly dialogOpen = signal(false);
  readonly editing = signal<StoreProduct | null>(null);
  readonly saving = signal(false);
  readonly galleryUploading = signal(false);
  readonly submitted = signal(false);
  readonly dialogError = signal<string | null>(null);
  readonly model = signal<StoreProductFormValue>(emptyStoreProductFormValue());
  readonly f = form(this.model);
  private readonly baseline = signal('');
  readonly dirty = computed(() => JSON.stringify(this.model()) !== this.baseline());
  private readonly serverIssue = signal<ValidationIssue | null>(null);

  // Borrado
  readonly toDelete = signal<StoreProduct | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  private cleanup = this.newTracker();

  readonly activeProducts = computed(() => this.products().filter((p) => p.isActive).length);

  readonly validation = computed(() => {
    const editing = this.editing();
    return validateStoreProduct(formValueToStoreProductInput(this.model()), {
      otherNames: this.products()
        .filter((p) => p.id !== editing?.id)
        .map((p) => p.name),
    });
  });

  readonly errors = computed(() => {
    const server = this.serverIssue();
    return server ? [...this.validation().errors, server] : this.validation().errors;
  });

  readonly summary = computed<ErrorSummaryItem[]>(() => {
    if (!this.submitted()) return [];
    return buildErrorSummary(this.errors(), {
      name: { id: 'sp-name', label: 'Nombre' },
      description: { id: 'sp-desc', label: 'Descripción' },
      price: { id: 'sp-price', label: 'Precio' },
      images: { id: 'gallery-input', label: 'Imágenes' },
    });
  });

  readonly canSave = computed(() => this.errors().length === 0 && !this.saving());

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    void this.cleanup.rollback();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [products, counts, qr] = await Promise.all([
        this.repo.list(this.eventId()),
        this.repo.getOrderCounts(this.eventId()),
        this.repo.getPaymentQr(this.eventId()),
      ]);
      this.products.set(products);
      this.counts.set(counts);
      this.qrUrl.set(qr);
      this.savedQr = qr;
      this.emitReadiness();
    } catch (err) {
      this.loadError.set(toUserMessage(err, 'No se pudo cargar la tienda.', 'store_product'));
    } finally {
      this.loading.set(false);
    }
  }

  orderCounts(p: StoreProduct): StoreProductOrderCounts {
    return this.counts()[p.id] ?? { pending: 0, paid: 0, cancelled: 0, paidUnits: 0 };
  }

  deleteBlockReason(p: StoreProduct): string | null {
    return storeProductDeleteBlockReason(this.counts()[p.id]);
  }

  // ---------------------------------------------------------------------------
  // QR de pago: se guarda al subirlo o quitarlo
  // ---------------------------------------------------------------------------

  onQrUploaded(): void {
    this.qrError.set(null);
  }

  onQrDiscarded(url: string): void {
    this.qrPendingDelete.push(url);
  }

  async onQrChange(url: string | null): Promise<void> {
    const previous = this.savedQr;
    if (url === previous) return;
    this.qrSaving.set(true);
    this.qrError.set(null);
    try {
      await this.repo.setPaymentQr(this.eventId(), url);
      this.savedQr = url;
      this.qrUrl.set(url);
      // `discarded` llega después de `valueChange`: se borra lo que ya nadie referencia.
      await Promise.resolve();
      const orphans = this.qrPendingDelete.filter((u) => u !== url);
      this.qrPendingDelete = [];
      await Promise.all(orphans.map((u) => this.removeQuietly(() => this.assets.remove(u))));
      this.emitReadiness();
      this.feedback.success(url ? 'QR de pago de la tienda guardado.' : 'QR de pago quitado.');
    } catch (err) {
      this.qrPendingDelete = [];
      this.qrUrl.set(previous);
      // El archivo nuevo no quedó referenciado: se limpia.
      if (url && url !== previous) await this.removeQuietly(() => this.assets.remove(url));
      this.qrError.set(toUserMessage(err, 'No se pudo guardar el QR de pago.', 'event'));
    } finally {
      this.qrSaving.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Activar / desactivar
  // ---------------------------------------------------------------------------

  async toggleActive(p: StoreProduct): Promise<void> {
    if (this.togglingId()) return;
    this.togglingId.set(p.id);
    try {
      const saved = await this.repo.setActive(p.id, !p.isActive);
      this.products.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
      this.emitReadiness();
      this.feedback.success(
        saved.isActive
          ? `"${saved.name}" está activo en la tienda.`
          : `"${saved.name}" se desactivó.`,
      );
    } catch (err) {
      this.feedback.error(
        toUserMessage(err, 'No se pudo cambiar el estado del producto.', 'store_product'),
      );
    } finally {
      this.togglingId.set(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Diálogo de producto
  // ---------------------------------------------------------------------------

  fieldError(field: string): string | null {
    if (!this.submitted()) return null;
    return this.errors().find((e) => e.field === field)?.message ?? null;
  }

  fieldWarning(field: string): string | null {
    return this.validation().warnings.find((w) => w.field === field)?.message ?? null;
  }

  openCreate(): void {
    this.openDialog(null, emptyStoreProductFormValue());
  }

  openEdit(p: StoreProduct): void {
    this.openDialog(p, storeProductToFormValue(p));
  }

  async closeDialog(): Promise<void> {
    this.dialogOpen.set(false);
    await this.cleanup.rollback();
  }

  setFormActive(isActive: boolean): void {
    this.model.update((v) => ({ ...v, isActive }));
  }

  setGallery(images: StoreProductImageInput[]): void {
    this.model.update((v) => ({ ...v, images }));
  }

  onImageUploaded(url: string): void {
    this.cleanup.trackUploaded(url);
  }

  onImageDiscarded(url: string): void {
    void this.cleanup.trackDiscarded(url);
  }

  onGalleryUploading(uploading: boolean): void {
    this.galleryUploading.set(uploading);
    if (!uploading && this.dialogError() === WAIT_FOR_UPLOADS) this.dialogError.set(null);
  }

  async save(): Promise<void> {
    if (this.galleryUploading()) {
      this.dialogError.set(WAIT_FOR_UPLOADS);
      return;
    }
    this.submitted.set(true);
    this.serverIssue.set(null);
    if (!this.canSave()) {
      const first = this.summary()[0];
      if (first) focusField(first.id);
      return;
    }
    const input = formValueToStoreProductInput(this.model());
    const editing = this.editing();
    this.saving.set(true);
    this.dialogError.set(null);
    try {
      const saved = await this.repo.save(this.eventId(), editing?.id ?? null, input);
      this.products.update((list) =>
        editing ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved],
      );
      await this.cleanup.commit();
      this.emitReadiness();
      this.dialogOpen.set(false);
      this.feedback.success(editing ? 'Producto actualizado.' : 'Producto creado.');
    } catch (err) {
      const message = toUserMessage(err, 'No se pudo guardar el producto.', 'store_product');
      const field = errorField(err);
      if (field) this.serverIssue.set({ field, message });
      else this.dialogError.set(message);
      // save_store_product es atómico: si falló, la BD quedó como estaba y no hay que reconciliar.
    } finally {
      this.saving.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Borrado
  // ---------------------------------------------------------------------------

  askDelete(p: StoreProduct): void {
    if (this.deleteBlockReason(p)) return;
    this.deleteError.set(null);
    this.toDelete.set(p);
  }

  cancelDelete(): void {
    if (this.deleting()) return;
    this.toDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const p = this.toDelete();
    if (!p || this.deleteBlockReason(p)) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.repo.delete(p.id);
      this.products.update((list) => list.filter((x) => x.id !== p.id));
      // Ya borrado en BD: sus imágenes quedan huérfanas (mejor esfuerzo).
      const tracker = this.newTracker();
      for (const img of p.images) void tracker.trackDiscarded(img.url);
      await tracker.commit();
      this.toDelete.set(null);
      this.emitReadiness();
      this.feedback.success('Producto eliminado.');
    } catch (err) {
      this.deleteError.set(toUserMessage(err, 'No se pudo eliminar el producto.', 'store_product'));
      // Si alguien compró mientras tanto, los contadores lo reflejan.
      await this.refreshCountsQuietly();
    } finally {
      this.deleting.set(false);
    }
  }

  private async refreshCountsQuietly(): Promise<void> {
    try {
      this.counts.set(await this.repo.getOrderCounts(this.eventId()));
    } catch {
      // Se actualizan en la próxima carga.
    }
  }

  private emitReadiness(): void {
    this.readinessChange.emit({ hasQr: !!this.qrUrl(), activeProducts: this.activeProducts() });
  }

  private openDialog(product: StoreProduct | null, value: StoreProductFormValue): void {
    this.cleanup = this.newTracker();
    this.editing.set(product);
    this.model.set(value);
    this.baseline.set(JSON.stringify(value));
    this.submitted.set(false);
    this.serverIssue.set(null);
    this.dialogError.set(null);
    this.galleryUploading.set(false);
    this.dialogOpen.set(true);
  }

  private newTracker(): AssetCleanupTracker {
    return new AssetCleanupTracker((url) => this.images.remove(url));
  }

  private async removeQuietly(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch {
      // Un archivo huérfano no debe bloquear la edición.
    }
  }
}
