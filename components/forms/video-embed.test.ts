import test from "node:test";
import assert from "node:assert/strict";
import { youtubeEmbed } from "./video-embed";

const EMBED = "https://www.youtube.com/embed/abc123XYZ_-";

test("every YouTube link shape a share sheet produces becomes an embed URL", () => {
  assert.equal(youtubeEmbed("https://www.youtube.com/watch?v=abc123XYZ_-"), EMBED);
  assert.equal(youtubeEmbed("https://youtube.com/watch?v=abc123XYZ_-&t=42"), EMBED);
  assert.equal(youtubeEmbed("https://m.youtube.com/watch?v=abc123XYZ_-"), EMBED);
  assert.equal(youtubeEmbed("https://youtu.be/abc123XYZ_-"), EMBED);
  assert.equal(youtubeEmbed("https://www.youtube.com/shorts/abc123XYZ_-"), EMBED);
  assert.equal(youtubeEmbed("https://www.youtube.com/shorts/abc123XYZ_-?feature=share"), EMBED);
  assert.equal(youtubeEmbed("https://www.youtube.com/embed/abc123XYZ_-"), EMBED);
});

test("non-YouTube URLs fall through to the native video player", () => {
  // A Supabase Storage / CDN mp4 — the gate renders <video src> for these.
  assert.equal(youtubeEmbed("https://proj.supabase.co/storage/v1/object/public/x/intro.mp4"), null);
  assert.equal(youtubeEmbed("https://vimeo.com/123456789"), null);
});

test("junk never yields a broken embed", () => {
  assert.equal(youtubeEmbed(""), null);
  assert.equal(youtubeEmbed("not a url"), null);
  // A YouTube host with no video id (the old placeholder failure mode).
  assert.equal(youtubeEmbed("https://www.youtube.com/"), null);
  assert.equal(youtubeEmbed("https://www.youtube.com/results?search_query=x"), null);
});
