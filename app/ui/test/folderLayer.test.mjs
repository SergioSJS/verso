// Which layer a folder's setting is read from (ADR 0070 items 1–2): the
// folder's `.verso/settings.json` when it has a usable one, this machine's
// otherwise; what the file's first write carries; when the machine's
// bookmarks move in.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { effective, firstWrite, seed, shouldMove, toggled, usable, writable } = await import("../src/organize/layerRules.js").catch(async () => {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/organize/layerRules.ts"],
    bundle: true,
    format: "esm",
    outfile: "test/.bundles/layerRules.test-bundle.mjs",
  });
  return import("./.bundles/layerRules.test-bundle.mjs");
});

const none = { bookmarks: null, folder_note_name: null, ignore_build_dirs: null, respect_gitignore: null, periodic: null, oracle: null, recommended_theme: null };
const absent = { exists: false, problem: null, revision: null, settings: none, warnings: [] };
const file = (settings) => ({ exists: true, problem: null, revision: "1:2:3", settings: { ...none, ...settings }, warnings: [] });
const machine = { bookmarks: ["Daqui.md"], folderNoteName: "README", ignoreBuildDirs: true, respectGitignore: false };

describe("The layer a setting is read from", () => {
  test("no settings file: this machine's values, said as this machine's", () => {
    const now = effective(absent, machine);
    assert.equal(now.scope, "machine");
    assert.deepEqual(now.bookmarks, ["Daqui.md"]);
    assert.equal(now.folderNoteName, "README");
    assert.equal(now.respectGitignore, false);
    assert.equal(effective(null, machine).scope, "machine");
  });

  test("a settings file: its values, and the defaults for what it does not set — never this machine's", () => {
    const now = effective(file({ bookmarks: ["Dali.md"] }), machine);
    assert.equal(now.scope, "folder");
    assert.deepEqual(now.bookmarks, ["Dali.md"]);
    assert.equal(now.folderNoteName, "");
    assert.equal(now.ignoreBuildDirs, true);
    assert.equal(now.respectGitignore, true);
    const set = effective(file({ folder_note_name: "Índice", ignore_build_dirs: false }), machine);
    assert.equal(set.folderNoteName, "Índice");
    assert.equal(set.ignoreBuildDirs, false);
    assert.deepEqual(set.bookmarks, []);
  });

  test("a file that cannot be read now, or a share's window: this machine's, and never written", () => {
    for (const problem of ["unavailable", "invalid", "share"]) {
      const layer = { ...file({ bookmarks: ["Dali.md"] }), problem };
      assert.equal(usable(layer), false);
      assert.equal(writable(layer), false);
      assert.equal(effective(layer, machine).scope, "machine");
      assert.deepEqual(effective(layer, machine).bookmarks, ["Daqui.md"]);
    }
    assert.equal(writable(absent), true);
    assert.equal(writable(null), false);
  });
});

describe("A reader's bookmarks (decided 2026-10-12)", () => {
  test("are this machine's, said as this machine's, while the folder's rules still apply", () => {
    const layer = file({ bookmarks: ["Dali.md"], folder_note_name: "Índice", respect_gitignore: false });
    const reader = effective(layer, machine, false);
    assert.deepEqual(reader.bookmarks, ["Daqui.md"]);
    assert.equal(reader.bookmarksScope, "machine");
    assert.equal(reader.scope, "folder");
    assert.equal(reader.folderNoteName, "Índice");
    assert.equal(reader.respectGitignore, false);
    // One who writes: the folder's, said as the folder's.
    const writer = effective(layer, machine);
    assert.deepEqual(writer.bookmarks, ["Dali.md"]);
    assert.equal(writer.bookmarksScope, "folder");
  });

  test("with no usable file, everything is this machine's for anyone", () => {
    for (const layer of [absent, null, { ...file({ bookmarks: ["Dali.md"] }), problem: "share" }]) {
      for (const writes of [true, false]) {
        const now = effective(layer, machine, writes);
        assert.equal(now.bookmarksScope, "machine");
        assert.deepEqual(now.bookmarks, ["Daqui.md"]);
      }
    }
  });

  test("never move into the folder's file", () => {
    assert.equal(shouldMove(absent, machine, false, false), false);
    assert.equal(shouldMove(absent, machine, false, true), true);
  });
});

describe("The file's first write", () => {
  test("carries this machine's values that differ from the defaults, under the change", () => {
    // The periodic notes' settings move in by their own first change
    // (ADR 0093 item 4), never with another setting's.
    assert.deepEqual(seed(machine), { bookmarks: ["Daqui.md"], folder_note_name: "README", ignore_build_dirs: null, respect_gitignore: false, periodic: null, oracle: null, recommended_theme: null });
    assert.deepEqual(seed({ bookmarks: [], folderNoteName: " ", ignoreBuildDirs: true, respectGitignore: true }), none);
    const first = firstWrite(absent, machine, { ...none, ignore_build_dirs: false });
    assert.deepEqual(first, { bookmarks: ["Daqui.md"], folder_note_name: "README", ignore_build_dirs: false, respect_gitignore: false, periodic: null, oracle: null, recommended_theme: null });
    // So the values that apply are the same before and after it.
    const after = effective(file(first), machine);
    assert.deepEqual({ ...after, scope: "machine", bookmarksScope: "machine" }, { ...effective(absent, machine), ignoreBuildDirs: false });
  });

  test("over an existing file the change goes alone", () => {
    const change = { ...none, bookmarks: ["x.md"] };
    assert.deepEqual(firstWrite(file({}), machine, change), change);
  });
});

describe("This machine's bookmarks move in once", () => {
  test("only into a folder with no settings file, that can take one, with something to move, not moved before", () => {
    assert.equal(shouldMove(absent, machine, false), true);
    assert.equal(shouldMove(absent, machine, true), false);
    assert.equal(shouldMove(file({}), machine, false), false);
    assert.equal(shouldMove({ ...absent, problem: "share" }, machine, false), false);
    assert.equal(shouldMove(absent, { ...machine, bookmarks: [] }, false), false);
    assert.equal(shouldMove(null, machine, false), false);
  });

  test("a star toggles one path, at the end", () => {
    assert.deepEqual(toggled(["a.md"], "b.md"), ["a.md", "b.md"]);
    assert.deepEqual(toggled(["a.md", "b.md"], "a.md"), ["b.md"]);
  });
});
