"use client";

// DynamicForm — renders a list of §7 form fields from a template schema. Supports
// every §7.1 field type, `showIf` conditions, `allowOther` free-text on
// select/multiselect, repeat_group cards, and frequency grids. Controlled: the
// parent owns `values` and receives every change via `onChange(key, value)`
// (repeat/other companions write sibling keys, hence key-addressed).
//
// Choices say what kind of choice they are. One answer (Yes/No, a select, a
// scale) is a radiogroup: a dot, arrow keys, one tab stop. Several answers is a
// set of checkboxes: a ticked box and "Choose all that apply". They used to be
// identical chips, so nothing said whether a second tap added or replaced.
import * as React from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isFieldVisible, requiredMessage, toggleChoice } from "./logic";
import {
  SCALE_RANGES,
  type FieldHint,
  type FormField,
  type FormValues,
  type RepeatRow,
} from "./types";

const CONTROL =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base outline-none transition-colors duration-(--motion-press) hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted disabled:opacity-50";

const SEG_BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-base font-medium outline-none select-none transition-[color,background-color,border-color,scale] duration-(--motion-press) ease-out active:scale-[0.97] motion-reduce:active:scale-100 elderly:active:scale-100 focus-visible:ring-3 focus-visible:ring-ring/50";
const SEG_ON = "border-primary bg-primary text-primary-foreground";
const SEG_OFF =
  "border-input bg-card text-foreground hover:border-foreground/60 hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_4%)]";

const STEP_BTN =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-foreground transition-[background-color,border-color,scale] duration-(--motion-press) ease-out hover:border-foreground/60 hover:bg-muted active:scale-[0.97] motion-reduce:active:scale-100 elderly:active:scale-100 disabled:opacity-40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Types answered by picking or adding, not typing: labelled as a group. */
const GROUP_TYPES = new Set<FormField["type"]>([
  "boolean",
  "select",
  "multiselect",
  "scale_1_5",
  "scale_0_5",
  "scale_1_10",
  "repeat_group",
  "frequency_grid",
]);

function segClass(active: boolean, invalid?: boolean): string {
  return cn(SEG_BASE, active ? SEG_ON : SEG_OFF, invalid && !active && "border-destructive");
}

function numberFromInput(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

/** How a control is named and described: by its question, hint and error. */
type A11y = { labelledBy?: string; describedBy?: string; required?: boolean };

export type DynamicFormProps = {
  fields: FormField[];
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  /** Field ids to mark invalid (missing required). */
  errors?: Set<string>;
  idPrefix?: string;
  /** Soft per-field UI hints (units / steppers). Omit ⇒ unchanged behavior. */
  hints?: Record<string, FieldHint>;
  /** Tag the optional questions instead of starring the required ones — for
   *  forms where most questions are required (onboarding), so the mark lands on
   *  the minority. Clinical forms are mostly optional and keep the star. */
  markOptional?: boolean;
};

export function DynamicForm({
  fields,
  values,
  onChange,
  errors,
  idPrefix = "",
  hints,
  markOptional = false,
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
            markOptional={markOptional}
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
  markOptional,
}: {
  field: FormField;
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  invalid: boolean;
  idPrefix: string;
  hint?: FieldHint;
  markOptional: boolean;
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

  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hintText = [field.hint, field.type === "multiselect" ? "Choose all that apply." : null]
    .filter(Boolean)
    .join(" ");
  const a11y: A11y = {
    labelledBy: labelId,
    describedBy: [hintText && hintId, invalid && errorId].filter(Boolean).join(" ") || undefined,
    required: field.required,
  };
  const question = (
    <>
      {field.label}
      {markOptional ? (
        field.required ? null : (
          <span className="ml-2 inline-block rounded-sm bg-muted px-1.5 py-0.5 align-[0.1em] text-xs font-medium text-muted-foreground">
            Optional
          </span>
        )
      ) : field.required ? (
        <span className="text-destructive"> *</span>
      ) : null}
    </>
  );

  return (
    // `data-field` is how the wizard finds the first unanswered question to
    // focus; scroll-mt keeps it clear of the sticky header when scrolled to.
    <div className="scroll-mt-24 space-y-2" data-field={field.id}>
      {GROUP_TYPES.has(field.type) ? (
        <p id={labelId} className="text-base leading-snug font-medium">
          {question}
        </p>
      ) : (
        <Label htmlFor={id} id={labelId} className="block text-base leading-snug">
          {question}
        </Label>
      )}
      {hintText ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hintText}
        </p>
      ) : null}
      {hint?.previous ? (
        <p className="font-data text-xs text-muted-foreground">
          Last time: <span className="text-foreground">{hint.previous}</span>
        </p>
      ) : null}

      {field.type === "repeat_group" ? (
        <RepeatGroup
          field={field}
          value={values[field.id]}
          onChange={(v) => onChange(field.id, v)}
          invalid={invalid}
          idPrefix={id}
          a11y={a11y}
        />
      ) : field.type === "frequency_grid" ? (
        <FrequencyGrid
          field={field}
          value={values[field.id]}
          onChange={(v) => onChange(field.id, v)}
          invalid={invalid}
          a11y={a11y}
        />
      ) : (
        <LeafControl
          field={field}
          id={id}
          value={values[field.id]}
          setValue={(v) => onChange(field.id, v)}
          invalid={invalid}
          hint={hint}
          a11y={a11y}
          otherText={typeof values[`${field.id}_other`] === "string" ? (values[`${field.id}_other`] as string) : ""}
          setOtherText={(t) => onChange(`${field.id}_other`, t)}
        />
      )}

      {invalid ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {requiredMessage(field)}
        </p>
      ) : null}
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
  a11y,
  otherText,
  setOtherText,
}: {
  field: FormField;
  id: string;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  hint?: FieldHint;
  a11y: A11y;
  otherText?: string;
  setOtherText?: (t: string) => void;
}) {
  const described = {
    "aria-describedby": a11y.describedBy,
    "aria-required": a11y.required || undefined,
    "aria-invalid": invalid || undefined,
  };

  switch (field.type) {
    case "text":
    case "date":
      return (
        <Input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => setValue(e.target.value)}
          {...described}
          className="h-11 text-base"
        />
      );

    case "number":
      return (
        <NumberControl id={id} value={value} setValue={setValue} invalid={invalid} hint={hint} described={described} />
      );

    case "textarea": {
      const text = typeof value === "string" ? value : "";
      const isNone = /^none\.?$/i.test(text.trim());
      return (
        <div className="space-y-2">
          {/* One tap for the commonest honest answer; it writes the same "None"
              people were typing, so nothing downstream changes. */}
          {hint?.none ? (
            <button
              type="button"
              aria-pressed={isNone}
              onClick={() => setValue(isNone ? "" : "None")}
              className={segClass(isNone)}
            >
              <Tick on={isNone} />
              None
            </button>
          ) : null}
          <textarea
            id={id}
            rows={3}
            value={text}
            onChange={(e) => setValue(e.target.value)}
            {...described}
            className={cn(CONTROL, "h-auto min-h-24 py-2", invalid && "border-destructive")}
          />
        </div>
      );
    }

    case "boolean":
      return (
        <RadioGroup
          a11y={a11y}
          invalid={invalid}
          choices={[
            { key: "yes", label: "Yes", checked: value === true, select: () => setValue(true) },
            { key: "no", label: "No", checked: value === false, select: () => setValue(false) },
          ]}
        />
      );

    case "scale_1_5":
    case "scale_0_5":
    case "scale_1_10":
      // Numbers in a row already read as a scale; a dot per number would only
      // double its width and wrap it.
      return (
        <RadioGroup
          a11y={a11y}
          invalid={invalid}
          dot={false}
          choices={SCALE_RANGES[field.type].map((n) => ({
            key: String(n),
            label: n,
            checked: value === n,
            select: () => setValue(n),
          }))}
        />
      );

    case "select":
      return (
        <SelectControl
          field={field}
          value={value}
          setValue={setValue}
          invalid={invalid}
          a11y={a11y}
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
          a11y={a11y}
          otherText={otherText ?? ""}
          setOtherText={setOtherText}
        />
      );

    default:
      return null;
  }
}

/** The radio's dot: an empty ring, filled when chosen. */
function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full border-2",
        on ? "border-current" : "border-input",
      )}
    >
      {on ? <span className="mark-in size-1.5 rounded-full bg-current" /> : null}
    </span>
  );
}

/** The checkbox's box: empty, ticked when chosen. */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border-2",
        on ? "border-current" : "border-input",
      )}
    >
      {on ? <Check className="mark-in size-3" strokeWidth={3} /> : null}
    </span>
  );
}

type Choice = {
  key: string;
  label: React.ReactNode;
  checked: boolean;
  select: () => void;
  ariaLabel?: string;
};

/**
 * One answer from a set. A real radiogroup: a single tab stop (the chosen
 * option, else the first), arrow keys move the choice, Home/End jump, exactly
 * as a native radio set behaves.
 */
function RadioGroup({
  choices,
  a11y,
  ariaLabel,
  invalid,
  dot = true,
  className,
  itemClassName,
}: {
  choices: Choice[];
  a11y?: A11y;
  /** For groups with no visible question element (a frequency-grid row). */
  ariaLabel?: string;
  invalid?: boolean;
  dot?: boolean;
  className?: string;
  itemClassName?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = Math.max(
    0,
    choices.findIndex((c) => c.checked),
  );

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = choices.length - 1;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    choices[next].select();
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabel ? undefined : a11y?.labelledBy}
      aria-label={ariaLabel}
      aria-describedby={a11y?.describedBy}
      aria-required={a11y?.required || undefined}
      aria-invalid={invalid || undefined}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {choices.map((c, i) => (
        <button
          key={c.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={c.checked}
          aria-label={c.ariaLabel}
          tabIndex={i === tabStop ? 0 : -1}
          onClick={c.select}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={cn(segClass(c.checked, invalid), itemClassName)}
        >
          {dot ? <Dot on={c.checked} /> : null}
          {c.label}
        </button>
      ))}
    </div>
  );
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
  described,
}: {
  id: string;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  hint?: FieldHint;
  described: React.AriaAttributes;
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
        {...described}
        aria-invalid={invalid || undefined}
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
  a11y,
  otherText,
  setOtherText,
}: {
  field: FormField;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  a11y: A11y;
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
      <RadioGroup
        a11y={a11y}
        invalid={invalid}
        choices={options.map((o) => ({
          key: o.value,
          label: o.label,
          checked: current === o.value,
          select: () => setValue(o.value),
        }))}
      />
      {otherSelected && setOtherText ? (
        <Input
          value={otherText}
          placeholder="Please specify"
          aria-label={`${field.label}: other`}
          onChange={(e) => setOtherText(e.target.value)}
          aria-invalid={invalid || undefined}
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
  a11y,
  otherText,
  setOtherText,
}: {
  field: FormField;
  value: unknown;
  setValue: (v: unknown) => void;
  invalid: boolean;
  a11y: A11y;
  otherText: string;
  setOtherText?: (t: string) => void;
}) {
  const selected = Array.isArray(value) ? (value.filter((v) => typeof v === "string") as string[]) : [];
  const options = field.options ?? [];
  const otherSelected = field.allowOther && selected.includes("Other");

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-labelledby={a11y.labelledBy}
        aria-describedby={a11y.describedBy}
        className="flex flex-wrap gap-2"
      >
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              // "None" is exclusive: it clears the rest, and the rest clear it.
              onClick={() => setValue(toggleChoice(selected, o.value))}
              className={segClass(on, invalid)}
            >
              <Tick on={on} />
              {o.label}
            </button>
          );
        })}
      </div>
      {otherSelected && setOtherText ? (
        <Input
          value={otherText}
          placeholder="Please specify"
          aria-label={`${field.label}: other`}
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
  a11y,
}: {
  field: FormField;
  value: unknown;
  onChange: (rows: RepeatRow[]) => void;
  invalid: boolean;
  idPrefix: string;
  a11y: A11y;
}) {
  const subfields = field.subfields ?? [];
  const rows: RepeatRow[] = Array.isArray(value) ? (value as RepeatRow[]) : [];
  const display = rows.length > 0 ? rows : [emptyRow(subfields)];
  // Adding a row moves the caret into it, so "Add a medicine" is followed by
  // typing the medicine, not by hunting for the new box.
  const focusRow = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (focusRow.current == null) return;
    document.getElementById(`${idPrefix}-${focusRow.current}-${subfields[0]?.id}`)?.focus();
    focusRow.current = null;
  });

  function update(index: number, subId: string, v: unknown) {
    const next = display.map((r, i) => (i === index ? { ...r, [subId]: v } : r));
    onChange(next);
  }
  function add() {
    focusRow.current = display.length;
    onChange([...display, emptyRow(subfields)]);
  }
  function remove(index: number) {
    const next = display.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyRow(subfields)]);
  }

  return (
    <div
      role="group"
      aria-labelledby={a11y.labelledBy}
      aria-describedby={a11y.describedBy}
      className="space-y-3"
    >
      {display.map((row, i) => (
        <div
          key={i}
          className={cn("rounded-lg border p-3", invalid && i === 0 ? "border-destructive" : "border-border")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {subfields.map((sf) => {
              const subId = `${idPrefix}-${i}-${sf.id}`;
              const subLabel = "block text-sm font-medium text-muted-foreground";
              return (
                <div key={sf.id} className="space-y-1">
                  {GROUP_TYPES.has(sf.type) ? (
                    <p id={`${subId}-label`} className={subLabel}>
                      {sf.label}
                    </p>
                  ) : (
                    <Label htmlFor={subId} id={`${subId}-label`} className={subLabel}>
                      {sf.label}
                    </Label>
                  )}
                  <LeafControl
                    field={sf}
                    id={subId}
                    value={row[sf.id]}
                    setValue={(v) => update(i, sf.id, v)}
                    invalid={false}
                    a11y={{ labelledBy: `${subId}-label` }}
                  />
                </div>
              );
            })}
          </div>
          {display.length > 1 ? (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 aria-hidden />
                Remove<span className="sr-only"> entry {i + 1}</span>
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add}>
        <Plus aria-hidden /> {field.addLabel ?? "Add another"}
      </Button>
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
  a11y,
}: {
  field: FormField;
  value: unknown;
  onChange: (grid: Record<string, string>) => void;
  invalid: boolean;
  a11y: A11y;
}) {
  const rows = field.rows ?? [];
  const cols = field.cols ?? [];
  const grid: Record<string, string> =
    value && typeof value === "object" ? (value as Record<string, string>) : {};

  function set(row: string, col: string) {
    onChange({ ...grid, [row]: col });
  }

  return (
    <div role="group" aria-labelledby={a11y.labelledBy} aria-describedby={a11y.describedBy}>
      {/* Mobile: each row its own card, a radiogroup of full-size options. */}
      <div className="space-y-3 sm:hidden">
        {rows.map((r) => (
          <div
            key={r}
            className={cn(
              "rounded-lg border p-3",
              invalid && !grid[r] ? "border-destructive/60" : "border-border",
            )}
          >
            <p className="mb-2 font-medium" aria-hidden>
              {r}
            </p>
            <RadioGroup
              ariaLabel={r}
              itemClassName="flex-1 basis-[45%] justify-start text-sm"
              choices={cols.map((c) => ({
                key: c,
                label: c,
                checked: grid[r] === c,
                select: () => set(r, c),
              }))}
            />
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
                        "inline-grid size-8 place-items-center rounded-full border transition-[background-color,border-color,scale] duration-(--motion-press) ease-out active:scale-90 motion-reduce:active:scale-100 elderly:active:scale-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        grid[r] === c
                          ? "border-primary bg-primary"
                          : "border-input bg-card hover:border-foreground/60 hover:bg-muted",
                      )}
                    >
                      {grid[r] === c ? <span className="mark-in size-2.5 rounded-full bg-primary-foreground" /> : null}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
