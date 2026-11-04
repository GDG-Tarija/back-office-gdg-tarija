export abstract class SessionRegistrationsRepository {
  /** Inscritos por sesión (session_id -> cantidad) para las sesiones dadas. */
  abstract getCounts(sessionIds: string[]): Promise<Record<string, number>>;
}
