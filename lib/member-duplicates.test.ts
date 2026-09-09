import test from "node:test";
import assert from "node:assert/strict";
import { duplicateNameIds, normalizeMemberName } from "./member-duplicates";

test("normalisation folds the case and spacing a re-typed enrolment introduces", () => {
  assert.equal(normalizeMemberName("  Anjana   shine "), "anjana shine");
  assert.equal(normalizeMemberName("Anjana Shine"), "anjana shine");
  assert.equal(normalizeMemberName("Deepak\tChandramohan"), "deepak chandramohan");
});

test("rows sharing a normalised name are all marked", () => {
  const ids = duplicateNameIds([
    { id: "a", full_name: "Anjana shine" },
    { id: "b", full_name: "Anjana Shine" },
    { id: "c", full_name: "  anjana  shine" },
    { id: "d", full_name: "Meera Krishnan" },
  ]);

  assert.deepEqual([...ids].sort(), ["a", "b", "c"]);
});

test("a list with no repeats marks nothing", () => {
  const ids = duplicateNameIds([
    { id: "a", full_name: "Meera Krishnan" },
    { id: "b", full_name: "Rajan Pillai" },
  ]);

  assert.equal(ids.size, 0);
});
