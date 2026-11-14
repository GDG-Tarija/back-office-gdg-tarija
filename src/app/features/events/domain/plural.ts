/** "1 persona inscrita" / "3 personas inscritas": evita el "(s)" en mensajes al usuario. */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function inscritas(n: number): string {
  return plural(n, 'persona inscrita', 'personas inscritas');
}
