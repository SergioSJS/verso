// A sensitive request the server answers `prove_first` (ADR 0083 item 6)
// is asked about on the spot and sent once more after the person proves
// who they are: once only, one question for requests that meet it
// together, and nothing of the proof kept.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/proof.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/proof.test-bundle.mjs",
  logLevel: "error",
});
const { withProof, provesFirst, setProver } = await import("./.bundles/proof.test-bundle.mjs");

/** An error as `web/api.ts` throws it. */
const refusal = (code) => Object.assign(new Error(code), { status: 403, code });

/** A request that answers `answers` in turn: an Error is thrown. */
function server(...answers) {
  const r = {
    sent: 0,
    send: async () => {
      const a = answers[Math.min(r.sent, answers.length - 1)];
      r.sent += 1;
      if (a instanceof Error) throw a;
      return a;
    },
  };
  return r;
}

/** A person asked to prove: `proved` is what they do, counted. */
function person(proved) {
  const p = {
    asked: 0,
    prove: async () => {
      p.asked += 1;
      await new Promise((r) => setTimeout(r, 5));
      return proved;
    },
  };
  return p;
}

describe("A request that wants a fresh proof", () => {
  test("is asked about, then sent once more", async () => {
    const s = server(refusal("prove_first"), { ok: true });
    const p = person(true);
    assert.deepEqual(await withProof(s.send, p.prove), { ok: true });
    assert.equal(s.sent, 2);
    assert.equal(p.asked, 1);
  });

  test("cancelled, is the server's answer and is not sent again", async () => {
    const s = server(refusal("prove_first"), { ok: true });
    const p = person(false);
    await assert.rejects(withProof(s.send, p.prove), (e) => provesFirst(e));
    assert.equal(s.sent, 1);
    assert.equal(p.asked, 1);
  });

  test("is retried once only: a second prove_first is the answer, never a loop", async () => {
    const s = server(refusal("prove_first"));
    const p = person(true);
    await assert.rejects(withProof(s.send, p.prove), (e) => provesFirst(e));
    assert.equal(s.sent, 2);
    assert.equal(p.asked, 1);
  });

  test("any other answer is not asked about", async () => {
    for (const code of ["forbidden", "signin_failed", "csrf", "too_many"]) {
      const s = server(refusal(code), { ok: true });
      const p = person(true);
      await assert.rejects(withProof(s.send, p.prove), (e) => e.code === code);
      assert.equal(s.sent, 1, code);
      assert.equal(p.asked, 0, code);
    }
    const s = server({ ok: 1 });
    const p = person(true);
    assert.deepEqual(await withProof(s.send, p.prove), { ok: 1 });
    assert.equal(p.asked, 0);
  });

  test("two requests that meet it together share one question", async () => {
    const a = server(refusal("prove_first"), "a");
    const b = server(refusal("prove_first"), "b");
    const p = person(true);
    assert.deepEqual(await Promise.all([withProof(a.send, p.prove), withProof(b.send, p.prove)]), ["a", "b"]);
    assert.equal(p.asked, 1);
    // Once answered, a later one is asked again.
    const c = server(refusal("prove_first"), "c");
    assert.equal(await withProof(c.send, p.prove), "c");
    assert.equal(p.asked, 2);
  });

  test("a prover that fails counts as cancelled", async () => {
    const s = server(refusal("prove_first"), "x");
    await assert.rejects(
      withProof(s.send, async () => {
        throw new Error("the dialog broke");
      }),
      (e) => provesFirst(e),
    );
    assert.equal(s.sent, 1);
  });

  test("the prover set for the page is the one asked by default", async () => {
    const p = person(true);
    setProver(p.prove);
    const s = server(refusal("prove_first"), "set");
    assert.equal(await withProof(s.send), "set");
    assert.equal(p.asked, 1);
    setProver(null);
    const t = server(refusal("prove_first"), "unset");
    await assert.rejects(withProof(t.send), (e) => provesFirst(e));
  });
});
