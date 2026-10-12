// An error of the core is told by its kind, never by its English text: a
// new name beside its case twin (spec Q8, decided 2026-10-12) has a kind
// of its own, said as an answer — a name to choose again.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/errorKinds.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/errorKinds.test-bundle.mjs",
  logLevel: "error",
});
const { caseTwin, errorParts, levelOf } = await import("./.bundles/errorKinds.test-bundle.mjs");

describe("The case refusal is told by its kind", () => {
  test("the contract's case_twin is a case twin, whatever its text", () => {
    assert.equal(caseTwin({ kind: "case_twin", message: "" }), true);
    assert.equal(caseTwin({ kind: "case_twin", message: "nome recusado" }), true);
  });
  test("a refusal of another kind is not, even with the old text", () => {
    assert.equal(caseTwin({ kind: "refused", message: "a name that differs only in case from another entry" }), false);
    assert.equal(caseTwin({ kind: "exists", message: "" }), false);
    assert.equal(caseTwin("differs only in case"), false);
  });
  test("it is an answer, kept in the log as INFO, as a name taken is", () => {
    assert.equal(levelOf("case_twin"), "INFO");
    assert.equal(levelOf("exists"), "INFO");
    assert.equal(levelOf("refused"), "ERROR");
    assert.equal(levelOf(""), "ERROR");
  });
  test("a message of the window's own has no kind", () => {
    assert.deepEqual(errorParts("plain"), { kind: "", message: "plain" });
    assert.deepEqual(errorParts({ kind: "case_twin", message: "m" }), { kind: "case_twin", message: "m" });
  });
});
