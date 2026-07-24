// T2.3 — Zod contract for the §7 form-template JSON (`form_templates.schema`).
// Parsed at load so a malformed template is a hard error instead of an unchecked
// `as unknown as FormTemplateSchema` cast. Template-authoring metadata the renderer
// does not consume (template `meta`, section `footnote`, field `maxItems`) is
// stripped — the render schema stays exactly the shape DynamicForm reads.
import { z } from "zod";
import type { FormField, FormSection, FormTemplateSchema } from "./types";

const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
  "select",
  "multiselect",
  "scale_1_5",
  "scale_0_5",
  "scale_1_10",
  "repeat_group",
  "frequency_grid",
  "info",
] as const;

const fieldOption = z.object({ value: z.string(), label: z.string() });
const showIf = z.object({ field: z.string(), equals: z.unknown() });

const formField: z.ZodType<FormField> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(FIELD_TYPES),
    label: z.string(),
    required: z.boolean().optional(),
    hint: z.string().optional(),
    text: z.string().optional(),
    options: z.array(fieldOption).optional(),
    allowOther: z.boolean().optional(),
    showIf: showIf.optional(),
    subfields: z.array(formField).optional(),
    rows: z.array(z.string()).optional(),
    cols: z.array(z.string()).optional(),
  }),
);

const formSection: z.ZodType<FormSection> = z.object({
  id: z.string(),
  title: z.string(),
  fields: z.array(formField),
});

export const formTemplateSchema: z.ZodType<FormTemplateSchema> = z.object({
  key: z.string(),
  version: z.number(),
  title: z.string(),
  sections: z.array(formSection),
});

/** Validate raw `form_templates.schema` JSON into a renderable template. Throws on
 *  a malformed template (blueprint: "malformed template = hard load error"). */
export function parseFormTemplate(json: unknown): FormTemplateSchema {
  return formTemplateSchema.parse(json);
}
