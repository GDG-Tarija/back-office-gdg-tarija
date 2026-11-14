/** No se pudo consultar el rol (red o servidor): no es lo mismo que "sin rol". */
export class RoleLookupError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('No se pudo verificar el rol del usuario', options);
    this.name = 'RoleLookupError';
  }
}

export const ACCESS_CHECK_URL = '/auth/verificar';
