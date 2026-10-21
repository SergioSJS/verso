// The folds a person left in a note are kept per note on this device,
// named by what they fold, bounded, and follow a rename.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: 'export * from "./src/foldMemory";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/foldMemory.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/foldMemory.test-bundle.mjs");

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};

describe("foldMemory", () => {
  beforeEach(() => store.clear());

  test("a fold is named by its words, whatever the marks round them", () => {
    assert.equal(m.foldWords("**Alfa**, o  Filho!"), "alfaofilho");
    const seen = new Map();
    assert.equal(m.foldKey("h", "Alfa", seen), "h:alfa#0");
    assert.equal(m.foldKey("h", "ALFA!", seen), "h:alfa#1");
    assert.equal(m.foldKey("l", "Alfa", seen), "l:alfa#0");
  });

  test("what is folded comes back, per folder and note; nothing folded forgets the note", () => {
    m.saveFolds("/v", "a.md", new Set(["h:x#0"]));
    assert.deepEqual([...m.loadFolds("/v", "a.md")], ["h:x#0"]);
    assert.equal(m.loadFolds("/v", "b.md").size, 0);
    assert.equal(m.loadFolds("/other", "a.md").size, 0);
    m.saveFolds("/v", "a.md", new Set());
    assert.equal(JSON.parse(store.get("verso.folds")).hasOwnProperty("/v\u0000a.md"), false);
  });

  test("a note moved or renamed, or its folder, keeps its folds", () => {
    m.saveFolds("/v", "a.md", new Set(["h:x#0"]));
    m.saveFolds("/v", "dir/b.md", new Set(["h:y#0"]));
    m.foldsMoved("/v", "a.md", "c.md");
    m.foldsMoved("/v", "dir", "pasta");
    assert.deepEqual([...m.loadFolds("/v", "c.md")], ["h:x#0"]);
    assert.deepEqual([...m.loadFolds("/v", "pasta/b.md")], ["h:y#0"]);
    assert.equal(m.loadFolds("/v", "a.md").size, 0);
  });

  test("the store is bounded: the least recently folded notes go, and a note's folds are capped", () => {
    for (let i = 0; i < m.MAX_NOTES + 20; i++) m.saveFolds("/v", `n${i}.md`, new Set(["h:x#0"]));
    assert.equal(Object.keys(JSON.parse(store.get("verso.folds"))).length, m.MAX_NOTES);
    assert.equal(m.loadFolds("/v", "n0.md").size, 0);
    assert.equal(m.loadFolds("/v", `n${m.MAX_NOTES + 19}.md`).size, 1);
    m.saveFolds("/v", "big.md", new Set(Array.from({ length: m.MAX_FOLDS + 50 }, (_, i) => `h:a#${i}`)));
    assert.equal(m.loadFolds("/v", "big.md").size, m.MAX_FOLDS);
  });

  test("a damaged store reads as nothing", () => {
    store.set("verso.folds", "{not json");
    assert.equal(m.loadFolds("/v", "a.md").size, 0);
    store.set("verso.folds", JSON.stringify({ "/v\u0000a.md": "oops" }));
    assert.equal(m.loadFolds("/v", "a.md").size, 0);
  });
});
