// P-3 — a member's photo when one is set, else the warm initials Monogram.
// Async server component: mints a short-lived signed URL for the private
// `member-photos` object under the caller's storage RLS. Any failure (no photo,
// no access, expired) falls back to the Monogram, so it is always safe to render.
import { Monogram } from "@/components/monogram";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const SIZE_CLASS = { sm: "size-9", md: "size-12", lg: "size-16" } as const;

export async function MemberPhoto({
  photoPath,
  name,
  size = "md",
  className,
}: {
  photoPath: string | null | undefined;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  let url: string | null = null;
  if (photoPath) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("member-photos").createSignedUrl(photoPath, 3600);
    url = data?.signedUrl ?? null;
  }
  if (!url) return <Monogram name={name} size={size} className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URL is dynamic + short-lived; next/image optimisation doesn't apply
    <img
      src={url}
      alt={`Photo of ${name}`}
      className={cn("shrink-0 rounded-full object-cover", SIZE_CLASS[size], className)}
    />
  );
}
