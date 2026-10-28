// Whether the table's log follows its end: pure decisions (src/table/stick.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/table/stick.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/tableStick.test-bundle.mjs", logLevel: "error" });
const s = await import("./.bundles/tableStick.test-bundle.mjs");

test("at the end means within a small threshold", () => {
  assert.equal(s.atEnd({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 }), true);
  assert.equal(s.atEnd({ scrollHeight: 1000, scrollTop: 590, clientHeight: 400 }), true);
  assert.equal(s.atEnd({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }), false);
});

test("at the bottom, a new entry is followed and nothing is counted", () => {
  assert.deepEqual(s.afterDraw({ stuck: true, mine: false, fresh: 2, unseen: 0 }), { follow: true, unseen: 0 });
});

test("scrolled up, another's entries are not followed but counted", () => {
  assert.deepEqual(s.afterDraw({ stuck: false, mine: false, fresh: 1, unseen: 0 }), { follow: false, unseen: 1 });
  assert.deepEqual(s.afterDraw({ stuck: false, mine: false, fresh: 2, unseen: 1 }), { follow: false, unseen: 3 });
});

test("scrolled up, what the person just sent is followed anyway", () => {
  assert.deepEqual(s.afterDraw({ stuck: false, mine: true, fresh: 1, unseen: 2 }), { follow: true, unseen: 0 });
});

test("scrolled up with nothing new changes nothing", () => {
  assert.deepEqual(s.afterDraw({ stuck: false, mine: false, fresh: 0, unseen: 2 }), { follow: false, unseen: 2 });
});

test("history loaded above is neither news nor counted; newer entries are", () => {
  const known = new Set(["b", "c"]);
  const r = s.splitFresh([{ id: "a", at: 1 }, { id: "b", at: 2 }, { id: "c", at: 3 }, { id: "d", at: 4 }], known, 3);
  assert.deepEqual(r.older.map((e) => e.id), ["a"]);
  assert.deepEqual(r.news.map((e) => e.id), ["d"]);
});

test("an old entry of mine does not follow or count when scrolled up", () => {
  const r = s.splitFresh([{ id: "a", at: 1, mine: true }], new Set(["c"]), 3);
  assert.deepEqual(s.afterDraw({ stuck: false, mine: r.news.some((e) => e.mine), fresh: r.news.length, unseen: 0 }), { follow: false, unseen: 0 });
});

test("with nothing known yet every entry is news", () => {
  assert.equal(s.splitFresh([{ id: "a", at: 1 }], new Set(), null).news.length, 1);
});

test("the reading position keeps its distance from the end when entries are added above", () => {
  assert.equal(s.anchorTop(1000, 100, 1400), 500);
  assert.equal(s.anchorTop(1000, 0, 1000), 0);
});
