/**
 * Can this uploaded file be rendered in the browser, and if not, why not?
 *
 * The documents bucket accepts pdf, jpeg, png, heic and heif (migration 0014).
 * Four of those five render natively; HEIC/HEIF do not — no browser outside
 * Safari will draw one, and an <img> pointed at one shows a silent broken frame
 * rather than an error. Since families upload straight from iPhones, HEIC is the
 * common case, not the edge case, so it is refused here and offered as a
 * download instead of being optimistically framed.
 *
 * Pure and dependency-free so the rule is unit-tested rather than eyeballed.
 */

export type PreviewKind = "pdf" | "image" | "unsupported";

/**
 * Appended to any PDF URL we frame ourselves. Chromium's built-in viewer reads
 * these Adobe open-parameters and drops its own chrome — the thumbnail sidebar
 * (`navpanes`) and the zoom/print/download toolbar (`toolbar`) — leaving the
 * page itself, fitted to the frame's width and still scrollable. Firefox and
 * Safari ignore the unknown keys, so the fragment is safe everywhere; it is a
 * fragment, never a query, so it also survives the 302 to a signed URL.
 */
export const PDF_CHROMELESS = "#toolbar=0&navpanes=0&view=FitH";

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** True for a file that is HEIC/HEIF by either signal. */
function isHeic(mimeType: string | null | undefined, fileName: string): boolean {
  const ext = extensionOf(fileName);
  const mime = (mimeType ?? "").toLowerCase();
  return ext === "heic" || ext === "heif" || mime === "image/heic" || mime === "image/heif";
}

/**
 * `mimeType` is the stored `member_documents.mime_type`, which can be null on
 * rows written before it was recorded — the filename is the fallback, and for
 * HEIC it also OVERRULES a mime type the browser guessed wrong.
 */
export function previewKind(
  mimeType: string | null | undefined,
  fileName: string,
): PreviewKind {
  if (isHeic(mimeType, fileName)) return "unsupported";

  const mime = (mimeType ?? "").toLowerCase();
  const ext = extensionOf(fileName);

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime === "image/jpeg" || mime === "image/png") return "image";
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return "image";
  return "unsupported";
}

/** One plain sentence explaining why there is no preview, for the viewer's empty state. */
export function unsupportedReason(
  mimeType: string | null | undefined,
  fileName: string,
): string {
  if (isHeic(mimeType, fileName)) {
    return "This is an iPhone photo (HEIC), which browsers can't display. Download it to open it on your device.";
  }
  return "This file type can't be previewed in the browser. Download it to open it.";
}
