import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createMember } from "../actions";

const ERRORS: Record<string, string> = {
  invalid: "Please check the required fields (name, age, caregiver email).",
  enroll_failed: "Could not enroll the member. Please try again.",
};

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

export default async function NewMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Enroll a member</h1>
          <p className="text-muted-foreground">
            Creates the member record and emails the caregiver an invite to sign up and complete
            onboarding.
          </p>
        </div>
        <Link href="/admin/members" className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </Link>
      </div>

      {error && ERRORS[error] ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          {ERRORS[error]}
        </p>
      ) : null}

      <form action={createMember} className="space-y-6">
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
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
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
              <Input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" maxLength={40} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Caregiver invite &amp; package</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="caregiver_email" label="Caregiver email *">
              <Input id="caregiver_email" name="caregiver_email" type="email" required maxLength={160} />
            </Field>
            <Field id="duration_months" label="Package duration (months)">
              <Input id="duration_months" name="duration_months" type="number" min={1} max={24} defaultValue={3} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href="/admin/members" className={cn(buttonVariants({ variant: "outline" }))}>
            Cancel
          </Link>
          <Button type="submit">Enroll &amp; send invite</Button>
        </div>
      </form>
    </section>
  );
}
