"use client";

// DynamicForm — renders a list of §7 form fields from a template schema. Supports
// every §7.1 field type, `showIf` conditions, `allowOther` free-text on
// select/multiselect, repeat_group cards, and frequency grids. Controlled: the
// parent owns `values` and receives every change via `onChange(key, value)`
// (repeat/other companions write sibling keys, hence key-addressed).
import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isFieldVisible } from "./logic";
import {
  SCALE_RANGES,
  type FieldHint,
  type FormField,
  type FormValues,
  type RepeatRow,
} from "./types";

const CONTROL =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

const SEG_BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 py-2 text-base font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const SEG_ON = "border-primary bg-primary text-primary-foreground";
const SEG_OFF = "border-input bg-background hover:bg-muted";

const STEP_BTN =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function segClass(active: boolean, invalid?: boolean): string {
  return cn(SEG_BASE, active ? SEG_ON : SEG_OFF, invalid && !active && "border-destructive");
}

function numberFromInput(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export type DynamicFormProps = {
  fields: FormField[];
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  /** Field ids to mark invalid (missing required). */
  errors?: Set<string>;
  idPrefix?: string;
  /** Soft per-field UI hints (units / steppers). Omit ⇒ unchanged behavior. */
  hints?: Record<string, FieldHint>;
};

export function DynamicForm({
  fields,
  values,
  onChange,
  errors,
  idPrefix = "",
  hints,
}: DynamicFormProps) {
  return (
    <div className="space-y-6">
      {fields.map((field) => {
        if (!isFieldVisible(field, values)) return null;
        return (
          <FieldBlock
            key={field.id}
            field={field}
            values={values}
            onChange={onChange}
            invalid={errors?.has(field.id) ?? false}
            idPrefix={idPrefix}
            hint={hints?.[field.id]}
          />
        );
      })}
    </div>
  );
}

function FieldBlock({
  field,
  values,
  onChange,
  invalid,
  idPrefix,
  hint,
}: {
  field: FormField;
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  invalid: boolean;
  idPrefix: string;
  hint?: FieldHint;
}) {
  const id = `${idPrefix}${field.id}`;

  if (field.type === "info") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {field.label ? <p className="mb-1 font-medium text-foreground">{field.label}</p> : null}
        <p className="whitespace-pre-line">{field.text}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-base">
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {field.hint ? <p className="text-sm text-muted-foreground">{field.hint}</p> : null}

      {field.type === "repeat_group" ? (
        <RepeatGroup field={field} value={values[field.id]} onChange={(v) => onChange(field.id, v)} invalid={invalid} idPrefix={id} />
      ) : field.type === "frequency_grid" ? (
        <FrequencyGrid field={field} value={values[field.id]} onChange={(v) => onChange(field.id, v)} invalid={invalid} />
      ) : (
        <LeafControl
          field={field}
          id={id}
          value={values[field.id]}
          setValue={(v) => onChange(field.id, v)}
          invalid={invalid}
          hint={hint}
          otherText={typeof values[`${field.id}_other`] === "string" ? (values[`${field.id}_other`] as string) : ""}
          setOtherText={(t) => onChange(`${field.id}_other`, t)}
        />
      )}

      {invalid ? <p className="text-sm text-destructive">This field is required.</p> : null}
    </div>
  );
}

// Leaf (non-container) controls: text/textarea/number/date/boolean/select/
// multiselect/scale_*. Reused for repeat_group subfields.
function LeafControl({
  field,
  id,
  value,
  setValue,
  invalid,
  hint,
  otherText,
  setOtherText,
}: {
  field: FormField;
  id: string;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  hint?: FieldHint;
  otherText?: string;
  setOtherText?: (t: string) => void;
}) {
  switch (field.type) {
    case "text":
    case "date":
      return (
        <Input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid}
          className="h-11 text-base"
        />
      );

    case "number":
      return (
        <NumberControl id={id} value={value} setValue={setValue} invalid={invalid} hint={hint} />
      );

    case "textarea":
      return (
        <textarea
          id={id}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid}
          className={cn(CONTROL, "h-auto min-h-24 py-2", invalid && "border-destructive")}
        />
      );

    case "boolean":
      return (
        <div className="flex gap-2" role="group">
          {[
            { label: "Yes", v: true },
            { label: "No", v: false },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setValue(o.v)}
              className={segClass(value === o.v, invalid)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case "scale_1_5":
    case "scale_0_5":
    case "scale_1_10":
      return (
        <div className="flex flex-wrap gap-2" role="group">
          {SCALE_RANGES[field.type].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setValue(n)}
              className={segClass(value === n, invalid)}
              aria-label={String(n)}
            >
              {n}
            </button>
          ))}
        </div>
      );

    case "select":
      return (
        <SelectControl
          field={field}
          value={value}
          setValue={setValue}
          invalid={invalid}
          otherText={otherText ?? ""}
          setOtherText={setOtherText}
        />
      );

    case "multiselect":
      return (
        <MultiSelectControl
          field={field}
          value={value}
          setValue={setValue}
          invalid={invalid}
          otherText={otherText ?? ""}
          setOtherText={setOtherText}
        />
      );

    default:
      return null;
  }
}

// Number entry. Plain input by default (unchanged); when a hint asks for it,
// gains a unit suffix and/or big +/- steppers for easy phone/elderly use. The
// steppers only clamp to the hint's soft min/max — typing stays unrestricted and
// no new validation gate is introduced.
function NumberControl({
  id,
  value,
  setValue,
  invalid,
  hint,
}: {
  id: string;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  hint?: FieldHint;
}) {
  const num = typeof value === "number" ? value : undefined;

  const field = (
    <div className="relative flex-1">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={num ?? ""}
        onChange={(e) => setValue(numberFromInput(e.target.value))}
        aria-invalid={invalid}
        className={cn("h-11 text-base", hint?.unit && "pr-12")}
      />
      {hint?.unit ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {hint.unit}
        </span>
      ) : null}
    </div>
  );

  if (!hint?.stepper) return field;

  const step = hint.step ?? 1;
  const clamp = (n: number) => {
    let x = n;
    if (hint.min != null) x = Math.max(hint.min, x);
    if (hint.max != null) x = Math.min(hint.max, x);
    // Round to the step's precision to avoid 0.30000000004 drift.
    return Math.round(x / step) * step;
  };
  const bump = (dir: 1 | -1) => setValue(clamp((num ?? hint.min ?? 0) + dir * step));

  return (
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={() => bump(-1)} aria-label="Decrease" className={STEP_BTN}>
        <Minus className="size-4" aria-hidden />
      </button>
      {field}
      <button type="button" onClick={() => bump(1)} aria-label="Increase" className={STEP_BTN}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function SelectControl({
  field,
  value,
  setValue,
  invalid,
  otherText,
  setOtherText,
}: {
  field: FormField;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  otherText: string;
  setOtherText?: (t: string) => void;
}) {
  const options = field.options ?? [];
  const current = typeof value === "string" ? value : "";
  // Templates that need free text include an explicit "Other" option alongside
  // allowOther; selecting it reveals a companion `{id}_other` text field.
  const otherSelected = field.allowOther && current === "Other";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setValue(o.value)}
            className={segClass(current === o.value, invalid)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {otherSelected && setOtherText ? (
        <Input
          value={otherText}
          placeholder="Please specify"
          onChange={(e) => setOtherText(e.target.value)}
          aria-invalid={invalid}
          className="h-11 text-base"
        />
      ) : null}
    </div>
  );
}

function MultiSelectControl({
  field,
  value,
  setValue,
  invalid,
  otherText,
  setOtherText,
}: {
  field: FormField;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  otherText: string;
  setOtherText?: (t: string) => void;
}) {
  const selected = Array.isArray(value) ? (value.filter((v) => typeof v === "string") as string[]) : [];
  const options = field.options ?? [];
  const otherSelected = field.allowOther && selected.includes("Other");

  function toggle(v: string) {
    setValue(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={segClass(selected.includes(o.value), invalid)}
            aria-pressed={selected.includes(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {otherSelected && setOtherText ? (
        <Input
          value={otherText}
          placeholder="Please specify"
          onChange={(e) => setOtherText(e.target.value)}
          className="h-11 text-base"
        />
      ) : null}
    </div>
  );
}

function RepeatGroup({
  field,
  value,
  onChange,
  invalid,
  idPrefix,
}: {
  field: FormField;
  value: unknown;
  onChange: (rows: RepeatRow[]) => void;
  invalid: boolean;
  idPrefix: string;
}) {
  const subfields = field.subfields ?? [];
  const rows: RepeatRow[] = Array.isArray(value) ? (value as RepeatRow[]) : [];
  const display = rows.length > 0 ? rows : [emptyRow(subfields)];

  function update(index: number, subId: string, v: unknown) {
    const next = display.map((r, i) => (i === index ? { ...r, [subId]: v } : r));
    onChange(next);
  }
  function add() {
    onChange([...display, emptyRow(subfields)]);
  }
  function remove(index: number) {
    const next = display.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyRow(subfields)]);
  }

  return (
    <div className="space-y-3">
      {display.map((row, i) => (
        <div
          key={i}
          className={cn(
            "relative rounded-lg border p-3",
            invalid && i === 0 ? "border-destructive" : "border-border",
          )}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {subfields.map((sf) => (
              <div key={sf.id} className="space-y-1">
                <Label htmlFor={`${idPrefix}-${i}-${sf.id}`} className="text-sm text-muted-foreground">
                  {sf.label}
                </Label>
                <LeafControl
                  field={sf}
                  id={`${idPrefix}-${i}-${sf.id}`}
                  value={row[sf.id]}
                  setValue={(v) => update(i, sf.id, v)}
                  invalid={false}
                />
              </div>
            ))}
          </div>
          {display.length > 1 ? (
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-destructive"
              aria-label="Remove row"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        <Plus className="size-4" /> Add another
      </button>
    </div>
  );
}

function emptyRow(subfields: FormField[]): RepeatRow {
  const row: RepeatRow = {};
  for (const sf of subfields) row[sf.id] = sf.type === "number" ? undefined : "";
  return row;
}

function FrequencyGrid({
  field,
  value,
  onChange,
  invalid,
}: {
  field: FormField;
  value: unknown;
  onChange: (grid: Record<string, string>) => void;
  invalid: boolean;
}) {
  const rows = field.rows ?? [];
  const cols = field.cols ?? [];
  const grid: Record<string, string> =
    value && typeof value === "object" ? (value as Record<string, string>) : {};

  function set(row: string, col: string) {
    onChange({ ...grid, [row]: col });
  }

  return (
    <>
      {/* Mobile: each row its own card with full-size, tappable option buttons. */}
      <div className="space-y-3 sm:hidden">
        {rows.map((r) => (
          <div
            key={r}
            className={cn(
              "rounded-lg border p-3",
              invalid && !grid[r] ? "border-destructive/60" : "border-border",
            )}
          >
            <p className="mb-2 font-medium">{r}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={r}>
              {cols.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set(r, c)}
                  aria-pressed={grid[r] === c}
                  className={cn(segClass(grid[r] === c), "flex-1 basis-[45%] text-sm")}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ≥sm: the compact matrix. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr>
              <th className="text-left font-medium" />
              {cols.map((c) => (
                <th key={c} className="px-2 text-center font-medium text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className={cn(invalid && !grid[r] && "outline outline-1 outline-destructive/40")}>
                <td className="whitespace-nowrap pr-3 font-medium">{r}</td>
                {cols.map((c) => (
                  <td key={c} className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => set(r, c)}
                      aria-pressed={grid[r] === c}
                      aria-label={`${r}: ${c}`}
                      className={cn(
                        "size-8 rounded-full border transition-colors",
                        grid[r] === c ? "border-primary bg-primary" : "border-input bg-background hover:bg-muted",
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
