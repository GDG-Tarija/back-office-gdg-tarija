export type FormFieldType = 'text' | 'number' | 'checkbox' | 'select';

export const FORM_FIELD_TYPES: readonly FormFieldType[] = ['text', 'number', 'checkbox', 'select'];

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}
