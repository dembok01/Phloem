// Which reports can take an uploaded file (0055), as the choices the upload sheet
// offers. Mirrors upload_report / upload_diet_review, which re-check all of it.
import type { UploadTarget } from "@/components/coordinator/upload-report-sheet";
import { formatDateIST } from "@/lib/datetime";

type Role = "doctor" | "nutritionist" | "trainer" | "psychologist";

export type SlotConsult = {
  id: string;
  type: Role;
  cycle_id: string | null;
  meeting_status: string;
  report_status: string;
  report_closed_reason: string | null;
  report_uploaded_by: string | null;
  report_uploaded_at: string | null;
  completed_at: string | null;
};

export type ReviewCycle = { id: string; number: number; start_date: string; end_date: string; status: string };

const ROLE: Record<Exclude<Role, "doctor">, string> = {
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
};
const REPORT_NAME: Record<Exclude<Role, "doctor">, [string, string]> = {
  nutritionist: ["nutrition plan", "nutrition review"],
  trainer: ["training plan", "training review"],
  psychologist: ["wellbeing report", "wellbeing report"],
};
// Who can open an uploaded report of each kind — the rep_* read policies, in words.
export const UPLOAD_AUDIENCE: Record<Exclude<Role, "doctor">, string> = {
  nutritionist: "family, doctor, nutritionist and trainer",
  trainer: "family, doctor and trainer",
  psychologist: "psychologist (and the admin team)",
};

/** A consultation whose report a file can stand in for: not the doctor's, the
 * meeting held, not a nutritionist's cycle review (those are diet reviews), and the
 * report waiting, closed as received outside, or an earlier upload to replace. */
export function slotTargets(
  consults: SlotConsult[],
  cycleNumber: Map<string, number>,
  roles: readonly Role[] = ["nutritionist", "trainer", "psychologist"],
): UploadTarget[] {
  return consults
    .filter(
      (c): c is SlotConsult & { type: Exclude<Role, "doctor"> } =>
        c.type !== "doctor" &&
        roles.includes(c.type) &&
        c.meeting_status === "done" &&
        !(c.type === "nutritionist" && c.cycle_id !== null) &&
        (c.report_status === "pending" ||
          (c.report_status === "closed" && c.report_closed_reason === "received_outside") ||
          (c.report_status === "submitted" && c.report_uploaded_by !== null)),
    )
    .sort(
      (a, b) =>
        (a.cycle_id ? (cycleNumber.get(a.cycle_id) ?? 0) : 0) -
          (b.cycle_id ? (cycleNumber.get(b.cycle_id) ?? 0) : 0) ||
        roles.indexOf(a.type) - roles.indexOf(b.type),
    )
    .map((c) => {
      const n = c.cycle_id ? cycleNumber.get(c.cycle_id) : null;
      const met = c.completed_at ? `met ${formatDateIST(c.completed_at)}` : "meeting held";
      const state =
        c.report_status === "pending"
          ? "waiting for the report"
          : c.report_status === "closed"
            ? "closed as received outside the dashboard"
            : `uploaded ${c.report_uploaded_at ? formatDateIST(c.report_uploaded_at) : ""} — uploading again replaces it`;
      return {
        kind: "slot" as const,
        id: c.id,
        label: `${ROLE[c.type]} — ${c.cycle_id ? `cycle ${n ?? "?"} review` : "first consultation"} (${REPORT_NAME[c.type][c.cycle_id ? 1 : 0]})`,
        detail: `${met} · ${state}`,
        audience: UPLOAD_AUDIENCE[c.type],
        replaces: c.report_status === "submitted",
      };
    });
}

/** One diet-review choice per cycle that has begun, newest first. The meeting date
 * may fall a week either side of the cycle, and never after today (the RPC's rule). */
export function reviewTargets(
  cycles: ReviewCycle[],
  reviewsPerCycle: Map<string, number>,
  today: string,
): UploadTarget[] {
  return cycles
    .filter((c) => c.status !== "upcoming")
    .sort((a, b) => b.number - a.number)
    .map((c) => {
      const count = reviewsPerCycle.get(c.id) ?? 0;
      const end = shift(c.end_date, 7);
      return {
        kind: "review" as const,
        id: c.id,
        label: `Nutritionist — diet review, cycle ${c.number}`,
        detail: `${formatDateIST(c.start_date)} – ${formatDateIST(c.end_date)} · ${
          count === 0 ? "no reviews yet" : count === 1 ? "1 review so far" : `${count} reviews so far`
        } · each upload is one review meeting`,
        audience: UPLOAD_AUDIENCE.nutritionist,
        start: shift(c.start_date, -7),
        end: end < today ? end : today,
      };
    });
}

/** yyyy-mm-dd ± days, in plain calendar arithmetic (no time zone involved). */
function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
