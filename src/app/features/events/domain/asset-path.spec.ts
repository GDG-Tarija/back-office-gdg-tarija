import { describe, expect, it } from 'vitest';

import { buildAssetPath, extractAssetPath } from './asset-path';

describe('asset-path', () => {
  it('construye rutas events/<id>/<kind>-<ts>.<ext>', () => {
    expect(buildAssetPath('e1', 'cover', 'image/png', 123)).toBe('events/e1/cover-123.png');
    expect(buildAssetPath('e1', 'qr', 'image/jpeg', 5)).toBe('events/e1/qr-5.jpg');
    expect(buildAssetPath('e1', 'banner', 'image/webp', 5)).toBe('events/e1/banner-5.webp');
  });
  it('extrae la ruta desde una URL pública', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/event-assets/events/e1/cover-123.png?t=1';
    expect(extractAssetPath(url)).toBe('events/e1/cover-123.png');
    expect(extractAssetPath('https://otro.com/img.png')).toBeNull();
  });
});
