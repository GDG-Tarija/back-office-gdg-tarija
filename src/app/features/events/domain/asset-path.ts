export type AssetKind = 'cover' | 'banner' | 'ticket' | 'qr' | 'avatar';

export const ASSETS_BUCKET = 'event-assets';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function buildAssetPath(
  eventId: string,
  kind: AssetKind,
  mimeType: string,
  timestamp: number = Date.now(),
): string {
  const ext = EXT_BY_MIME[mimeType] ?? 'bin';
  return `events/${eventId}/${kind}-${timestamp}.${ext}`;
}

/** Devuelve la ruta dentro del bucket a partir de una URL pública, o null si no es del bucket. */
export function extractAssetPath(publicUrl: string): string | null {
  const marker = `/${ASSETS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  const path = publicUrl.slice(index + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}
