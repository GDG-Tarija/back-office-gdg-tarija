import { Component, DestroyRef, inject, input, model, output, signal } from '@angular/core';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { toUserMessage } from '../../../data/postgres-error.mapper';
import { validateImageFile } from '../../../domain/event-validators';
import { STORE_IMAGE_ALT_MAX, makeCover, moveImage } from '../../../domain/store-product-form';
import { StoreProductImageInput } from '../../../domain/store.model';
import { StoreImagesRepository } from '../../../domain/store.repository';

/**
 * Galería de un producto: subir varias imágenes, ordenarlas (la primera es la portada), describirlas
 * y quitarlas. No borra archivos: avisa con `uploaded`/`discarded` y el padre decide al guardar.
 */
@Component({
  selector: 'app-store-gallery-editor',
  standalone: true,
  templateUrl: './store-gallery-editor.html',
})
export class StoreGalleryEditor {
  private readonly repo = inject(StoreImagesRepository);
  private readonly feedback = inject(FeedbackService);
  private destroyed = false;

  readonly eventId = input.required<string>();
  readonly disabled = input(false);
  readonly images = model<StoreProductImageInput[]>([]);

  readonly uploaded = output<string>();
  readonly discarded = output<string>();
  /** true mientras haya subidas en curso: el padre no debe guardar hasta que terminen. */
  readonly uploadingChange = output<boolean>();

  readonly altMax = STORE_IMAGE_ALT_MAX;
  readonly uploading = signal(0);
  readonly uploadTotal = signal(0);
  readonly errors = signal<string[]>([]);
  /** Mensaje para lectores de pantalla tras reordenar o quitar. */
  readonly announcement = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) await this.uploadFiles(files);
  }

  async uploadFiles(files: File[]): Promise<void> {
    const errors: string[] = [];
    const valid = files.filter((file) => {
      const issue = validateImageFile(file, 'ticket').errors[0];
      if (issue) errors.push(`${file.name}: ${issue.message}`);
      return !issue;
    });
    this.errors.set(errors);
    if (!valid.length) return;

    this.uploadTotal.set(valid.length);
    this.uploading.set(valid.length);
    this.uploadingChange.emit(true);
    let added = 0;
    // En orden, para que la galería respete el orden en que se eligieron.
    for (const file of valid) {
      if (this.destroyed) break;
      try {
        const url = await this.repo.upload(file, this.eventId());
        if (this.destroyed) {
          // Se cerró el diálogo durante la subida: nadie va a referenciar el archivo.
          await this.repo.remove(url).catch(() => undefined);
          break;
        }
        this.uploaded.emit(url);
        this.images.update((list) => [...list, { url, altText: null }]);
        added++;
      } catch (err) {
        errors.push(`${file.name}: ${toUserMessage(err, 'No se pudo subir la imagen.', 'asset')}`);
        this.errors.set([...errors]);
      } finally {
        this.uploading.update((n) => n - 1);
      }
    }
    this.uploading.set(0);
    if (this.destroyed) return;
    this.uploadingChange.emit(false);
    if (added > 0) {
      this.announcement.set(
        added === 1
          ? 'Se agregó 1 imagen a la galería.'
          : `Se agregaron ${added} imágenes a la galería.`,
      );
    }
  }

  move(index: number, direction: -1 | 1): void {
    const list = this.images();
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    this.images.set(moveImage(list, index, direction));
    this.announcement.set(
      `Imagen movida a la posición ${target + 1} de ${list.length}${target === 0 ? ' (portada)' : ''}.`,
    );
    // El botón pulsado puede desaparecer en los extremos: el foco sigue a la imagen movida.
    setTimeout(() => document.getElementById(`gallery-item-${target}`)?.focus());
  }

  setCover(index: number): void {
    if (index <= 0) return;
    this.images.set(makeCover(this.images(), index));
    this.announcement.set('Imagen definida como portada.');
    setTimeout(() => document.getElementById('gallery-item-0')?.focus());
  }

  setAlt(index: number, value: string): void {
    this.images.update((list) =>
      list.map((img, i) => (i === index ? { ...img, altText: value || null } : img)),
    );
  }

  async remove(index: number): Promise<void> {
    const image = this.images()[index];
    if (!image) return;
    const ok = await this.feedback.confirm({
      titulo: 'Quitar imagen',
      mensaje: `Se quitará la imagen ${index + 1} de la galería. El cambio se aplica al guardar el producto.`,
      aceptar: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    this.images.update((list) => list.filter((_, i) => i !== index));
    this.discarded.emit(image.url);
    this.announcement.set('Imagen quitada de la galería.');
  }
}
