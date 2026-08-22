// W1 — improvement tracking on screen. The care team's full-fidelity view of the
// measure series (the progress_summary PDF deliberately carries only the
// family-safe subset; this is where a clinician sees everything their role allows).
//
// The access boundary is the get_measure_series RPC, not this component: it returns
// only the domains the caller's role may see, so a psychologist mounting this gets
// psych measures and nothing else, and a caregiver gets the family-safe set.
//
// Form choice (dataviz): the job is "did this move, and which way" per measure, not
// "compare series against each other" — so this is small multiples with a hero
// value and a worded delta, never one multi-series chart. The measures have
// different units; putting them on shared axes would be the dual-axis mistake.
import { ArrowDownRight, ArrowRight, ArrowUpRight, LineChart, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkline } from "@/components/charts/sparkline";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDateIST } from "@/lib/datetime";
import {
  describeDelta,
  formatValue,
  groupSeries,
  type MeasurePoint,
  type MeasureSeries,
} from "@/lib/measures";

const DOMAIN_LABEL: Record<string, string> = {
  clinical: "Clinical",
  training: "Strength & mobility",
  nutrition: "Nutrition",
  psych: "Wellbeing",
};
const DOMAIN_ORDER = ["clinical", "training", "nutrition", "psych"];

// Status semantics, not categorical series: Phloem for improving, Honey for
// needs-attention, Moss for "reported, not judged". Each pairs with an arrow and
// words, so the reading never depends on colour (DESIGN-SYSTEM §5).
const TONE = {
  improved: { text: "text-success", stroke: "var(--success)", track: "bg-success/35", dot: "bg-success", Icon: ArrowUpRight },
  declined: { text: "text-warning", stroke: "var(--warning)", track: "bg-warning/35", dot: "bg-warning", Icon: ArrowDownRight },
  unchanged: { text: "text-muted-foreground", stroke: "var(--chart-5)", track: "bg-muted-foreground/25", dot: "bg-muted-foreground", Icon: Minus },
  neutral: { text: "text-muted-foreground", stroke: "var(--chart-2)", track: "bg-info/30", dot: "bg-info", Icon: ArrowRight },
  baseline: { text: "text-muted-foreground", stroke: "var(--chart-5)", track: "bg-muted-foreground/25", dot: "bg-muted-foreground", Icon: Minus },
} as const;

export async function MeasureTrends({
  memberId,
  domain,
  title = "Trends",
  description,
}: {
  memberId: string;
  domain?: string;
  title?: string;
  description?: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_measure_series", {
    m: memberId,
    ...(domain ? { p_domain: domain } : {}),
  });

  const points = (data ?? []) as unknown as MeasurePoint[];
  const series = groupSeries(points);

  if (series.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={LineChart}
            title="No measurements yet"
            description="Numbers appear here as the care team records them — the first readings are taken at the initial consultations, then again at every monthly review."
          />
        </CardContent>
      </Card>
    );
  }

  const byDomain = new Map<string, MeasureSeries[]>();
  for (const s of series) {
    const list = byDomain.get(s.domain) ?? [];
    list.push(s);
    byDomain.set(s.domain, list);
  }
  const domains = [...byDomain.keys()].sort(
    (a, b) => DOMAIN_ORDER.indexOf(a) - DOMAIN_ORDER.indexOf(b),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {domains.map((d) => (
          <div key={d} className="space-y-2">
            {domains.length > 1 ? <h3 className="eyebrow">{DOMAIN_LABEL[d] ?? d}</h3> : null}
            <ul className="grid gap-2 sm:grid-cols-2">
              {byDomain.get(d)!.map((s) => (
                <MeasureRow key={s.key} series={s} />
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MeasureRow({ series: s }: { series: MeasureSeries }) {
  const tone = TONE[s.direction];
  const { Icon } = tone;
  const values = s.points.map((p) => p.value);
  const last = s.points[s.points.length - 1];
  const delta = describeDelta(s);

  // V3 — the baseline→latest track. A sparkline says "it wobbled"; this says
  // "it started here and it is now there", which is the question a clinician
  // actually has. Position is clamped so a single reading still renders.
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  return (
    <li
      className={cn(
        "rounded-xl border p-3.5 shadow-card transition-colors",
        s.direction === "improved" && "border-success/25 bg-success-tint/40",
        s.direction === "declined" && "border-warning/30 bg-warning-tint/40",
        (s.direction === "neutral" || s.direction === "unchanged" || s.direction === "baseline") &&
          "border-border bg-card",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">{s.label}</span>
        <span className="ml-auto font-data text-2xl font-semibold tabular-nums text-foreground">
          {formatValue(s.latest, s.unit)}
        </span>
      </div>

      {values.length > 1 ? (
        <>
          {/* the journey, as a track */}
          <div className="relative mt-3 h-1.5 rounded-full bg-foreground/[0.07]">
            <span
              className={cn("absolute inset-y-0 rounded-full", tone.track)}
              style={{
                left: `${Math.min(pct(s.baseline), pct(s.latest))}%`,
                width: `${Math.abs(pct(s.latest) - pct(s.baseline))}%`,
              }}
            />
            <span
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/60 ring-2 ring-card"
              style={{ left: `${pct(s.baseline)}%` }}
              title={`At intake: ${formatValue(s.baseline, s.unit)}`}
            />
            <span
              className={cn(
                "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                tone.dot,
              )}
              style={{ left: `${pct(s.latest)}%` }}
              title={`Latest: ${formatValue(s.latest, s.unit)}`}
            />
          </div>
          <div className="mt-1 flex justify-between font-data text-[10.5px] text-muted-foreground">
            <span>{formatValue(s.baseline, s.unit)} at intake</span>
            <span>{last ? formatDateIST(last.at) : ""}</span>
          </div>

          <div className="mt-2.5 flex items-end justify-between gap-3">
            <Sparkline
              values={values}
              width={132}
              height={30}
              domain="data"
              area
              stroke={tone.stroke}
              label={`${s.label} over time: ${values.join(", ")}`}
            />
            <span className="font-data text-[11px] tabular-nums text-muted-foreground">
              {values.length} readings
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Baseline reading · {last ? formatDateIST(last.at) : ""}
        </p>
      )}

      <p className={cn("mt-2 flex items-center gap-1 text-xs font-medium", tone.text)}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {delta ??
          (s.direction === "baseline"
            ? "First reading — nothing to compare yet"
            : "No change since intake")}
      </p>

      {/* The readings as text, so the mark is never the only way to get the numbers. */}
      {values.length > 1 ? (
        <p className="sr-only">
          {s.label}:{" "}
          {s.points.map((p) => `${formatDateIST(p.at)} ${formatValue(p.value, s.unit)}`).join("; ")}
        </p>
      ) : null}
    </li>
  );
}
