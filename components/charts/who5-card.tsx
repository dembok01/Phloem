// WHO-5 wellbeing trend (C6). §3: only roles whose RLS can read psych_checkin
// responses (admin, the psychologist) ever get rows here — the query itself is
// the boundary, and callers only mount this on those surfaces.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDateIST } from "@/lib/datetime";
import { TrendLine, type TrendPoint } from "./trend-line";

const WHO5_KEYS = ["who5_1", "who5_2", "who5_3", "who5_4", "who5_5"] as const;

function scoreOf(answers: unknown): number | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const a = answers as Record<string, unknown>;
  let sum = 0;
  for (const k of WHO5_KEYS) {
    const v = Number(a[k]);
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return sum * 4; // raw 0–25 → standard 0–100 scale
}

export async function Who5Card({ memberId }: { memberId: string }) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("form_responses")
    .select("submitted_at, answers, form_templates!inner(key)")
    .eq("member_id", memberId)
    .eq("form_templates.key", "psych_checkin")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: true });

  const points: TrendPoint[] = (rows ?? [])
    .map((r) => ({ label: formatDateIST(r.submitted_at!), score: scoreOf(r.answers) }))
    .filter((p) => p.score != null);

  if (points.length === 0) return null;
  const latest = points[points.length - 1]!.score as number;

  return (
    <Card>
      <CardHeader>
        <CardTitle>WHO-5 wellbeing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold">{latest}</span>
          <span className="text-sm text-muted-foreground">of 100 at the last check-in</span>
        </p>
        {latest <= 50 ? (
          <p className="rounded-lg border border-warning/40 bg-warning-tint px-3 py-2 text-sm">
            50 or below suggests low wellbeing — worth discussing at the next check-in.
          </p>
        ) : null}
        {points.length >= 2 ? (
          <TrendLine
            data={points}
            series={[{ key: "score", name: "WHO-5", color: "var(--chart-1)" }]}
            domain={[0, 100]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            The trend line appears after the next check-in.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
