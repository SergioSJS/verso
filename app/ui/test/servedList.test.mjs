// The served-folders list as the switcher lists it (the maintainer,
// 2026-10-16): given order kept, twins told apart, a filter, a count.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { filterFolders, countTicked, duplicateNames } = await import("../src/dialogs/servedList.js").catch(async () => {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/dialogs/servedList.ts"],
    bundle: true,
    format: "esm",
    outfile: "test/.bundles/servedList.test-bundle.mjs",
  });
  return import("./.bundles/servedList.test-bundle.mjs");
});

const f = (key, name, place = "", ticked = false) => ({ key, name, place, ticked, received_from: null });

describe("Ticked, the filter", () => {
  test("ticked ones are counted; only a repeated name is a twin", () => {
    const list = [f("1", "Caderno", "obsidian", true), f("2", "Caderno", "Dropbox"), f("3", "Solo", "code")];
    assert.equal(countTicked(list), 1);
    assert.deepEqual([...duplicateNames(list)], ["Caderno"]);
  });

  test("filtering keeps the order it was given", () => {
    const list = [f("1", "b-note"), f("2", "a-note"), f("3", "zzz")];
    assert.deepEqual(filterFolders(list, "note").map((x) => x.key), ["1", "2"]);
  });

  test("the filter matches the name or the place, ignoring case and accents", () => {
    const list = [f("1", "Caderno", "obsidian"), f("2", "Ação", "Dropbox"), f("3", "Other", "code")];
    assert.deepEqual(filterFolders(list, "CADER").map((x) => x.key), ["1"]);
    assert.deepEqual(filterFolders(list, "acao").map((x) => x.key), ["2"]);
    assert.deepEqual(filterFolders(list, "drop").map((x) => x.key), ["2"]);
    assert.deepEqual(filterFolders(list, "  ").map((x) => x.key), ["1", "2", "3"]);
    assert.deepEqual(filterFolders(list, "zzz"), []);
  });
});
