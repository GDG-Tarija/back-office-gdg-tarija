import { Component, inject, input, model, output, signal } from '@angular/core';

import { buildAssetPath } from '../../../domain/asset-path';
import { AssetsRepository } from '../../../domain/assets.repository';
import { ImageKind, validateImageFile } from '../../../domain/event-validators';

@Component({
  selector: 'app-image-uploader',
  standalone: true,
  templateUrl: './image-uploader.html',
})
export class ImageUploader {
  private readonly assets = inject(AssetsRepository);

  readonly kind = input.required<ImageKind>();
  /** Carpeta del evento dentro del bucket. */
  readonly eventId = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input<string>('JPG, PNG o WebP.');
  /** URL pública actual (two-way). */
  readonly value = model<string | null>(null);

  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);

  /** Archivo nuevo subido al bucket (aún sin guardar en el formulario padre). */
  readonly uploaded = output<string>();
  /**
   * URL que dejó de estar referenciada (reemplazo o quitar). El componente NO la borra: el padre
   * decide cuándo, para no dejar el evento apuntando a un archivo inexistente si no guarda.
   */
  readonly discarded = output<string>();

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.upload(file);
  }

  async upload(file: File): Promise<void> {
    this.error.set(null);
    const check = validateImageFile(file, this.kind());
    if (check.errors.length) {
      this.error.set(check.errors[0].message);
      return;
    }

    const previous = this.value();
    this.uploading.set(true);
    try {
      const path = buildAssetPath(this.eventId(), this.kind(), file.type);
      const url = await this.assets.upload(file, path);
      this.uploaded.emit(url);
      this.value.set(url);
      if (previous) this.discarded.emit(previous);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      this.uploading.set(false);
    }
  }

  clear(): void {
    const previous = this.value();
    this.error.set(null);
    this.value.set(null);
    if (previous) this.discarded.emit(previous);
  }
}
