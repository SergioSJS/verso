// The browser's copy of sync's engine is held to the Rust engine's own
// answers (ADR 0092 item 1: "no second protocol"). The cases are in
// test/sync-vectors.json, made by `crates/verso-core/src/sync/vectors.rs`:
// that Rust test fails when the file is not what the engine says, and this
// one when `src/web/offline/engine.ts` does not answer as the file says.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

for (const name of ["engine", "sha256"]) {
  await esbuild.build({
    entryPoints: [`src/web/offline/${name}.ts`],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: `test/.bundles/offline-${name}.test-bundle.mjs`,
    logLevel: "error",
  });
}
const engine = await import("./.bundles/offline-engine.test-bundle.mjs");
const { sha256, Sha256 } = await import("./.bundles/offline-sha256.test-bundle.mjs");
const vectors = JSON.parse(readFileSync(new URL("./sync-vectors.json", import.meta.url), "utf8"));
const enc = new TextEncoder();
const dec = new TextDecoder();

const files = (list) => new Map(list.map((f) => [f.path, { hash: f.hash, size: f.size }]));

describe("SHA-256", () => {
  test("agrees with the platform's, across the block boundaries", async () => {
    const { createHash } = await import("node:crypto");
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 70_001]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 31 + n) & 255);
      assert.equal(sha256(bytes), createHash("sha256").update(bytes).digest("hex"), `${n} bytes`);
    }
  });
  test("a clone goes on without disturbing the original", () => {
    const half = new Sha256().update(enc.encode("abc"));
    const copy = half.clone();
    assert.equal(half.hex(), sha256(enc.encode("abc")));
    assert.equal(copy.update(enc.encode("def")).hex(), sha256(enc.encode("abcdef")));
  });
});

describe("the plan is the Rust engine's, case by case", () => {
  test(`${vectors.plans.length} pictures`, () => {
    for (const [i, v] of vectors.plans.entries()) {
      const base = new Map(v.base.map((b) => [b.path, b.hash]));
      const got = engine.plan(files(v.local), files(v.remote), { base }, v.confirmed, (path, taken) => engine.conflictName(path, vectors.device, vectors.when, v.pt, taken));
      assert.deepEqual({ actions: got.actions, pause: got.pause, held: got.held }, { actions: v.actions, pause: v.pause, held: v.held }, `plan ${i}: ${JSON.stringify({ local: v.local, remote: v.remote, base: v.base })}`);
    }
  });
});

describe("the names of a conflict's copy", () => {
  test(`${vectors.names.length} names`, () => {
    for (const v of vectors.names) {
      const one = engine.conflictName(v.path, v.device, v.when, v.pt, new Set());
      assert.equal(one, v.first, JSON.stringify(v));
      assert.equal(engine.conflictName(v.path, v.device, v.when, v.pt, new Set([one])), v.second, JSON.stringify(v));
      assert.equal(engine.conflictName(v.path, v.device, v.when, v.pt, new Set(v.taken)), v.third, JSON.stringify(v));
    }
  });
});

describe("two appends joined", () => {
  test(`${vectors.merges.length} pairs of versions, over a base and over a template`, () => {
    for (const [i, v] of vectors.merges.entries()) {
      const a = engine.appendMerge(v.base, enc.encode(v.local), enc.encode(v.remote));
      assert.equal(a === null ? null : dec.decode(a), v.append, `append ${i}: ${JSON.stringify(v)}`);
      const t = engine.templateMerge(v.template, enc.encode(v.local), enc.encode(v.remote));
      assert.equal(t === null ? null : dec.decode(t), v.templated, `template ${i}: ${JSON.stringify(v)}`);
    }
  });
  test("which paths are notes", () => {
    for (const v of vectors.md) assert.equal(engine.mergesByAppend(v.path), v.merges, v.path);
  });
});
