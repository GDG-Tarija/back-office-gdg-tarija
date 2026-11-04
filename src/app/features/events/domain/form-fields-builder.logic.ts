import { fieldKeyFromLabel } from './event-validators';
import { FormField, FormFieldType } from './form-field.model';

/** Campo en edición. `uid` es estable para el track; `isNew` = aún no guardado en el evento. */
export interface EditorField {
  uid: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string;
  options: string[];
  isNew: boolean;
  /** El usuario editó la key a mano: deja de seguir al label. */
  keyEdited: boolean;
}

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  checkbox: 'Casilla (sí/no)',
  select: 'Lista de opciones',
};

let uidCounter = 0;
export function nextUid(): string {
  uidCounter += 1;
  return `ff-${uidCounter}`;
}

/** Devuelve una copia con el elemento movido (sin mutar). Índices fuera de rango => igual. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from === to || from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Key única: añade _2, _3... si ya existe en `taken`. Vacía => vacía. */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  if (!base) return '';
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** Key sugerida para el campo `index` a partir de su label, única respecto a los demás. */
export function suggestKey(label: string, fields: readonly EditorField[], index: number): string {
  const others = fields.filter((_, i) => i !== index).map((f) => f.key);
  return uniqueKey(fieldKeyFromLabel(label), others);
}

export function emptyEditorField(type: FormFieldType = 'text'): EditorField {
  return {
    uid: nextUid(),
    key: '',
    label: '',
    type,
    required: false,
    placeholder: '',
    options: type === 'select' ? ['', ''] : [],
    isNew: true,
    keyEdited: false,
  };
}

/** Cambia el label; si el campo es nuevo y su key no se editó a mano, regenera la key. */
export function applyLabel(
  fields: readonly EditorField[],
  index: number,
  label: string,
): EditorField[] {
  return fields.map((f, i) => {
    if (i !== index) return f;
    const next = { ...f, label };
    if (f.isNew && !f.keyEdited) next.key = suggestKey(label, fields, index);
    return next;
  });
}

/** Cambia el tipo ajustando opciones (select necesita ≥ 2 filas). */
export function applyType(
  fields: readonly EditorField[],
  index: number,
  type: FormFieldType,
): EditorField[] {
  return fields.map((f, i) => {
    if (i !== index) return f;
    let options = f.options;
    if (type === 'select' && options.length < 2)
      options = [...options, ...Array(2 - options.length).fill('')];
    return { ...f, type, options };
  });
}

export function fromFormFields(fields: readonly FormField[]): EditorField[] {
  return fields.map((f) => ({
    uid: nextUid(),
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder ?? '',
    options: f.options ? [...f.options] : [],
    isNew: false,
    keyEdited: true,
  }));
}

/** Mapea al contrato público: options solo en select, placeholder solo si hay. */
export function toFormFields(fields: readonly EditorField[]): FormField[] {
  return fields.map((f) => {
    const out: FormField = {
      key: f.key.trim(),
      label: f.label.trim(),
      type: f.type,
      required: f.required,
    };
    const ph = f.placeholder.trim();
    if (ph && f.type !== 'checkbox') out.placeholder = ph;
    if (f.type === 'select') out.options = f.options.map((o) => o.trim()).filter(Boolean);
    return out;
  });
}

export function hasUnsavedChanges(
  saved: readonly FormField[],
  current: readonly EditorField[],
): boolean {
  return (
    JSON.stringify(toFormFields(fromFormFields(saved))) !== JSON.stringify(toFormFields(current))
  );
}

/** Opciones vacías/duplicadas de un select (sin distinguir mayúsculas). Complementa validateFormFields. */
export function optionIssues(field: Pick<EditorField, 'type' | 'options'>): {
  duplicates: string[];
  hasEmpty: boolean;
} {
  if (field.type !== 'select') return { duplicates: [], hasEmpty: false };
  const seen = new Set<string>();
  const dup = new Set<string>();
  let hasEmpty = false;
  for (const raw of field.options) {
    const o = raw.trim();
    if (!o) {
      hasEmpty = true;
      continue;
    }
    const k = o.toLowerCase();
    if (seen.has(k)) dup.add(o);
    seen.add(k);
  }
  return { duplicates: [...dup], hasEmpty };
}

/** Errores de opciones por índice de campo: 'fields[i].options'. */
export function validateOptions(
  fields: readonly EditorField[],
): { field: string; message: string }[] {
  const out: { field: string; message: string }[] = [];
  fields.forEach((f, i) => {
    const { duplicates, hasEmpty } = optionIssues(f);
    if (duplicates.length) {
      out.push({
        field: `fields[${i}].options`,
        message: `Opciones repetidas: ${duplicates.join(', ')}.`,
      });
    }
    if (hasEmpty) {
      out.push({
        field: `fields[${i}].options`,
        message: 'Hay opciones vacías: complétalas o quítalas.',
      });
    }
  });
  return out;
}

/** Plantillas por defecto (basadas en los eventos existentes). */
export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
}

export const DEFAULT_TEMPLATES: readonly FormTemplate[] = [
  {
    id: 'como-te-enteraste',
    name: 'Cómo te enteraste',
    description: 'Canal por el que conociste el evento.',
    fields: [
      {
        key: 'como_te_enteraste',
        label: '¿Cómo te enteraste del evento?',
        type: 'select',
        required: false,
        options: ['Redes sociales', 'Amigos o colegas', 'Universidad', 'Comunidad GDG', 'Otro'],
      },
    ],
  },
  {
    id: 'nivel-experiencia',
    name: 'Nivel de experiencia',
    description: 'Nivel técnico del asistente.',
    fields: [
      {
        key: 'nivel_experiencia',
        label: 'Nivel de experiencia',
        type: 'select',
        required: true,
        options: ['Principiante', 'Intermedio', 'Avanzado'],
      },
    ],
  },
  {
    id: 'perfil-profesional',
    name: 'Perfil profesional',
    description: 'Institución y ocupación.',
    fields: [
      {
        key: 'institucion',
        label: 'Universidad o empresa',
        type: 'text',
        required: false,
        placeholder: 'Ej. UAJMS',
      },
      {
        key: 'ocupacion',
        label: 'Ocupación',
        type: 'text',
        required: false,
        placeholder: 'Ej. Estudiante',
      },
    ],
  },
  {
    id: 'consentimiento',
    name: 'Consentimiento de fotos',
    description: 'Autorización para uso de imagen.',
    fields: [
      {
        key: 'acepta_fotos',
        label: 'Autorizo el uso de fotos y videos del evento',
        type: 'checkbox',
        required: false,
      },
    ],
  },
];

/**
 * Aplica campos de una plantilla/otro evento.
 * - `replace`: reemplaza todo (campos previos desaparecen).
 * - `append`: conserva los actuales y agrega solo los que no choquen por key.
 * Los campos resultantes son nuevos salvo los conservados.
 */
export function applyTemplate(
  current: readonly EditorField[],
  template: readonly FormField[],
  mode: 'replace' | 'append',
): EditorField[] {
  const base = mode === 'replace' ? [] : [...current];
  const taken = new Set(base.map((f) => f.key));
  const added: EditorField[] = [];
  for (const f of fromFormFields(template)) {
    if (taken.has(f.key)) continue;
    taken.add(f.key);
    added.push({ ...f, isNew: true, keyEdited: true });
  }
  return [...base, ...added];
}

/** Resumen de qué haría aplicar una plantilla (para el texto de confirmación). */
export function templateSkippedCount(
  current: readonly EditorField[],
  template: readonly FormField[],
): number {
  const keys = new Set(current.map((f) => f.key));
  return template.filter((f) => keys.has(f.key)).length;
}
