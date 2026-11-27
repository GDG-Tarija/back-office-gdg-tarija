import { RaffleQr } from './raffle-qr.model';

export abstract class RaffleQrsRepository {
  abstract list(eventId: string): Promise<RaffleQr[]>;
  /** Crea la actividad y su QR encendido. */
  abstract create(eventId: string, name: string): Promise<RaffleQr>;
  abstract rename(activityId: string, name: string): Promise<void>;
  /** Enciende o apaga el QR; si la actividad no tenía, lo crea. */
  abstract setActive(qr: RaffleQr, active: boolean): Promise<RaffleQr>;
  /** Borra la actividad con su QR: sus tickets dejan de contar para todos. */
  abstract delete(activityId: string): Promise<void>;
}
