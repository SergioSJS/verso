// A page that the server tells to wait — 429, with the seconds in its
// answer (the device page's lookups past the address's free tries, ADR
// 0083 item 17) — says it is waiting and asks again by itself once they
// are past, instead of stopping on "too many attempts". Any other answer
// is the page's to say; the waits are bounded.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/retry.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/retry.test-bundle.mjs",
  logLevel: "error",
});
const { afterWaits } = await import("./.bundles/retry.test-bundle.mjs");

/** An error as `web/api.ts` throws it. */
const refusal = (status, code, retry = null) => Object.assign(new Error(code), { status, code, retry });

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

/** Waits recorded, none slept. */
function clock() {
  const c = { waited: [], wait: async (s) => void c.waited.push(s) };
  return c;
}

describe("A request the server tells to wait", () => {
  test("is said waiting, and sent again after the seconds it was told", async () => {
    const s = server(refusal(429, "too_many", 3), refusal(429, "too_many", 1), { device: "Verso" });
    const c = clock();
    const told = [];
    const got = await afterWaits(s.send, (n) => told.push(n), c.wait);
    assert.deepEqual(got, { device: "Verso" });
    assert.equal(s.sent, 3);
    assert.deepEqual(told, [3, 1], "the page says each wait");
    assert.deepEqual(c.waited, [3, 1], "and waits what the server asked");
  });

  test("waits a second when the answer names none", async () => {
    const s = server(refusal(429, "too_many"), "ok");
    const c = clock();
    assert.equal(await afterWaits(s.send, () => undefined, c.wait), "ok");
    assert.deepEqual(c.waited, [1]);
  });

  test("leaves any other answer to the page, at once", async () => {
    for (const e of [refusal(404, "link_gone"), refusal(403, "prove_first"), new Error("network")]) {
      const s = server(e, "never");
      const c = clock();
      await assert.rejects(afterWaits(s.send, () => undefined, c.wait), e);
      assert.equal(s.sent, 1, e.message);
      assert.deepEqual(c.waited, []);
    }
  });

  test("gives up after a bounded number of waits", async () => {
    const s = server(refusal(429, "too_many", 2));
    const c = clock();
    await assert.rejects(afterWaits(s.send, () => undefined, c.wait, 4), /too_many/);
    assert.equal(s.sent, 5, "the first try and four after waits");
    assert.deepEqual(c.waited, [2, 2, 2, 2]);
  });
});
