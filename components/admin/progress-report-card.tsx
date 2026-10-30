"use client";

// 0061 — the admin creates a progress report when a family asks how things are
// going. One tap for the usual periods (everything so far, a cycle), two dates for
// anything else. The finished report goes to the family's dashboard like every
// progress summary, and the PDF is right here to send on WhatsApp.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ReportPeek } from "@/components/reports/report-peek";
import { checkPeriod, periodLabel, type Period, type PeriodPreset } from "@/lib/progress-period";
import { createProgressReportAction } from "@/app/(app)/admin/members/[id]/actions";

export function ProgressReportCard({
  memberId,
  firstName,
  presets,
  today,
  hasFamilyLogin,
}: {
  memberId: string;
  firstName: string;
  presets: PeriodPreset[];
  today: string;
  hasFamilyLogin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [choice, setChoice] = React.useState<string>(presets[0]?.key ?? "custom");
  const [custom, setCustom] = React.useState<Period>({ from: presets[0]?.from ?? today, to: today });
  const [made, setMade] = React.useState<{ id: string; label: string } | null>(null);
  const [pending, start] = React.useTransition();
  const fromId = React.useId();
  const toId = React.useId();

  const preset = presets.find((p) => p.key === choice);
  const period: Period = preset ?? custom;
  const problem = preset ? null : checkPeriod(custom, today);

  function create() {
    start(async () => {
      const res = await createProgressReportAction(memberId, period.from, period.to);
      if (!res.ok) {
        toast("error", res.error);
        return;
      }
      setMade({ id: res.data, label: periodLabel(period) });
      router.refresh();
      toast("success", "Progress report created");
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Progress report</CardTitle>
        <p className="text-sm text-muted-foreground">
          When the family asks how {firstName} is doing. Choose the period, create the report, then send the PDF.
          {hasFamilyLogin ? " It also appears on the family's dashboard." : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Which period?</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Which period">
            {presets.map((p) => (
              <Chip key={p.key} selected={choice === p.key} onClick={() => setChoice(p.key)}>
                {p.label}
              </Chip>
            ))}
            <Chip selected={choice === "custom"} onClick={() => setChoice("custom")}>
              Choose dates
            </Chip>
          </div>
        </div>

        {preset ? (
          <p className="text-sm text-muted-foreground">{preset.detail}</p>
        ) : (
          <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={fromId}>From</Label>
              <Input
                id={fromId}
                type="date"
                max={today}
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={toId}>To</Label>
              <Input
                id={toId}
                type="date"
                max={today}
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </div>
            {problem ? <p className="text-sm text-danger sm:col-span-2">{problem}</p> : null}
          </div>
        )}

        <Button type="button" onClick={create} loading={pending} disabled={!!problem}>
          Create report
        </Button>

        {made ? (
          <div role="status" className="space-y-3 rounded-xl border border-success/40 bg-success-tint p-3">
            <p className="text-sm font-medium">Report ready · {made.label}</p>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/reports/${made.id}/pdf`} className={buttonVariants({ size: "sm" })}>
                <Download className="size-4" aria-hidden /> Download PDF
              </a>
              <ReportPeek
                reportId={made.id}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
              >
                <FileText className="size-4" aria-hidden /> Read it
              </ReportPeek>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
