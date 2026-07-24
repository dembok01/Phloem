import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFormTemplate } from "./schema";

test("every checked-in form template parses against the schema", () => {
  const dir = join(process.cwd(), "supabase", "templates");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 10, `expected the 10 templates, found ${files.length}`);
  for (const f of files) {
    const json = JSON.parse(readFileSync(join(dir, f), "utf8"));
    assert.doesNotThrow(() => parseFormTemplate(json), `${f} should parse`);
  }
});

test("a malformed template is rejected (hard load error)", () => {
  assert.throws(() => parseFormTemplate({ key: "x", version: "not-a-number", title: "t", sections: [] }));
  assert.throws(() => parseFormTemplate({ key: "x", version: 1, title: "t", sections: [{ id: "s", title: "S", fields: [{ id: "f", type: "not_a_type", label: "L" }] }] }));
});
