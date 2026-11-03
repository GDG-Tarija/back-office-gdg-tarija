import { validateFormFields } from './event-validators';
import {
  DEFAULT_TEMPLATES,
  applyLabel,
  applyTemplate,
  applyType,
  emptyEditorField,
  fromFormFields,
  hasUnsavedChanges,
  moveItem,
  optionIssues,
  toFormFields,
  uniqueKey,
  validateOptions,
} from './form-fields-builder.logic';
import { FormField } from './form-field.model';

const saved: FormField[] = [
  { key: 'a', label: 'A', type: 'text', required: true, placeholder: 'x' },
  { key: 'b', label: 'B', type: 'select', required: false, options: ['1', '2'] },
];

describe('form-fields-builder.logic', () => {
  it('moveItem reordena sin mutar y tolera índices inválidos', () => {
    const l = [1, 2, 3];
    expect(moveItem(l, 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem(l, 2, 1)).toEqual([1, 3, 2]);
    expect(moveItem(l, 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem(l, 0, 3)).toEqual([1, 2, 3]);
    expect(l).toEqual([1, 2, 3]);
  });

  it('uniqueKey añade sufijo incremental', () => {
    expect(uniqueKey('nombre', ['otro'])).toBe('nombre');
    expect(uniqueKey('nombre', ['nombre'])).toBe('nombre_2');
    expect(uniqueKey('nombre', ['nombre', 'nombre_2'])).toBe('nombre_3');
    expect(uniqueKey('', ['x'])).toBe('');
  });

  it('applyLabel autogenera key única solo en campos nuevos sin key editada', () => {
    const fields = [...fromFormFields(saved), emptyEditorField()];
    const r = applyLabel(fields, 2, '¿Cuál es tu edad?');
    expect(r[2].key).toBe('cual_es_tu_edad');
    const dup = applyLabel(r, 2, 'A');
    expect(dup[2].key).toBe('a_2');
    // existente: no cambia
    expect(applyLabel(fields, 0, 'Otro nombre')[0].key).toBe('a');
    // key editada a mano: no cambia
    const manual = [{ ...fields[2], keyEdited: true, key: 'mi_key' }];
    expect(applyLabel(manual, 0, 'Algo')[0].key).toBe('mi_key');
  });

  it('applyType a select garantiza 2 filas de opciones', () => {
    const r = applyType([emptyEditorField()], 0, 'select');
    expect(r[0].options).toHaveLength(2);
  });

  it('toFormFields respeta el contrato: options solo select, sin placeholder en checkbox', () => {
    const ed = fromFormFields(saved);
    ed[0] = { ...ed[0], type: 'checkbox', placeholder: 'x', options: ['z'] };
    ed[1] = { ...ed[1], options: [' 1 ', '', '2'], placeholder: '' };
    const out = toFormFields(ed);
    expect(out[0]).toEqual({ key: 'a', label: 'A', type: 'checkbox', required: true });
    expect(out[1]).toEqual({
      key: 'b',
      label: 'B',
      type: 'select',
      required: false,
      options: ['1', '2'],
    });
  });

  it('hasUnsavedChanges compara por contenido', () => {
    expect(hasUnsavedChanges(saved, fromFormFields(saved))).toBe(false);
    const ed = fromFormFields(saved);
    ed[0] = { ...ed[0], required: false };
    expect(hasUnsavedChanges(saved, ed)).toBe(true);
    expect(hasUnsavedChanges(saved, moveItem(fromFormFields(saved), 0, 1))).toBe(true);
  });

  it('optionIssues y validateOptions detectan duplicados y vacías', () => {
    expect(optionIssues({ type: 'select', options: ['Si', 'si', ''] })).toEqual({
      duplicates: ['si'],
      hasEmpty: true,
    });
    expect(optionIssues({ type: 'text', options: ['a', 'a'] }).duplicates).toEqual([]);
    const ed = fromFormFields(saved);
    expect(validateOptions(ed)).toEqual([]);
    ed[1] = { ...ed[1], options: ['x', 'X'] };
    expect(validateOptions(ed)[0].field).toBe('fields[1].options');
  });

  it('las plantillas por defecto son válidas', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(validateFormFields(t.fields).errors).toEqual([]);
      expect(validateOptions(fromFormFields(t.fields))).toEqual([]);
    }
  });

  it('applyTemplate replace reemplaza y append omite keys repetidas', () => {
    const cur = fromFormFields(saved);
    const tpl: FormField[] = [
      { key: 'a', label: 'A2', type: 'text', required: false },
      { key: 'c', label: 'C', type: 'checkbox', required: false },
    ];
    const rep = applyTemplate(cur, tpl, 'replace');
    expect(rep.map((f) => f.key)).toEqual(['a', 'c']);
    expect(rep.every((f) => f.isNew)).toBe(true);
    const app = applyTemplate(cur, tpl, 'append');
    expect(app.map((f) => f.key)).toEqual(['a', 'b', 'c']);
    expect(app[0].isNew).toBe(false);
    expect(app[2].isNew).toBe(true);
  });
});
