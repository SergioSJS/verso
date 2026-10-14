// The desktop app's server calls that a server answers `prove_first` (ADR
// 0083 item 6; the share dialog's grant, through the device's session):
// the window asks the person on the spot — the same dialog as the web's —
// and sends the call once more. Once only; one question for calls that
// meet it together; cancelled, the first answer stands.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/serverProof.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/serverProof.test-bundle.mjs",
  logLevel: "error",
});
const { withServerProof } = await import("./.bundles/serverProof.test-bundle.mjs");

const proveFirst = { status: "error", error: { kind: "prove_first", message: "prove it is you first" } };
const refused = { status: "error", error: { kind: "refused", message: "not the owner" } };
const granted = { status: "ok", data: { path: "Mesa", people: [] } };

/** A command that answers `answers` in turn. */
function command(...answers) {
  const c = { calls: 0, call: async () => answers[Math.min(c.calls++, answers.length - 1)] };
  return c;
}

/** A person who proves (or cancels), counted. */
function person(proves = true) {
  const p = { asked: 0, prove: async () => (p.asked++, proves) };
  return p;
}

describe("A desktop server call that wants a fresh proof", () => {
  test("asks the person, then is sent once more", async () => {
    const c = command(proveFirst, granted);
    const p = person();
    assert.deepEqual(await withServerProof(c.call, p.prove), granted);
    assert.equal(p.asked, 1);
    assert.equal(c.calls, 2);
  });

  test("cancelled, the first answer stands and nothing is sent again", async () => {
    const c = command(proveFirst, granted);
    const p = person(false);
    assert.deepEqual(await withServerProof(c.call, p.prove), proveFirst);
    assert.equal(c.calls, 1);
  });

  test("a second prove_first is the answer, never a loop", async () => {
    const c = command(proveFirst);
    const p = person();
    assert.deepEqual(await withServerProof(c.call, p.prove), proveFirst);
    assert.equal(p.asked, 1);
    assert.equal(c.calls, 2);
  });

  test("any other answer asks nothing", async () => {
    for (const answer of [granted, refused]) {
      const c = command(answer);
      const p = person();
      assert.deepEqual(await withServerProof(c.call, p.prove), answer);
      assert.equal(p.asked, 0);
    }
  });

  test("calls that meet it together share one question", async () => {
    const a = command(proveFirst, granted);
    const b = command(proveFirst, granted);
    let release;
    const gate = new Promise((r) => (release = r));
    const p = { asked: 0, prove: async () => (p.asked++, gate) };
    const both = Promise.all([withServerProof(a.call, p.prove), withServerProof(b.call, p.prove)]);
    await new Promise((r) => setTimeout(r, 10));
    release(true);
    assert.deepEqual(await both, [granted, granted]);
    assert.equal(p.asked, 1);
  });

  test("with no way to ask (the web, whose pages ask themselves), the answer stands", async () => {
    const c = command(proveFirst, granted);
    assert.deepEqual(await withServerProof(c.call, null), proveFirst);
    assert.equal(c.calls, 1);
  });
});
