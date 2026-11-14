/** Bolivia no tiene horario de verano: La Paz es UTC-4 todo el año. */
export const LA_PAZ_TIMEZONE = 'America/La_Paz';
/** Desplazamiento fijo para `DatePipe` (`timezone`) y cuentas de día. */
export const LA_PAZ_UTC_OFFSET = '-0400';

const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Instante (ms UTC) de la medianoche de La Paz del día en que cae `date`, sin importar la zona del dispositivo. */
export function startOfLaPazDay(date: Date): number {
  const day = Math.floor((date.getTime() - LA_PAZ_OFFSET_MS) / DAY_MS);
  return day * DAY_MS + LA_PAZ_OFFSET_MS;
}
