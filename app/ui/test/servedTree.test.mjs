// The served-folders list as a tree (ADR 0096 items on choosing folders;
// the maintainer, 2026-10-16): folders grouped by where they are, single-
// child chains folded into one row, duplicates told apart, a filter.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { buildTree, placeSegments, filterFolders, groupHasTicked, countTicked, duplicateNames } = await import("../src/dialogs/servedTree.js").catch(async () => {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/dialogs/servedTree.ts"],
    bundle: true,
    format: "esm",
    outfile: "test/.bundles/servedTree.test-bundle.mjs",
  });
  return import("./.bundles/servedTree.test-bundle.mjs");
});

const f = (key, name, place = "", ticked = false) => ({ key, name, place, ticked, syncs_with: null });

describe("The place of a folder, as segments", () => {
  test("Linux, macOS and Windows separators, a drive kept, empties dropped", () => {
    assert.deepEqual(placeSegments("/home/x/notes"), ["home", "x", "notes"]);
    assert.deepEqual(placeSegments("~/Documents/obsidian"), ["~", "Documents", "obsidian"]);
    assert.deepEqual(placeSegments("C:\\Users\\x\\Documents"), ["C:", "Users", "x", "Documents"]);
    assert.deepEqual(placeSegments("D:/vaults//a/"), ["D:", "vaults", "a"]);
    assert.deepEqual(placeSegments(""), []);
    assert.deepEqual(placeSegments("obsidian"), ["obsidian"]);
  });
});

describe("The tree", () => {
  test("folders with no place sit at the top; the others under their place, sorted", () => {
    const t = buildTree([f("1", "Vault"), f("2", "Caderno", "obsidian"), f("3", "Aulas", "obsidian"), f("4", "Work", "code")]);
    assert.deepEqual(t.folders.map((x) => x.name), ["Vault"]);
    assert.deepEqual(t.groups.map((g) => g.label), ["code", "obsidian"]);
    assert.deepEqual(t.groups[1].folders.map((x) => x.name), ["Aulas", "Caderno"]);
  });

  test("a chain of single-child directories is one row", () => {
    const t = buildTree([f("1", "A", "~/Documents/obsidian"), f("2", "B", "~/Documents/obsidian")]);
    assert.equal(t.groups.length, 1);
    assert.equal(t.groups[0].label, "~/Documents/obsidian");
    assert.equal(t.groups[0].groups.length, 0);
  });

  test("a directory that forks is not folded past the fork", () => {
    const t = buildTree([f("1", "A", "/home/x/obsidian"), f("2", "B", "/home/x/code/rust"), f("3", "C", "/home/x/code/go")]);
    assert.equal(t.groups[0].label, "home/x");
    assert.deepEqual(t.groups[0].groups.map((g) => g.label), ["code", "obsidian"]);
    assert.deepEqual(t.groups[0].groups[0].groups.map((g) => g.label), ["go", "rust"]);
  });

  test("a directory that holds a folder itself is not folded into its child", () => {
    const t = buildTree([f("1", "A", "/home/x"), f("2", "B", "/home/x/sub")]);
    assert.equal(t.groups[0].label, "home/x");
    assert.deepEqual(t.groups[0].folders.map((x) => x.name), ["A"]);
    assert.deepEqual(t.groups[0].groups.map((g) => g.label), ["sub"]);
  });

  test("Windows and Linux places group alike; ids differ per branch", () => {
    const t = buildTree([f("1", "A", "C:\\Users\\x\\vaults"), f("2", "B", "C:\\Users\\x\\vaults"), f("3", "C", "/home/x/vaults")]);
    assert.deepEqual(t.groups.map((g) => g.label), ["C:/Users/x/vaults", "home/x/vaults"]);
    assert.notEqual(t.groups[0].id, t.groups[1].id);
  });

  test("two folders of the same name stay two leaves, told apart by their group", () => {
    const list = [f("1", "Caderno", "obsidian"), f("2", "Caderno", "Dropbox")];
    const t = buildTree(list);
    assert.deepEqual(t.groups.map((g) => [g.label, g.folders[0].key]), [["Dropbox", "2"], ["obsidian", "1"]]);
    assert.deepEqual([...duplicateNames(list)], ["Caderno"]);
  });
});

describe("Ticked, the filter", () => {
  test("a group knows whether a folder below it is ticked, and ticked ones are counted", () => {
    const list = [f("1", "A", "/a/b/c", true), f("2", "B", "/a/b/d"), f("3", "C", "/z")];
    const t = buildTree(list);
    assert.equal(groupHasTicked(t.groups[0]), true);
    assert.equal(groupHasTicked(t.groups[1]), false);
    assert.equal(countTicked(list), 1);
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
