// Shared metadata for the member-documents feature. The category list drives both
// the upload picker and the grouped display order; keep it in sync with the
// `document_category` enum in migration 0014.
import type { Database } from "@/lib/supabase/database.types";

export type DocumentCategory = Database["public"]["Enums"]["document_category"];

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "blood_work", label: "Blood work / lab test" },
  { value: "imaging", label: "Imaging or scan" },
  { value: "prescription", label: "Prescription" },
  { value: "discharge_summary", label: "Discharge summary" },
  { value: "doctor_note", label: "Doctor's note or letter" },
  { value: "other", label: "Other" },
];

export const CATEGORY_LABEL = Object.fromEntries(
  DOCUMENT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<DocumentCategory, string>;

/** Display grouping order (matches the picker order). */
export const CATEGORY_ORDER: DocumentCategory[] = DOCUMENT_CATEGORIES.map((c) => c.value);

export const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];
export const ACCEPTED_EXT = ["pdf", "jpg", "jpeg", "png", "heic", "heif"];
/** `accept` attribute for the file input. */
export const ACCEPTED_ATTR = ".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif";

export const MAX_BYTES = 15 * 1024 * 1024;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Best-effort content type when the browser leaves `file.type` blank (e.g. HEIC). */
export function contentTypeFor(file: File, ext: string): string {
  if (file.type) return file.type;
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}
