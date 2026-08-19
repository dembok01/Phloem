import { cn } from "@/lib/utils";

/** Warm initials mark for a member (photo-free by design — see DESIGN-PROPOSALS P-3).
 *
 * V1/M4 — the mark now carries a ROLE HUE. `globals.css` has defined eight role
 * colours since the design system was written and the UI used exactly none of
 * them, which is why a coordinator could not tell a doctor row from a trainer row
 * without reading the text. Tint + deep text, never a saturated fill
 * (DESIGN-SYSTEM §1), so it stays quiet at list density.
 */
const TONE = {
  neutral: "bg-secondary text-secondary-foreground",
  doctor: "bg-role-doctor/12 text-role-doctor",
  nutritionist: "bg-role-nutritionist/12 text-role-nutritionist",
  trainer: "bg-role-trainer/12 text-role-trainer",
  psychologist: "bg-role-psychologist/12 text-role-psychologist",
  coordinator: "bg-role-coordinator/12 text-role-coordinator",
  admin: "bg-role-admin/12 text-role-admin",
  caregiver: "bg-role-caregiver/12 text-role-caregiver",
  member: "bg-role-member/12 text-role-member",
} as const;

export type MonogramTone = keyof typeof TONE;

export function Monogram({
  name,
  size = "md",
  tone = "neutral",
  ring = false,
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** care role or persona this mark represents */
  tone?: MonogramTone;
  /** soft halo, for hero identity bands */
  ring?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter((w) => w && !/^dr\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold",
        TONE[tone],
        size === "xs" && "size-7 text-[11px]",
        size === "sm" && "size-9 text-sm",
        size === "md" && "size-12 text-lg",
        size === "lg" && "size-16 text-2xl",
        size === "xl" && "size-20 text-3xl",
        ring && "ring-2 ring-card ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** Map a care_role / user_role string onto a monogram tone. */
export function toneForRole(role: string | null | undefined): MonogramTone {
  return role && role in TONE ? (role as MonogramTone) : "neutral";
}
