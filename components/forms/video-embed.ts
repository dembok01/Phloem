/**
 * YouTube URL → embed URL; `null` means "not YouTube", and the caller plays the URL
 * inline as a file instead (e.g. an mp4 in Supabase Storage). Accepts the shapes a
 * share sheet hands you — `watch?v=ID`, `youtu.be/ID`, `/shorts/ID` and an already
 * embeddable `/embed/ID` — so whichever link is pasted into ONBOARDING_VIDEO_URL_CLIENT
 * plays without further editing.
 */
export function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : host.endsWith("youtube.com")
          ? (u.searchParams.get("v") ??
            u.pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/)?.[1] ??
            null)
          : null;
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}
