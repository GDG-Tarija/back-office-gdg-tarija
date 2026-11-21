/** Imágenes de productos: bucket público `store-images` (2 MB, JPG/PNG/WebP). */
export const STORE_IMAGES_BUCKET = 'store-images';

/** Comprobantes de compras: bucket PRIVADO; solo se leen con URL firmada. */
export const STORE_PROOFS_BUCKET = 'store-payment-proofs';

/** Duración de las URLs firmadas de comprobantes (segundos). */
export const PROOF_URL_TTL_SECONDS = 600;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** `events/<evento>/store/<timestamp>-<aleatorio>.<ext>`: único aunque se suban varias a la vez. */
export function buildStoreImagePath(
  eventId: string,
  mimeType: string,
  timestamp: number = Date.now(),
  random: string = Math.random().toString(36).slice(2, 8),
): string {
  const ext = EXT_BY_MIME[mimeType] ?? 'bin';
  return `events/${eventId}/store/${timestamp}-${random}.${ext}`;
}

/** Ruta dentro de `store-images` a partir de su URL pública, o null si es de otro origen. */
export function extractStoreImagePath(publicUrl: string): string | null {
  const marker = `/${STORE_IMAGES_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  const path = publicUrl.slice(index + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/** Los PDF no se previsualizan: se ofrecen para abrir o descargar. */
export function isPdfPath(path: string | null | undefined): boolean {
  return !!path && path.split('?')[0].toLowerCase().endsWith('.pdf');
}
