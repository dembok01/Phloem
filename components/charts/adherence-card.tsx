// Adherence trend per cycle (C6), from the monthly feedback answers already
// readable under the caller's RLS (admin sees all; the doctor sees both via
// fr_feedback_doctor). Series colors follow the entity: nutrition = green,
// training = ochre (role hues, chart-token variants).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { TrendLine, type TrendPoint } from "./trend-line";

export async function AdherenceCard({ memberId }: { memberId: string }) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("form_responses")
    .select("answers, cycle_id, cycles(number), form_templates!inner(key)")
    .eq("member_id", memberId)
    .in("form_templates.key", ["feedback_nutrition", "feedback_training"])
    .not("submitted_at", "is", null);

  const byCycle = new Map<number, TrendPoint>();
  for (const r of rows ?? []) {
    const cyc = r.cycles as { number: number } | { number: number }[] | null;
    const n = Array.isArray(cyc) ? cyc[0]?.number : cyc?.number;
    if (!n) continue;
    const key = (r.form_templates as { key: string } | { key: string }[] | null);
    const tmpl = Array.isArray(key) ? key[0]?.key : key?.key;
    const a = r.answers as Record<string, unknown> | null;
    const adherence = Number(a?.adherence);
    if (!Number.isFinite(adherence)) continue;
    const point = byCycle.get(n) ?? { label: `Cycle ${n}` };
    if (tmpl === "feedback_nutrition") point.nutrition = adherence;
    if (tmpl === "feedback_training") point.training = adherence;
    byCycle.set(n, point);
  }
  const points = [...byCycle.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  if (points.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan adherence by cycle</CardTitle>
      </CardHeader>
      <CardContent>
        <TrendLine
          data={points}
          series={[
            { key: "nutrition", name: "Nutrition", color: "var(--chart-1)" },
            { key: "training", name: "Training", color: "var(--chart-3)" },
          ]}
          domain={[1, 5]}
          unit=" / 5"
          height={180}
        />
      </CardContent>
    </Card>
  );
}
