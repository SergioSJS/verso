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

const built = { palette: "paper" };
const person = () => ({ palette: "slate", lookName: "Mine", look: { light: { "--paper": "#eeeeee" }, dark: {} } });
const store = (s) => JSON.parse(JSON.stringify(S.persistable(s)));

test("order: folder's choice, then the person's default, then built-in", () => {
  const own = { palette: "moss" };
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
  const started = store(s);
  assert.deepEqual(started.folderThemes["folder-a"], { palette: "slate", lookName: "Mine", look: person().look }, "a copy of the default is stored at once");
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
  const s = { ...person(), folderThemes: { a: { palette: "moss" } } };
  S.enter(s, "b");
  s.palette = "sepia";
  const saved = store(s);
  assert.equal(saved.palette, "sepia");
  assert.equal(saved.folderThemes.a.palette, "moss");
});

test("letting the folder follow the default drops only its choice", () => {
  S.reset();
  const s = { ...person(), folderThemes: { a: { palette: "moss" }, b: { palette: "sepia" } } };
  S.enter(s, "a");
  assert.equal(s.palette, "moss");
  S.stopOwn(s);
  assert.equal(s.palette, "slate");
  assert.deepEqual(Object.keys(s.folderThemes), ["b"]);
  assert.equal(S.isOwn(), false);
  assert.deepEqual(store(s).folderThemes.b, { palette: "sepia" });
});

test("switching folders in one window lifts the first folder's choice off", () => {
  S.reset();
  const s = { ...person(), folderThemes: { a: { palette: "moss" } } };
  S.enter(s, "a");
  S.enter(s, "b");
  assert.equal(s.palette, "slate");
  assert.equal(S.isOwn(), false);
});

test("the folder's own mode survives a reload from storage", () => {
  S.reset();
  const s = person();
  S.enter(s, "a");
  S.startOwn(s, "a");
  const stored = store(s);
  S.reset(); // storage event: settings read afresh
  const again = JSON.parse(JSON.stringify(stored));
  S.enter(again, "a");
  assert.equal(S.isOwn(), true);
  again.palette = "moss";
  const saved = store(again);
  assert.equal(saved.palette, "slate", "the default is not written");
  assert.equal(saved.folderThemes.a.palette, "moss");
});

test("the text size is global: a folder's choice neither carries nor changes it", () => {
  S.reset();
  const s = { ...person(), fontSize: 16, folderThemes: { a: { palette: "moss" } } };
  S.enter(s, "a");
  s.fontSize = 20;
  const saved = store(s);
  assert.equal(saved.fontSize, 20);
  assert.equal(saved.folderThemes.a.fontSize, undefined);
});

test("a folder's choice lacking a palette or heading font gets the default's, not the last folder's", () => {
  S.reset();
  const s = { ...person(), headingFont: "mono", folderThemes: { a: { palette: "moss", headingFont: "sans" }, b: { lookName: "B" } } };
  S.enter(s, "a");
  assert.equal(s.headingFont, "sans");
  S.enter(s, "b");
  assert.equal(s.palette, "slate");
  assert.equal(s.headingFont, "mono");
  assert.equal(s.lookName, "B");
});

// --- two windows sharing one storage (the `storage` event reloads the other)
for (const w of ["A", "B"]) {
  await esbuild.build({ entryPoints: ["./src/theme/scope.ts"], bundle: true, format: "esm", platform: "node", outfile: `test/.bundles/themeScope${w}.test-bundle.mjs`, logLevel: "error" });
}
function windows(folderA, folderB, start) {
  const storage = { text: JSON.stringify(start) };
  const make = async (name, folder) => {
    const mod = await import(`./.bundles/themeScope${name}.test-bundle.mjs`);
    const win = { mod, folder, s: null };
    win.load = () => { win.s = JSON.parse(storage.text); mod.reset(); mod.enter(win.s, win.folder); };
    win.save = () => { storage.text = mod.toStorage(win.s, win.folder); };
    win.load();
    return win;
  };
  return Promise.all([make("A", folderA), make("B", folderB)]).then(([a, b]) => ({ a, b, storage }));
}

test("two windows: a change in window A on folder X (This folder only) leaves window B on folder Y alone", async () => {
  const { a, b } = await windows("X", "Y", person());
  assert.equal(a.mod.forFolder("X"), true, "This folder only is the preselected choice");
  a.s.palette = "moss"; // any path that writes the theme fields, then saves
  a.s.look = { light: { "--paper": "#ffffff" }, dark: {} };
  a.save();
  b.load(); // the storage event reaches B
  assert.equal(b.s.palette, "slate");
  assert.equal(b.s.look.light["--paper"], "#eeeeee");
  b.save(); // B saving back must not carry A's look to the default
  a.load();
  assert.equal(a.s.palette, "moss", "A keeps its own after B saved");
  b.load();
  assert.equal(b.s.palette, "slate");
});

test("two windows: with the default picked, the change reaches the folder without a choice, not the one that has its own", async () => {
  const { a, b, storage } = await windows("X", "Y", { ...person(), folderThemes: { Y: { palette: "sepia" } } });
  a.mod.chooseDefault("X");
  a.s.palette = "moss";
  a.save();
  assert.equal(JSON.parse(storage.text).palette, "moss");
  assert.equal(JSON.parse(storage.text).folderThemes.X, undefined);
  b.load();
  assert.equal(b.s.palette, "sepia", "Y has its own choice");
  const c = JSON.parse(storage.text);
  assert.equal(c.folderThemes.Y.palette, "sepia");
});

test("opening a folder and saving something else stores no folder choice", async () => {
  const { a, storage } = await windows("X", "Y", person());
  a.s.someOtherSetting = 1;
  a.save();
  assert.equal(JSON.parse(storage.text).folderThemes, undefined);
});

test("two windows: a dark catalogue theme chosen in window A on folder X does not turn window B on folder Y dark", async () => {
  // As the maintainer saw it (2026-10-27): A picked a dark theme, the
  // catalogue switched the mode to dark, and B — a light theme — went dark.
  const { a, b, storage } = await windows("P", "Q", { ...person(), theme: "light" });
  a.load();
  b.load();
  a.s.lookName = "Ayu Mirage";
  a.s.theme = "dark";
  a.save();
  b.load();
  assert.equal(b.s.theme, "light", "B keeps its mode");
  assert.equal(b.s.lookName, "Mine");
  assert.equal(JSON.parse(storage.text).theme, "light", "the default's mode stays");
  assert.equal(JSON.parse(storage.text).folderThemes.P.theme, "dark");
  b.save();
  a.load();
  assert.equal(a.s.theme, "dark", "A, reloaded, still shows its folder's mode");
});

test("a folder's choice stored before the mode was part of a theme takes the default's mode", () => {
  S.reset();
  const s = { ...person(), theme: "light", folderThemes: { a: { palette: "moss" } } };
  S.enter(s, "a");
  assert.equal(s.theme, "light");
  assert.equal(s.palette, "moss");
});
