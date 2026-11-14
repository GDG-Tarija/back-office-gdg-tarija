export const REDIRECT_KEY = 'redirect_to';
export const DEFAULT_REDIRECT = '/dashboard';

/** Solo rutas internas de la app: evita open redirects y bucles hacia /auth. */
export function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return DEFAULT_REDIRECT;
  if (value.startsWith('/auth/') || value === '/auth') return DEFAULT_REDIRECT;
  return value;
}

export function accessDeniedMessage(email: string | null | undefined): string {
  const who = email ? `Tu correo ${email}` : 'Tu correo';
  return `${who} no tiene acceso a este panel. Pídele acceso a un organizador de GDG Tarija.`;
}
