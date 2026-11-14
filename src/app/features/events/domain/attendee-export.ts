import { formatCustomResponseLabel } from './attendee-search';
import { attendeeRoleLabel } from './attendee-role';
import { entryLabel } from './attendee-payment';
import { Attendee } from './event.model';
import { FormField } from './form-field.model';
import { registrationStatusLabel } from './registration-status';

export interface ExportTable {
  headers: string[];
  rows: string[][];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "dd/MM/yyyy HH:mm" en hora local, como se ve en la tabla. */
export function formatExportDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatResponse(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value === true || value === 'true') return 'Sí';
  if (value === false || value === 'false') return 'No';
  if (Array.isArray(value)) return value.map(formatResponse).join(', ');
  return String(value);
}

function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h} (${count})`;
  });
}

/**
 * Tabla de exportación en español. Las columnas de respuestas salen del formulario del evento
 * (etiquetas reales, en su orden); las claves que ya no están en el formulario van al final.
 */
export function buildAttendeeExport(
  attendees: readonly Attendee[],
  formFields: readonly FormField[],
): ExportTable {
  const fieldKeys = formFields.map((f) => f.key);
  const extraKeys = Array.from(
    new Set(attendees.flatMap((a) => Object.keys(a.customResponses ?? {}))),
  )
    .filter((k) => !fieldKeys.includes(k))
    .sort((a, b) => a.localeCompare(b));
  const responseColumns = [
    ...formFields.map((f) => ({ key: f.key, label: f.label })),
    ...extraKeys.map((key) => ({ key, label: formatCustomResponseLabel(key) })),
  ];

  const headers = uniqueHeaders([
    'Nombre',
    'Apellido',
    'Correo',
    'Celular',
    'Rol',
    'Estado',
    'Entrada',
    'Monto a pagar (Bs)',
    'Cupón',
    'Check-in',
    'Fecha de check-in',
    'Fecha de inscripción',
    'Comprobante',
    ...responseColumns.map((c) => c.label),
  ]);

  const rows = attendees.map((a) => [
    a.firstName,
    a.lastName,
    a.email,
    a.phone ?? '',
    attendeeRoleLabel(a.role),
    registrationStatusLabel(a.status),
    entryLabel(a),
    String(a.amountDue),
    a.couponCode ?? (a.couponId ? 'Sí' : ''),
    a.checkedIn ? 'Sí' : 'No',
    formatExportDate(a.checkedInAt),
    formatExportDate(a.registeredAt),
    a.paymentProofUrl ?? '',
    ...responseColumns.map((c) => formatResponse(a.customResponses?.[c.key])),
  ]);

  return { headers, rows };
}

const FORMULA_START = /^[=+\-@\t\r]/;
/** Número completo (teléfono con +, monto con signo): Excel lo lee como dato, no como fórmula. */
const PURE_NUMBER = /^[+-]?\d+([.,]\d+)?$/;

/** Evita que Excel interprete texto del usuario como fórmula (=, +, -, @, TAB, CR). */
function escapeCsv(value: string): string {
  let str = value;
  if (FORMULA_START.test(str) && !PURE_NUMBER.test(str)) str = `'${str}`;
  str = str.replace(/"/g, '""');
  return /[",\n\r\t]/.test(str) ? `"${str}"` : str;
}

export function toCsv(table: ExportTable): string {
  return [table.headers, ...table.rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}
