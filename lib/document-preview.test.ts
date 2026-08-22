import test from "node:test";
import assert from "node:assert/strict";
import { previewKind, unsupportedReason } from "./document-preview";

test("PDFs preview as pdf, by mime or by extension", () => {
  assert.equal(previewKind("application/pdf", "cbc.pdf"), "pdf");
  // The row's mime_type can be missing on older uploads; the name still decides.
  assert.equal(previewKind(null, "cbc.pdf"), "pdf");
  assert.equal(previewKind("", "CBC-REPORT.PDF"), "pdf");
});

test("browser-renderable images preview as image", () => {
  assert.equal(previewKind("image/jpeg", "scan.jpg"), "image");
  assert.equal(previewKind("image/png", "scan.png"), "image");
  assert.equal(previewKind(null, "scan.jpeg"), "image");
  assert.equal(previewKind(null, "scan.PNG"), "image");
});

test("HEIC and HEIF are NOT previewable, however they are labelled", () => {
  // The single most important case: iPhone uploads arrive as HEIC, no browser
  // renders it, and an <img> would show a silent broken frame. It must be
  // refused here so the viewer can offer a download instead.
  assert.equal(previewKind("image/heic", "IMG_0001.heic"), "unsupported");
  assert.equal(previewKind("image/heif", "IMG_0001.heif"), "unsupported");
  assert.equal(previewKind(null, "IMG_0001.HEIC"), "unsupported");
  // A HEIC file mislabelled by the browser as a generic image is still HEIC.
  assert.equal(previewKind("image/jpeg", "IMG_0001.heic"), "unsupported");
});

test("anything else is unsupported rather than optimistically framed", () => {
  assert.equal(previewKind("application/octet-stream", "mystery.bin"), "unsupported");
  assert.equal(previewKind(null, "notes.docx"), "unsupported");
  assert.equal(previewKind(null, "noextension"), "unsupported");
});

test("the unsupported reason names HEIC specifically", () => {
  const heic = unsupportedReason("image/heic", "IMG_0001.heic");
  assert.match(heic, /iPhone|HEIC/i);
  const other = unsupportedReason(null, "notes.docx");
  assert.doesNotMatch(other, /HEIC/i);
});
