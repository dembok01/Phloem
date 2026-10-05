import test from "node:test";
import assert from "node:assert/strict";
import { currentConsult } from "./current-consult";

const intake = { id: "intake", report_status: "submitted", meeting_status: "done", created_at: "2026-08-12T16:56:41+00:00" };
const review = (meeting: string, report = "pending") => ({
  id: "review", report_status: report, meeting_status: meeting, created_at: "2026-09-22T05:00:00+00:00",
});

test("a review waiting to be marked done wins over the submitted intake, whatever the row order", () => {
  // The order Postgres returned for Sunitha: the August intake first.
  assert.equal(currentConsult([intake, review("scheduled")])?.id, "review");
  assert.equal(currentConsult([review("to_schedule"), intake])?.id, "review");
});

test("with nothing open, the most recent consultation is the one shown", () => {
  assert.equal(currentConsult([intake, review("done", "submitted")])?.id, "review");
  assert.equal(currentConsult([review("cancelled"), intake])?.id, "review", "cancelled is not open, but still newest");
  assert.equal(currentConsult([]), undefined);
});
