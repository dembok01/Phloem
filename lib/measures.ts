// W1 — improvement tracking. `get_measure_series` (migration 0022) returns facts;
// this module turns them into the one judgement the product makes: did this get
// better or worse? The judgement lives here alone so every surface — doctor
// dashboard, portal, progress report, PDF — words it identically.
//
// The rule that matters: `higher_is_better` is per-measure, so a 3-second FALL on
// the timed up-and-go is an improvement while a 3-second fall in balance hold is a
// decline. Anything with a null direction (weight) is reported, never judged — a
// doctor decides whether weight gain is good for this member, not a chart.

export type MeasureDomain = "clinical" | "training" | "nutrition" | "psych";

/** One row of `get_measure_series`. */
export type MeasurePoint = {
  measure_key: string;
  label: string;
  unit: string | null;
  domain: MeasureDomain | string;
  higher_is_better: boolean | null;
  at: string;
  cycle_number: number | null;
  value: number;
  source: string;
};

export type Direction = "improved" | "declined" | "unchanged" | "neutral" | "baseline";

export type MeasureSeries = {
  key: string;
  label: string;
  unit: string | null;
  domain: MeasureDomain | string;
  higher_is_better: boolean | null;
  points: MeasurePoint[];
  baseline: number;
  latest: number;
  /** latest − baseline; null when there is only one reading */
  deltaFromBaseline: number | null;
  /** latest − previous; null when there is only one reading */
  deltaFromPrevious: number | null;
  /** direction of travel since intake */
  direction: Direction;
  /** direction of travel since the last reading — what changed *this* month */
  recentDirection: Direction;
};

export type MeasureSummary = { tracked: number; improved: number; declined: number };

function directionOf(delta: number | null, higherIsBetter: boolean | null): Direction {
  if (delta === null) return "baseline";
  if (higherIsBetter === null) return "neutral";
  if (delta === 0) return "unchanged";
  return delta > 0 === higherIsBetter ? "improved" : "declined";
}

/** Group raw points into per-measure series, oldest reading first. */
export function groupSeries(points: MeasurePoint[]): MeasureSeries[] {
  const byKey = new Map<string, MeasurePoint[]>();
  for (const p of points) {
    const list = byKey.get(p.measure_key);
    if (list) list.push(p);
    else byKey.set(p.measure_key, [p]);
  }

  const out: MeasureSeries[] = [];
  for (const [key, raw] of byKey) {
    const sorted = [...raw].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const single = sorted.length < 2;
    const deltaFromBaseline = single ? null : round(last.value - first.value);
    const deltaFromPrevious = single ? null : round(last.value - sorted[sorted.length - 2].value);

    out.push({
      key,
      label: first.label,
      unit: first.unit,
      domain: first.domain,
      higher_is_better: first.higher_is_better,
      points: sorted,
      baseline: first.value,
      latest: last.value,
      deltaFromBaseline,
      deltaFromPrevious,
      direction: directionOf(deltaFromBaseline, first.higher_is_better),
      recentDirection: directionOf(deltaFromPrevious, first.higher_is_better),
    });
  }
  return out;
}

/** How many tracked measures moved, and which way. Neutral measures never count. */
export function summarise(series: MeasureSeries[]): MeasureSummary {
  let improved = 0;
  let declined = 0;
  for (const s of series) {
    if (s.direction === "improved") improved += 1;
    if (s.direction === "declined") declined += 1;
  }
  return { tracked: series.length, improved, declined };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "11 reps" · "11.5 s" · "4/5" — ratings read as a fraction, never "4 /5". */
export function formatValue(value: number, unit: string | null): string {
  const n = Number.isInteger(value) ? String(value) : String(round10(value));
  if (!unit) return n;
  if (unit.startsWith("/")) return `${n}${unit}`;
  return `${n} ${unit}`;
}

function round10(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "+3 reps since intake" / "3 s faster since intake" — direction-aware wording. */
export function describeDelta(s: MeasureSeries, since: "baseline" | "previous" = "baseline"): string | null {
  const delta = since === "baseline" ? s.deltaFromBaseline : s.deltaFromPrevious;
  if (delta === null || delta === 0) return null;
  const when = since === "baseline" ? "since intake" : "since last month";
  const magnitude = formatValue(Math.abs(delta), s.unit);
  if (s.higher_is_better === null) return `${delta > 0 ? "up" : "down"} ${magnitude} ${when}`;
  const better = delta > 0 === s.higher_is_better;
  return `${magnitude} ${delta > 0 ? "more" : "less"} ${when} — ${better ? "improving" : "needs attention"}`;
}

/** Series whose most recent reading moved the wrong way — the doctor's watch list. */
export function decliningSeries(series: MeasureSeries[]): MeasureSeries[] {
  return series.filter((s) => s.recentDirection === "declined" || s.direction === "declined");
}
