"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createMember } from "@/app/(app)/admin/members/actions";
import { MemberInviteSuccess } from "@/components/admin/member-invite-success";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const RELATIONSHIPS = [
  "Self",
  "Father",
  "Mother",
  "Father-in-law",
  "Mother-in-law",
  "Uncle",
  "Aunt",
  "Wife",
  "Husband",
  "Other",
];

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function MemberEnrollmentForm() {
  const [attempt, setAttempt] = useState(0);

  return (
    <MemberEnrollmentAttempt
      key={attempt}
      onEnrollAnother={() => setAttempt((current) => current + 1)}
    />
  );
}

function MemberEnrollmentAttempt({ onEnrollAnother }: { onEnrollAnother: () => void }) {
  const [state, formAction] = useActionState(createMember, null);

  if (state?.ok) {
    return <MemberInviteSuccess invite={state.data} onEnrollAnother={onEnrollAnother} />;
  }

  return (
    <form action={formAction} className="space-y-6">
      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Member</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="full_name" label="Full name *">
            <Input id="full_name" name="full_name" required maxLength={120} />
          </Field>
          <Field id="age" label="Age *">
            <Input id="age" name="age" type="number" min={0} max={130} required />
          </Field>
          <Field id="gender" label="Gender">
            <Input id="gender" name="gender" maxLength={40} />
          </Field>
          <Field id="language" label="Language">
            <Input id="language" name="language" maxLength={60} />
          </Field>
          <Field id="occupation" label="Occupation">
            <Input id="occupation" name="occupation" maxLength={120} />
          </Field>
          <Field id="city" label="City">
            <Input id="city" name="city" maxLength={120} />
          </Field>
          <Field id="country" label="Country">
            <Input id="country" name="country" maxLength={120} />
          </Field>
          <Field id="relationship_to_caregiver" label="Relationship to caregiver">
            <select
              id="relationship_to_caregiver"
              name="relationship_to_caregiver"
              defaultValue=""
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Select…</option>
              {RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship}>
                  {relationship}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="phone" label="Phone">
            <Input id="phone" name="phone" type="tel" maxLength={40} />
          </Field>
          <Field id="whatsapp" label="WhatsApp">
            <Input id="whatsapp" name="whatsapp" type="tel" maxLength={40} />
          </Field>
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" maxLength={160} />
          </Field>
          <Field id="pin_code" label="PIN code">
            <Input id="pin_code" name="pin_code" maxLength={20} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="address" label="Address">
              <Input id="address" name="address" maxLength={300} />
            </Field>
          </div>
          <Field id="emergency_contact_name" label="Emergency contact name">
            <Input id="emergency_contact_name" name="emergency_contact_name" maxLength={120} />
          </Field>
          <Field id="emergency_contact_phone" label="Emergency contact phone">
            <Input
              id="emergency_contact_phone"
              name="emergency_contact_phone"
              type="tel"
              maxLength={40}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caregiver invite &amp; package</CardTitle>
          <p className="text-sm text-muted-foreground">
            We’ll create a secure invite link for you to copy and send. No email is sent automatically.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="caregiver_email" label="Caregiver email *">
            <Input
              id="caregiver_email"
              name="caregiver_email"
              type="email"
              required
              maxLength={160}
            />
          </Field>
          <Field id="duration_months" label="Package duration (months)">
            <Input
              id="duration_months"
              name="duration_months"
              type="number"
              min={1}
              max={24}
              defaultValue={3}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/admin/members" className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </Link>
        <SubmitButton pendingText="Creating invite…">Enroll &amp; create invite link</SubmitButton>
      </div>
    </form>
  );
}
