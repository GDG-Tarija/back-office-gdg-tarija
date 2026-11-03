/**
 * Borrado diferido de imágenes. Reemplazar o quitar una imagen no borra el archivo anterior hasta
 * que el formulario se guarda con éxito; los archivos subidos y descartados se limpian al cancelar.
 * Todo es "mejor esfuerzo": un fallo al borrar nunca debe romper el flujo de edición.
 */
export class AssetCleanupTracker {
  /** Subidos en esta sesión y aún no guardados. */
  private readonly uploaded = new Set<string>();
  /** Reemplazados/quitados que ya estaban guardados: se borran tras guardar. */
  private readonly pendingDelete = new Set<string>();

  constructor(private readonly remove: (url: string) => Promise<void>) {}

  get pendingUrls(): string[] {
    return [...this.pendingDelete];
  }

  get uploadedUrls(): string[] {
    return [...this.uploaded];
  }

  trackUploaded(url: string): void {
    this.uploaded.add(url);
  }

  /** La URL dejó de estar referenciada por el formulario (reemplazo o quitar). */
  trackDiscarded(url: string): Promise<void> {
    if (this.uploaded.has(url)) {
      // Nunca se guardó: nadie la referencia, se puede borrar ya.
      this.uploaded.delete(url);
      return this.removeQuietly(url);
    }
    this.pendingDelete.add(url);
    return Promise.resolve();
  }

  /** Guardado exitoso: borra los reemplazados; lo subido pasa a ser permanente. */
  async commit(): Promise<void> {
    const urls = [...this.pendingDelete];
    this.pendingDelete.clear();
    this.uploaded.clear();
    await Promise.all(urls.map((u) => this.removeQuietly(u)));
  }

  /** Cancelar o salir sin guardar: borra lo subido y conserva lo guardado. */
  async rollback(): Promise<void> {
    const urls = [...this.uploaded];
    this.uploaded.clear();
    this.pendingDelete.clear();
    await Promise.all(urls.map((u) => this.removeQuietly(u)));
  }

  private async removeQuietly(url: string): Promise<void> {
    try {
      await this.remove(url);
    } catch {
      // Un archivo huérfano no debe bloquear la edición.
    }
  }
}
