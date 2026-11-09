export type DomainErrorCode =
  | 'DUPLICATE'
  | 'HAS_REGISTRATIONS'
  | 'REFERENCED'
  | 'FORBIDDEN'
  | 'INVALID'
  | 'SOLD_OUT'
  | 'UNKNOWN';

/** Error con mensaje legible para el usuario, independiente de Postgres. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: DomainErrorCode,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
