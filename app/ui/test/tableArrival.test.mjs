// A table image whose file is not here yet waits, asks again when the folder reports it or on a back-off, and gives up after about a minute.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/table/arrival.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/tableArrival.test-bundle.mjs", logLevel: "error" });
const k = await import("./.bundles/tableArrival.test-bundle.mjs");

function clock() {
  const queue = [];
  let now = 0;
  return {
    set: (run, ms) => { const h = { run, at: now + ms }; queue.push(h); return h; },
    clear: (h) => { const i = queue.indexOf(h); if (i >= 0) queue.splice(i, 1); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        const next = queue[0];
        if (!next || next.at > end) break;
        queue.shift();
        now = next.at;
        next.run();
        await new Promise((r) => setImmediate(r));
      }
      now = end;
    },
  };
}

test("a file that arrives by the folder's signal is shown at once", async () => {
  const c = clock();
  let here = false;
  const phases = [];
  const a = new k.Arrival(async () => here, (p) => phases.push(p), c);
  a.start();
  here = true;
  k.watchFile("Mesa/attachments/x.png", a);
  k.filesArrived(["Mesa/attachments/x.png"]);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(phases, ["waiting", "found"]);
});

test("a signal for another file asks nothing", async () => {
  const c = clock();
  let asked = 0;
  const a = new k.Arrival(async () => (asked++, false), () => {}, c);
  a.start();
  k.watchFile("a.png", a);
  k.filesArrived(["b.png"]);
  await new Promise((r) => setImmediate(r));
  assert.equal(asked, 0);
});

test("the back-off finds a late file without any signal", async () => {
  const c = clock();
  let asked = 0;
  const phases = [];
  const a = new k.Arrival(async () => ++asked >= 3, (p) => phases.push(p), c);
  a.start();
  await c.advance(1000 + 2000 + 4000);
  assert.equal(asked, 3);
  assert.equal(a.phase, "found");
});

test("it gives up after the back-off, asks a bounded number of times, and a retry starts over", async () => {
  const c = clock();
  let asked = 0;
  const phases = [];
  const a = new k.Arrival(async () => (asked++, false), (p) => phases.push(p), c);
  a.start();
  await c.advance(10 * 60 * 1000);
  assert.equal(asked, k.BACKOFF.length);
  assert.equal(a.phase, "gave-up");
  assert.ok(k.BACKOFF.reduce((s, n) => s + n, 0) <= 65000);
  // No timer revives it, a signal does only if the file is here (passive watch); the button starts over.
  await a.arrived();
  assert.equal(asked, k.BACKOFF.length + 1);
  assert.equal(a.phase, "gave-up");
  a.retry();
  assert.equal(a.phase, "waiting");
  await c.advance(1000);
  assert.equal(asked, k.BACKOFF.length + 2);
});

test("after giving up, a later arrival of the file moves the card to found, with no timers", async () => {
  const c = clock();
  let here = false;
  const phases = [];
  const a = new k.Arrival(async () => here, (p) => phases.push(p), c);
  a.start();
  await c.advance(10 * 60 * 1000);
  assert.equal(a.phase, "gave-up");
  here = true;
  k.watchFile("late.png", a);
  k.filesArrived(["late.png"]);
  await new Promise((r) => setImmediate(r));
  assert.equal(a.phase, "found");
  assert.deepEqual(phases.slice(-2), ["gave-up", "found"]);
});

test("a retry during an ask in flight does not make a second timer chain", async () => {
  const c = clock();
  let asked = 0;
  let release;
  const a = new k.Arrival(() => { asked++; return new Promise((r) => (release = r)); }, () => {}, c);
  a.start();
  await c.advance(1000);
  assert.equal(asked, 1);
  a.retry(); // the first ask is still out
  release(false); // its answer is stale
  await new Promise((r) => setImmediate(r));
  await c.advance(1000);
  assert.equal(asked, 2);
  release(false);
  await new Promise((r) => setImmediate(r));
  // One chain only: the next ask is 2 s later, not also at 2 s from the stale one.
  await c.advance(2000);
  assert.equal(asked, 3);
});

test("a failing ask counts as not here, and a found picture is never asked again", async () => {
  const c = clock();
  let n = 0;
  const a = new k.Arrival(async () => { if (n++ === 0) throw new Error("x"); return true; }, () => {}, c);
  a.start();
  await c.advance(3000);
  assert.equal(a.phase, "found");
  await a.arrived();
  assert.equal(n, 2);
});
