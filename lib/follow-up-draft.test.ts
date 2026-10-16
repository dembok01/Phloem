import test from "node:test";
import assert from "node:assert/strict";
import { hasAnswers, pickFollowUpDraft, type FollowUpDraft } from "./follow-up-draft";

const draft = (id: string, answers: unknown): FollowUpDraft => ({
  id,
  template_id: "t",
  answers,
  created_at: "2026-09-19T08:17:28Z",
});

test("a draft counts as written only when some answer has content", () => {
  assert.equal(hasAnswers({}), false);
  assert.equal(hasAnswers({ notes: "  ", med_changes: [], vitals: { bp: "" } }), false);
  assert.equal(hasAnswers({ notes: "Images reviewed" }), true);
  assert.equal(hasAnswers({ supervision_required: false }), true);
  assert.equal(hasAnswers({ med_changes: [{ drug: "", dose: "5 mg" }] }), true);
  assert.equal(hasAnswers(null), false);
});

test("the form opens the newest written draft, and only empty ones are cleared", () => {
  const drafts = [draft("empty-new", {}), draft("written", { notes: "x" }), draft("empty-old", {})];
  assert.deepEqual(pickFollowUpDraft(drafts), { open: drafts[1], discard: ["empty-new", "empty-old"] });
});

test("two written drafts: the newer opens and the older is kept", () => {
  const drafts = [draft("newer", { notes: "b" }), draft("older", { notes: "a" })];
  assert.deepEqual(pickFollowUpDraft(drafts), { open: drafts[0], discard: [] });
});

test("only empty drafts: the newest opens; none at all: a fresh one is made", () => {
  const drafts = [draft("a", {}), draft("b", {})];
  assert.deepEqual(pickFollowUpDraft(drafts), { open: drafts[0], discard: ["b"] });
  assert.deepEqual(pickFollowUpDraft([]), { open: null, discard: [] });
});
