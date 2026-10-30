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
const { REFUSALS: R, PHONE, isTableClosed, caseTwin, isTransport, consoleLine, errorParts, levelOf, redact } = await import("./.bundles/errorKinds.test-bundle.mjs");

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
    // A phone told a command is not for it is told an answer, not a fault.
    assert.equal(levelOf("not_on_phone"), "INFO");
    assert.equal(levelOf("phone_reads"), "INFO");
    assert.deepEqual([...PHONE].sort(), ["not_on_phone", "phone_reads"]);
    assert.equal(levelOf(""), "ERROR");
  });
  test("a message of the window's own has no kind", () => {
    assert.deepEqual(errorParts("plain"), { kind: "", message: "plain" });
    assert.deepEqual(errorParts({ kind: "case_twin", message: "m" }), { kind: "case_twin", message: "m" });
  });
});

// A command the person triggered that failed writes one line to DevTools'
// console (the maintainer, 2026-10-14: "are you logging this?"): never
// `console.error`, which the e2e suite fails a test on and the window takes
// for an accident of its own; and never a secret.
describe("The console's line for a failure", () => {
  test("a fault is a warning, with its kind and the core's text", () => {
    assert.deepEqual(consoleLine({ kind: "failed", message: "error sending request" }), { level: "warn", text: "Verso: failed: error sending request" });
    assert.deepEqual(consoleLine("plain"), { level: "warn", text: "Verso: plain" });
  });
  test("an answer is information", () => {
    assert.deepEqual(consoleLine({ kind: "exists", message: "a.md" }), { level: "info", text: "Verso: exists: a.md" });
    assert.deepEqual(consoleLine({ kind: "not_found", message: "a.md" }), { level: "info", text: "Verso: not_found: a.md" });
  });
  test("nothing secret reaches it", () => {
    assert.equal(redact("Authorization: Bearer abc.def"), "Authorization: Bearer …");
    assert.equal(redact('{"token":"s3cr3t","name":"Ana"}'), '{"token":"…","name":"Ana"}');
    assert.equal(redact("POST /api/device/poll?code=WXYZ-1234&poll=p1"), "POST /api/device/poll?code=…&poll=…");
    assert.equal(consoleLine({ kind: "refused", message: "password=hunter2 refused" }).text, "Verso: refused: password=… refused");
  });
});

describe("A lost connection is not a file in the cloud", () => {
  test("the bridge's transport failure is told by its flag, not its text", () => {
    assert.equal(isTransport({ kind: "unavailable", message: "Sem conexão", transport: true }), true);
    // The core's own `unavailable` (ADR 0043's placeholder) is not.
    assert.equal(isTransport({ kind: "unavailable", message: "placeholder" }), false);
    assert.equal(isTransport("x"), false);
    assert.equal(isTransport(null), false);
  });
});

describe("A closed table is a state to wait out", () => {
  test("the server's refusal is told by its text, and only a refusal", () => {
    assert.equal(isTableClosed({ kind: "refused", message: "a mesa está fechada" }), true);
    assert.equal(isTableClosed({ kind: "unavailable", message: "a mesa está fechada" }), false);
    assert.equal(isTableClosed({ kind: "refused", message: "not a table" }), false);
    assert.equal(isTableClosed(null), false);
  });
});

// A refusal tells what is refused, in the window's language, not the
// generic "that path cannot name a file" nor "only read" for a create.
describe("The refusals worded by the right a person lacks", () => {
  test("each of the server's sentences has a string", () => {
    assert.deepEqual(Object.keys(R).sort(), ["you may not create files here", "you may not delete this", "you may not move this", "you may not rename this", "you may only read this folder"]);
  });
});
