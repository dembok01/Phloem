"use client";

// P-3 — caregiver photo upload. The bytes go straight to the private
// `member-photos` bucket from the browser (storage RLS authorises the write by
// the "<member_id>/…" path); then the server action sets the pointer. Client-side
// type/size checks are courtesy only — storage + the RPC are the real boundary.
import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { setMemberPhotoAction } from "@/app/(app)/portal/actions";

const MAX_BYTES = 5 * 1024 * 1024;

export function MemberPhotoUpload({ memberId, hasPhoto }: { memberId: string; hasPhoto: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("error", "Please choose an image file.");
    if (file.size > MAX_BYTES) return toast("error", "Please choose an image under 5 MB.");

    setBusy(true);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${memberId}/photo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("member-photos")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) {
      setBusy(false);
      return toast("error", "Upload failed. Please try again.");
    }
    const res = await setMemberPhotoAction(memberId, path);
    setBusy(false);
    if (res.ok) {
      toast("success", "Photo updated");
      router.refresh();
    } else {
      toast("error", "Couldn't save the photo.");
    }
  }

  async function onRemove() {
    setBusy(true);
    const res = await setMemberPhotoAction(memberId, null);
    setBusy(false);
    if (res.ok) {
      toast("success", "Photo removed");
      router.refresh();
    } else {
      toast("error", "Couldn't remove the photo.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-60"
      >
        <ImagePlus className="size-4" aria-hidden />
        {hasPhoto ? "Change photo" : "Add a photo"}
      </button>
      {hasPhoto ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}
