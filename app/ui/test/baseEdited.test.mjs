// A base's cell shows the value committed with Enter at once, in its own
// kind, before the core answers again.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/bases/edited.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/baseEdited.test-bundle.mjs",
  logLevel: "error",
});
const { shownAfterEdit, cellKey } = await import("./.bundles/baseEdited.test-bundle.mjs");

describe("What a base's cell shows once committed", () => {
  test("text as typed, and nothing as empty", () => {
    assert.deepEqual(shownAfterEdit("text", "pausado"), { kind: "text", value: "pausado" });
    assert.deepEqual(shownAfterEdit("text", "  "), { kind: "empty" });
  });
  test("a number as a number, or as typed when it is not one", () => {
    assert.deepEqual(shownAfterEdit("number", "15000"), { kind: "number", value: 15000 });
    assert.deepEqual(shownAfterEdit("number", "2.5"), { kind: "number", value: 2.5 });
    assert.deepEqual(shownAfterEdit("number", "muito"), { kind: "text", value: "muito" });
  });
  test("a date and a date with a time, as wall-clock time", () => {
    assert.deepEqual(shownAfterEdit("date", "2026-10-12"), { kind: "date", value: { ms: Date.UTC(2026, 9, 12), time: false } });
    assert.deepEqual(shownAfterEdit("datetime-local", "2026-10-12T14:30"), {
      kind: "date",
      value: { ms: Date.UTC(2026, 9, 12, 14, 30), time: true },
    });
  });
  test("a cell is found again by its note and property", () => {
    assert.equal(cellKey("projetos/A.md", "status"), "projetos/A.md\nstatus");
    assert.notEqual(cellKey("projetos/A.md", "status"), cellKey("projetos/A.md", "prazo"));
  });
});
