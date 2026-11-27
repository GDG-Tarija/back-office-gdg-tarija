import { RAFFLE_QR_NAME_MAX, raffleQrNameError } from './raffle-qr.model';

describe('raffleQrNameError', () => {
  it('acepta un nombre nuevo', () => {
    expect(raffleQrNameError('Feria · Flutter Tarija', ['Zona Zen'])).toBeNull();
  });

  it('rechaza el nombre vacío o solo con espacios', () => {
    expect(raffleQrNameError('   ', [])).toBe('Escribe un nombre.');
  });

  it('rechaza un nombre demasiado largo', () => {
    expect(raffleQrNameError('a'.repeat(RAFFLE_QR_NAME_MAX + 1), [])).toContain('Máximo');
  });

  it('rechaza un nombre repetido aunque venga con espacios alrededor', () => {
    expect(raffleQrNameError(' Zona Zen ', ['Zona Zen'])).toContain('Ya existe');
  });
});
