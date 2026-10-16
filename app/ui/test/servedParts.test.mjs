// Choosing folders inside a served folder (ADR 0096 item 2, amended
// 2026-10-16): the tree, how each folder shows, and what a tick does.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { buildTree, stateOf, choose, covers, flatten } = await import("../src/dialogs/servedParts.js").catch(async () => {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/dialogs/servedParts.ts"],
    bundle: true,
    format: "esm",
    outfile: "test/.bundles/servedParts.test-bundle.mjs",
  });
  return import("./.bundles/servedParts.test-bundle.mjs");
});

const shape = (nodes) => nodes.map((n) => (n.children.length ? [n.name, shape(n.children)] : n.name));

describe("The tree", () => {
  test("nests the flat list by path", () => {
    const tree = buildTree(["Projetos/Verso", "Diario", "Projetos", "Diario/2026/Out", "Diario/2026", "Projetos/Mesa"]);
    assert.deepEqual(shape(tree), [["Diario", [["2026", ["Out"]]]], ["Projetos", ["Mesa", "Verso"]]]);
    assert.deepEqual(flatten(tree).map((n) => n.path), ["Diario", "Diario/2026", "Diario/2026/Out", "Projetos", "Projetos/Mesa", "Projetos/Verso"]);
  });

  test("a folder whose parent was not listed stands under the nearest one that was", () => {
    assert.deepEqual(shape(buildTree(["A", "A/B/C"])), [["A", ["C"]]]);
    assert.deepEqual(shape(buildTree(["X/Y"])), ["Y"]);
  });
});

describe("How a folder shows", () => {
  test("chosen, served with its parent, holding a chosen one, or not served", () => {
    const chosen = ["Projetos", "Diario/2026"];
    assert.equal(stateOf(chosen, "Projetos"), "on");
    assert.equal(stateOf(chosen, "Projetos/Mesa"), "inherited");
    assert.equal(stateOf(chosen, "Diario"), "partly");
    assert.equal(stateOf(chosen, "Diario/2026"), "on");
    assert.equal(stateOf(chosen, "Diario/2026/Out"), "inherited");
    assert.equal(stateOf(chosen, "Diario/2025"), "off");
    assert.equal(stateOf([], "Projetos"), "off");
  });

  test("a name that merely starts alike is not inside", () => {
    assert.equal(covers("Proj", "Projetos"), false);
    assert.equal(stateOf(["Proj"], "Projetos"), "off");
  });
});

describe("What a tick does", () => {
  test("ticking a folder serves what is inside it, so the folders inside it go from the choice", () => {
    assert.deepEqual(choose(["Projetos/Mesa", "Diario"], "Projetos", true), ["Diario", "Projetos"]);
  });

  test("a folder inside a chosen one is already served: nothing changes", () => {
    assert.deepEqual(choose(["Projetos"], "Projetos/Mesa", true), ["Projetos"]);
  });

  test("unticking takes only that folder out; the last one out leaves the whole folder", () => {
    assert.deepEqual(choose(["Diario", "Projetos"], "Diario", false), ["Projetos"]);
    assert.deepEqual(choose(["Projetos"], "Projetos", false), []);
  });
});
