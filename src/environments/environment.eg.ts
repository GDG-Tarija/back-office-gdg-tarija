// Plantilla para src/environments/environment.ts (ignorado por git).
// Apunta al Supabase local (`npm run db:start` en back-office-gdg-tarija).
// La key es la publishable key por defecto del stack local: es pública e igual en todas
// las máquinas. Nunca pongas aquí la URL o las keys de producción.
export const environment = {
  production: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
};
