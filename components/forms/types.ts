// Types for the DynamicForm renderer — the shape of the §7 form-template JSON
// (`form_templates.schema`) and the answer values it produces. Kept framework-free
// so both the client renderer and pure helpers/tests can import it.

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "multiselect"
  | "scale_1_5"
  | "scale_0_5"
  | "scale_1_10"
  | "repeat_group"
  | "frequency_grid"
  | "info";

export type FieldOption = { value: string; label: string };

export type ShowIf = { field: string; equals: unknown };

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  hint?: string;
  /** info fields: the callout body. */
  text?: string;
  options?: FieldOption[];
  /** select/multiselect: offer a free-text "Other" entry. */
  allowOther?: boolean;
  showIf?: ShowIf;
  /** repeat_group: the columns of each row. */
  subfields?: FormField[];
  /** frequency_grid: row labels. */
  rows?: string[];
  /** frequency_grid: column labels (the selectable options per row). */
  cols?: string[];
};

export type FormSection = {
  id: string;
  title: string;
  fields: FormField[];
};

export type FormTemplateSchema = {
  key: string;
  version: number;
  title: string;
  sections: FormSection[];
};

export type FormValues = Record<string, unknown>;

/** One row of a repeat_group. */
export type RepeatRow = Record<string, unknown>;

/**
 * Soft, advisory rendering affordances for a field (units, a +/- stepper). These
 * are presentation-only hints — they never add a validation gate. Passed to
 * DynamicForm out-of-band so the template schema stays untouched.
 */
export type FieldHint = {
  unit?: string;
  stepper?: boolean;
  min?: number;
  max?: number;
  step?: number;
};

/** The scale ranges keyed by field type. */
export const SCALE_RANGES: Record<"scale_1_5" | "scale_0_5" | "scale_1_10", number[]> = {
  scale_1_5: [1, 2, 3, 4, 5],
  scale_0_5: [0, 1, 2, 3, 4, 5],
  scale_1_10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};
