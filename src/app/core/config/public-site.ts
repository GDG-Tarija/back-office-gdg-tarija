import { environment } from '../../../environments/environment';

const DEFAULT_PUBLIC_SITE_URL = 'https://eventos.gdgtarija.com';

// `environment.ts` es local de cada quien (ignorado por git): si todavía no tiene `publicSiteUrl`,
// los enlaces caen al sitio de producción en vez de romper la compilación.
const env: { production: boolean; publicSiteUrl?: string } = environment;

export const PUBLIC_SITE_URL = (env.publicSiteUrl || DEFAULT_PUBLIC_SITE_URL).replace(/\/+$/, '');

/** Página pública de registro de un evento en eventos-gdg-tarija (`/e/:slug`). */
export function publicEventUrl(slug: string): string {
  return `${PUBLIC_SITE_URL}/e/${encodeURIComponent(slug)}`;
}
