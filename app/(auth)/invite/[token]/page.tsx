import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteState } from "@/lib/invite";
import type { Database } from "@/lib/supabase/database.types";
import { acceptInvite } from "./actions";

type UserRole = Database["public"]["Enums"]["user_role"];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  coordinator: "Care Coordinator",
  doctor: "Doctor",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
  psychologist: "Psychologist",
  caregiver: "Caregiver",
  member: "Member",
};

const ERRORS: Record<string, string> = {
  invalid: "Please enter your name and a password of at least 8 characters.",
  used: "This invite link is invalid, already used, or has expired.",
  exists: "An account already exists for this email. Try signing in instead.",
  failed: "Something went wrong setting up your account. Please try again.",
};

// Public route (middleware allows /invite/*). Uses the service client only to
// read the invite by its unguessable token and expose its role + email.
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invites")
    .select("email, role, used_at, expires_at, member_id")
    .eq("token", token)
    .maybeSingle();

  const state = invite ? inviteState(invite) : null;
  const usable = invite && state === "pending";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4 text-base">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Image
            src="/phloem-logo.png"
            alt="PHLOEM"
            width={180}
            height={60}
            priority
            className="mx-auto h-14 w-auto"
          />
          <p className="text-muted-foreground">
            {usable ? "Set your password to activate your account." : "Invitation"}
          </p>
        </CardHeader>
        <CardContent>
          {error && ERRORS[error] ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
            >
              {ERRORS[error]}
            </p>
          ) : null}

          {!usable ? (
            <div className="space-y-4 text-center">
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                {state === "used"
                  ? "This invite has already been used."
                  : state === "expired"
                    ? "This invite link has expired. Please ask your coordinator for a new one."
                    : "This invite link is not valid."}
              </p>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full text-base")}>
                Go to sign in
              </Link>
            </div>
          ) : (
            <form action={acceptInvite} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">You are joining as</span>
                <Badge>{ROLE_LABEL[invite.role]}</Badge>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-base">
                  Email
                </Label>
                <Input id="email" value={invite.email} readOnly className="h-11 bg-muted/40 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full_name" className="text-base">
                  Full name
                </Label>
                <Input
                  id="full_name"
                  name="full_name"
                  autoComplete="name"
                  required
                  maxLength={120}
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-base">
                  Phone <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-base">
                  Choose a password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  className="h-11 text-base"
                />
                <p className="text-sm text-muted-foreground">At least 8 characters.</p>
              </div>
              <SubmitButton className="h-11 w-full text-base" pendingText="Creating account…">
                Create account
              </SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
