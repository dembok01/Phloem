"use client";

// Onboarding video gate (§6 mark_video_watched). Plays the onboarding video and,
// on "I've watched this", stamps the member and unlocks the questionnaire. The
// page re-renders into the wizard once the RPC + revalidate complete.
import * as React from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markVideoWatched } from "@/app/(app)/portal/onboarding/[memberId]/actions";

/** YouTube watch/short URL → embed URL; anything else is played inline as a file. */
function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoGate({ memberId, videoUrl }: { memberId: string; videoUrl: string }) {
  const [pending, startTransition] = React.useTransition();
  const embed = youtubeEmbed(videoUrl);

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Before we begin</h1>
        <p className="text-base text-muted-foreground">
          Please watch this short welcome video. It explains how the program works and what the
          onboarding questionnaire will ask. The questionnaire unlocks right after.
        </p>
      </div>

      <div className="aspect-video w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
        {embed ? (
          <iframe
            src={embed}
            title="PHLOEM onboarding video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <video controls src={videoUrl} className="h-full w-full">
            <a href={videoUrl}>Open the onboarding video</a>
          </video>
        )}
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <PlayCircle className="size-4" /> Watched it? Continue to the questionnaire.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={() => startTransition(() => markVideoWatched(memberId))}
          disabled={pending}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Loading…" : "I've watched this — continue"}
        </Button>
      </div>
    </section>
  );
}
