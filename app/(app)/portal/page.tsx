import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type MemberStatus = Database["public"]["Enums"]["member_status"];

const STATUS_LABEL: Record<MemberStatus, string> = {
  invited: "Invitation pending",
  signed_up: "Ready to begin onboarding",
  onboarding: "Onboarding in progress",
  onboarded: "Onboarding complete",
  assigned: "Care team being set up",
  initial_consults: "Initial consultations underway",
  ready_to_start: "Ready to start the program",
  active: "Program active",
  renewal_due: "Renewal due",
  inactive: "Inactive",
};

function statusVariant(s: MemberStatus): "default" | "muted" | "success" | "warning" {
  if (s === "active" || s === "onboarded") return "success";
  if (s === "renewal_due") return "warning";
  if (s === "inactive" || s === "invited") return "muted";
  return "default";
}

export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarded?: string }>;
}) {
  const { onboarded } = await searchParams;
  const supabase = await createClient();

  // RLS (mem_caregiver) scopes this to the signed-in caregiver's own members.
  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, status")
    .order("created_at", { ascending: true });

  const list = members ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Your family portal</h1>
        <p className="text-lg text-muted-foreground">
          Complete onboarding to get started. Plans, reports and schedules arrive as your program
          begins.
        </p>
      </div>

      {onboarded ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-5" />
          <p className="text-base">Onboarding submitted — thank you. Your care coordinator takes it from here.</p>
        </div>
      ) : null}

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="text-base">
              No one is linked to your account yet. Your care coordinator will set this up shortly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map((m) => {
            const needsOnboarding = m.status === "signed_up" || m.status === "onboarding";
            return (
              <Card key={m.id}>
                <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xl font-medium">{m.full_name}</p>
                    <Badge variant={statusVariant(m.status)}>{STATUS_LABEL[m.status]}</Badge>
                  </div>
                  {needsOnboarding ? (
                    <Link
                      href={`/portal/onboarding/${m.id}`}
                      className={cn(buttonVariants(), "h-11 px-5 text-base")}
                    >
                      {m.status === "onboarding" ? "Continue onboarding" : "Start onboarding"}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Plans &amp; reports coming soon
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
