import { PUBLIC_SITE_URL, publicEventUrl } from './public-site';

describe('publicEventUrl', () => {
  it('arma la ruta /e/:slug del sitio público sin barras dobles', () => {
    expect(PUBLIC_SITE_URL.endsWith('/')).toBe(false);
    expect(publicEventUrl('devfest-2026')).toBe(`${PUBLIC_SITE_URL}/e/devfest-2026`);
  });

  it('codifica el slug', () => {
    expect(publicEventUrl('a b')).toBe(`${PUBLIC_SITE_URL}/e/a%20b`);
  });
});
