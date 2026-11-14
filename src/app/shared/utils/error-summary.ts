export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ErrorSummaryItem {
  /** Id del control en el DOM, para enfocarlo al pulsar el enlace. */
  id: string;
  label: string;
  message: string;
}

export interface FieldRef {
  id: string;
  label: string;
}

/**
 * Convierte errores de validación en ítems del resumen. Un mismo campo aparece una sola vez
 * y los errores sin control asociado (`fields` sin entrada) se descartan del resumen.
 */
export function buildErrorSummary(
  errors: ValidationIssue[],
  fields: Record<string, FieldRef>,
): ErrorSummaryItem[] {
  const seen = new Set<string>();
  const items: ErrorSummaryItem[] = [];
  for (const err of errors) {
    const ref = fields[err.field];
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    items.push({ id: ref.id, label: ref.label, message: err.message });
  }
  return items;
}

/** "Revisa 2 campos: Título, Fecha de fin" */
export function summaryHeading(items: ErrorSummaryItem[]): string {
  const n = items.length;
  return `Revisa ${n} ${n === 1 ? 'campo' : 'campos'}: ${items.map((i) => i.label).join(', ')}`;
}
