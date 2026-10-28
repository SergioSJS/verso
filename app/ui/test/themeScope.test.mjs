// Theme per folder and per person (ADR 0100 item 4, amended 2026-10-27):
// folder choice, then person's default, then built-in; one folder's choice
// never moves another's, and never overwrites the default.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["./src/theme/scope.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/themeScope.test-bundle.mjs",
  logLevel: "error",
});
const S = await import("./.bundles/themeScope.test-bundle.mjs");

const built = { palette: "paper", fontSize: 16 };
const person = () => ({ palette: "slate", fontSize: 16, lookName: "Mine", look: { light: { "--paper": "#eeeeee" }, dark: {} } });
const store = (s) => JSON.parse(JSON.stringify(S.persistable(s)));

test("order: folder's choice, then the person's default, then built-in", () => {
  const own = { palette: "moss", fontSize: 18 };
  assert.equal(S.resolve({ a: own }, "a", person()).palette, "moss");
  assert.equal(S.resolve({ a: own }, "b", person()).palette, "slate");
  assert.equal(S.resolve({}, "b", built).palette, "paper");
  assert.equal(S.resolve(undefined, "", person()).palette, "slate");
});

test("a folder with no choice of its own shows the default, and storage is unchanged", () => {
  S.reset();
  const s = person();
  S.enter(s, "folder-a");
  assert.equal(s.palette, "slate");
  assert.deepEqual(store(s), person());
});

test("choosing for one folder keeps the default and moves no other folder", () => {
  S.reset();
  const s = person();
  S.enter(s, "folder-a");
  S.startOwn(s, "folder-a");
  assert.deepEqual(store(s), person(), "nothing is kept until a change");
  s.palette = "moss";
  s.lookName = "Only A";
  delete s.look;
  const saved = store(s);
  assert.equal(saved.palette, "slate", "the default stays");
  assert.equal(saved.lookName, "Mine");
  assert.equal(saved.folderThemes["folder-a"].palette, "moss");
  assert.equal(saved.folderThemes["folder-a"].lookName, "Only A");

  // Another window, on folder B, reads what was stored.
  S.reset();
  const b = JSON.parse(JSON.stringify(saved));
  S.enter(b, "folder-b");
  assert.equal(b.palette, "slate");
  assert.equal(b.lookName, "Mine");
  // And a window on folder A sees its own.
  S.reset();
  const a = JSON.parse(JSON.stringify(saved));
  S.enter(a, "folder-a");
  assert.equal(a.palette, "moss");
  assert.equal(S.isOwn(), true);
  // Changing B's own choice does not touch A's.
  S.reset();
  const b2 = JSON.parse(JSON.stringify(saved));
  S.enter(b2, "folder-b");
  S.startOwn(b2, "folder-b");
  b2.palette = "sepia";
  const saved2 = store(b2);
  assert.equal(saved2.folderThemes["folder-a"].palette, "moss");
  assert.equal(saved2.folderThemes["folder-b"].palette, "sepia");
  assert.equal(saved2.palette, "slate");
});

test("changing the default while no folder choice is laid over leaves folder choices alone", () => {
  S.reset();
  const s = { ...person(), folderThemes: { a: { palette: "moss", fontSize: 18 } } };
  S.enter(s, "b");
  s.palette = "sepia";
  const saved = store(s);
  assert.equal(saved.palette, "sepia");
  assert.equal(saved.folderThemes.a.palette, "moss");
});

test("letting the folder follow the default drops only its choice", () => {
  S.reset();
  const s = { ...person(), folderThemes: { a: { palette: "moss", fontSize: 18 }, b: { palette: "sepia", fontSize: 14 } } };
  S.enter(s, "a");
  assert.equal(s.palette, "moss");
  S.stopOwn(s);
  assert.equal(s.palette, "slate");
  assert.deepEqual(Object.keys(s.folderThemes), ["b"]);
  assert.equal(S.isOwn(), false);
  assert.deepEqual(store(s).folderThemes.b, { palette: "sepia", fontSize: 14 });
});

test("switching folders in one window lifts the first folder's choice off", () => {
  S.reset();
  const s = { ...person(), folderThemes: { a: { palette: "moss", fontSize: 18 } } };
  S.enter(s, "a");
  S.enter(s, "b");
  assert.equal(s.palette, "slate");
  assert.equal(s.fontSize, 16);
  assert.equal(S.isOwn(), false);
});
