import { accessDeniedMessage, safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('conserva rutas internas con query', () => {
    expect(safeRedirect('/events/abc/attendees?x=1')).toBe('/events/abc/attendees?x=1');
  });

  it.each([null, '', 'https://evil.test', '//evil.test', '/auth/login', '/auth/callback'])(
    'cae a inicio con %j',
    (value) => {
      expect(safeRedirect(value)).toBe('/dashboard');
    },
  );
});

describe('accessDeniedMessage', () => {
  it('incluye el correo en tuteo', () => {
    expect(accessDeniedMessage('a@b.com')).toBe(
      'Tu correo a@b.com no tiene acceso a este panel. Pídele acceso a un organizador de GDG Tarija.',
    );
  });
});
