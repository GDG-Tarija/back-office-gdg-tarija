import { Component, inject, input, model, output, signal } from '@angular/core';

import { FeedbackService } from '../../../../../core/services/feedback.service';

import { toUserMessage } from '../../../data/postgres-error.mapper';
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
  private readonly feedback = inject(FeedbackService);

  readonly kind = input.required<ImageKind>();
  /** Carpeta del evento dentro del bucket. */
  readonly eventId = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input<string>('JPG, PNG o WebP.');
  /** Id del input de archivo, para enlazar errores del formulario y enfocarlo. */
  readonly inputId = input<string | null>(null);
  /** Nota junto a la etiqueta, p. ej. "Necesario para publicar". */
  readonly note = input<string | null>(null);
  /** Error de validación del formulario padre (no el de subida). */
  readonly invalidMessage = input<string | null>(null);
  /** Bloquea subir y quitar, p. ej. mientras el padre guarda el valor anterior. */
  readonly disabled = input(false);
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
      this.error.set(toUserMessage(err, 'No se pudo subir la imagen.', 'asset'));
    } finally {
      this.uploading.set(false);
    }
  }

  async clear(): Promise<void> {
    const previous = this.value();
    const ok = await this.feedback.confirm({
      titulo: 'Quitar imagen',
      mensaje: `Se quitará "${this.label()}" de este formulario. Podrás subir otra antes de guardar.`,
      aceptar: 'Quitar',
      peligro: true,
    });
    if (!ok) return;
    this.error.set(null);
    this.value.set(null);
    if (previous) this.discarded.emit(previous);
  }
}
