// The folder's data files, `.verso/layouts/` and `.verso/bundles/` (ADR 0099
// item 2, ADR 0098 item 2), through the window's wrapper (`src/folderData.ts`)
// over the harness's answers (`src/harness/folderData.ts`), which follow the
// core's rules: a create that never replaces, a write over the version read
// only, an id out of the rule or a text that is not one JSON object of at
// most 256 KiB refused, a removal through the bin. And the oracle's keys in
// the folder's settings (ADR 0102 item 2), checked as the core checks them.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

// The window's `commands`, standing on the harness's core: what the app
// would ask the host, answered in memory.
const fakeBindings = {
  name: "fake-bindings",
  setup(build) {
    build.onResolve({ filter: /(^|\/)bindings$/ }, () => ({ path: "bindings", namespace: "fake" }));
    build.onLoad({ filter: /.*/, namespace: "fake" }, () => ({
      resolveDir: ".",
      loader: "ts",
      contents: `
        import { Core } from "./src/harness/core";
        export const core = new Core([], "t");
        const ask = (cmd: string, args: object) => {
          try {
            return { status: "ok", data: core.invoke(cmd, args) };
          } catch (error) {
            return { status: "error", error };
          }
        };
        export const commands = {
          listFolderData: (kind: string) => ask("list_folder_data", { kind }),
          readFolderData: (kind: string, id: string) => ask("read_folder_data", { kind, id }),
          writeFolderData: (kind: string, id: string, text: string, revision: string | null) => ask("write_folder_data", { kind, id, text, revision }),
          removeFolderData: (kind: string, id: string, revision: string) => ask("remove_folder_data", { kind, id, revision }),
          getFolderSettings: () => ask("get_folder_settings", {}),
          setFolderSettings: (change: object, revision: string | null) => ask("set_folder_settings", { change, revision }),
        };`,
    }));
  },
};

await esbuild.build({
  stdin: {
    contents: `
      export * from "./src/folderData";
      export { core, commands } from "bindings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/folderData.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
  banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" },
  plugins: [fakeBindings],
});
const F = await import("./.bundles/folderData.test-bundle.mjs");

/** The contract error a call throws, or null. */
async function failure(run) {
  try {
    await run();
    return null;
  } catch (e) {
    return e;
  }
}

describe("The folder's data files", () => {
  test("a file is created, listed, read back parsed and replaced over the version read", async () => {
    assert.deepEqual(await F.listData("layouts"), { entries: [], strays: [] });
    const r1 = await F.writeData("layouts", "mesa", { cards: [1, 2] }, null);
    assert.deepEqual((await F.listData("layouts")).entries.map((e) => e.id), ["mesa"]);
    const read = await F.readData("layouts", "mesa");
    assert.deepEqual(read.value, { cards: [1, 2] });
    assert.equal(read.revision, r1);
    assert.equal((await F.listData("layouts")).entries[0].revision, r1);
    const r2 = await F.writeData("layouts", "mesa", { cards: [] }, r1);
    assert.notEqual(r2, r1);
    assert.deepEqual((await F.readData("layouts", "mesa")).value, { cards: [] });
    // The file is where the core keeps it, in the folder's own directory.
    assert.equal(F.core.read(".verso/layouts/mesa.json"), JSON.stringify({ cards: [] }, null, 2));
    // The two kinds are apart.
    assert.deepEqual(await F.listData("bundles"), { entries: [], strays: [] });
    assert.equal((await failure(() => F.readData("bundles", "mesa"))).kind, "not_found");
  });

  test("a create finds the file there: exists, and nothing is replaced", async () => {
    await F.writeData("bundles", "mundo", { a: 1 }, null);
    const e = await failure(() => F.writeData("bundles", "mundo", { a: 2 }, null));
    assert.equal(e.kind, "exists");
    assert.deepEqual((await F.readData("bundles", "mundo")).value, { a: 1 });
  });

  test("a write over a version that is not the file's is stale: changed, nothing written", async () => {
    const r1 = await F.writeData("layouts", "velho", { v: 1 }, null);
    F.core.writeOutside(".verso/layouts/velho.json", '{"v": 2}');
    const e = await failure(() => F.writeData("layouts", "velho", { v: 3 }, r1));
    assert.equal(e.kind, "changed");
    assert.equal(F.core.read(".verso/layouts/velho.json"), '{"v": 2}');
    const gone = await failure(() => F.removeData("layouts", "velho", r1));
    assert.equal(gone.kind, "changed");
    // Over a file that is not there: not found.
    assert.equal((await failure(() => F.writeData("layouts", "nunca", {}, "1"))).kind, "not_found");
  });

  test("an id out of the rule is refused before anything is asked", async () => {
    const before = F.core.calls.length;
    const long = "a".repeat(65);
    for (const bad of ["", "..", "../x", "a/b", "a\\b", "A", "mesa.json", ".oculto", "-a", "a b", "é", "con", "nul", "com1", "lpt9", long]) {
      for (const run of [() => F.readData("layouts", bad), () => F.writeData("layouts", bad, {}, null), () => F.removeData("layouts", bad, "1")]) {
        const e = await failure(run);
        assert.equal(e?.kind, "refused", JSON.stringify(bad));
      }
    }
    assert.equal(F.core.calls.length, before);
    assert.equal(F.validDataId("a"), true);
    assert.equal(F.validDataId("mesa-de-jogo-2"), true);
    assert.equal(F.validDataId("a".repeat(64)), true);
    assert.equal(F.validDataId("com10"), true);
  });

  test("the harness's core refuses what the wrapper would not send too, as the core does", () => {
    const ask = (cmd, args) => {
      try {
        return F.core.invoke(cmd, args);
      } catch (e) {
        return e;
      }
    };
    for (const id of ["../fora", "Mesa", "con", "x/y"]) {
      assert.equal(ask("write_folder_data", { kind: "layouts", id, text: "{}", revision: null }).kind, "refused", id);
    }
    assert.equal(ask("write_folder_data", { kind: "ruins", id: "x", text: "{}", revision: null }).kind, "refused");
    for (const text of ["", "[1]", "3", "null", "{", "nope"]) {
      assert.equal(ask("write_folder_data", { kind: "layouts", id: "fora", text, revision: null }).kind, "refused", text);
    }
  });

  test("a value that is not an object, or is too large, is refused and nothing is written", async () => {
    for (const bad of [[1, 2], null, "x", 3]) {
      assert.equal((await failure(() => F.writeData("layouts", "mal", bad, null)))?.kind, "refused");
    }
    const big = { a: "x".repeat(F.FOLDER_DATA_MOST.layouts) };
    const e = await failure(() => F.writeData("layouts", "grande", big, null));
    assert.equal(e.kind, "refused");
    assert.match(e.message, /too large/);
    assert.equal(F.core.read(".verso/layouts/grande.json"), null);
    // The core itself, asked for a text past the bound or not an object.
    const ask = (text) => {
      try {
        F.core.invoke("write_folder_data", { kind: "layouts", id: "grande", text, revision: null });
        return null;
      } catch (e) {
        return e;
      }
    };
    assert.equal(ask(JSON.stringify(big)).kind, "refused");
    assert.match(ask("[]").message, /not a JSON object/);
  });

  test("a bundle may be larger than a layout, to 4 MiB", async () => {
    const mib = { a: "x".repeat(1024 * 1024) };
    assert.equal((await failure(() => F.writeData("layouts", "grande", mib, null))).kind, "refused");
    const r = await F.writeData("bundles", "grandao", mib, null);
    assert.equal((await F.readData("bundles", "grandao")).revision, r);
    const huge = { a: "x".repeat(F.FOLDER_DATA_MOST.bundles) };
    assert.equal((await failure(() => F.writeData("bundles", "imenso", huge, null))).kind, "refused");
    assert.equal(F.core.read(".verso/bundles/imenso.json"), null);
  });

  test("a name that is not an id is listed among the strays, with a notice that says how to resolve it", async () => {
    const copy = "mesa (conflict, Mac, 2026-10-20).json";
    await F.writeData("layouts", "unica", { a: 1 }, null);
    F.core.writeOutside(`.verso/layouts/${copy}`, "{}");
    F.core.writeOutside(".verso/layouts/Mesa.json", "{}");
    const listed = await F.listData("layouts");
    assert.ok(listed.entries.some((e) => e.id === "unica"));
    assert.ok(listed.entries.every((e) => e.id !== "Mesa"));
    assert.deepEqual(listed.strays, ["Mesa.json", copy]);
    assert.deepEqual((await F.listData("bundles")).strays, []);
    for (const lang of ["en", "pt-BR"]) {
      const note = F.strayNotice("layouts", listed.strays, lang);
      assert.match(note, /mesa \(conflict, Mac, 2026-10-20\)\.json/);
      assert.match(note, /\.verso\/layouts\//);
      assert.match(note, lang === "en" ? /rename .* delete/ : /renomeie .* exclua/);
    }
    assert.equal(F.strayNotice("layouts", []), "");
  });

  test("a file edited by hand that is not an object is refused on reading and left as it is", async () => {
    F.core.writeOutside(".verso/bundles/torto.json", "[1, 2]");
    const e = await failure(() => F.readData("bundles", "torto"));
    assert.equal(e.kind, "refused");
    assert.equal(F.core.read(".verso/bundles/torto.json"), "[1, 2]");
    F.core.writeOutside(".verso/bundles/lixo.json", "not json");
    assert.equal((await failure(() => F.readData("bundles", "lixo"))).kind, "refused");
  });

  test("a removal goes through the bin over the version read", async () => {
    const r = await F.writeData("layouts", "sai", { x: 1 }, null);
    await F.removeData("layouts", "sai", r);
    assert.equal(F.core.read(".verso/layouts/sai.json"), null);
    assert.equal(F.core.read(".trash/.verso/layouts/sai.json"), JSON.stringify({ x: 1 }, null, 2));
    assert.ok((await F.listData("layouts")).entries.every((e) => e.id !== "sai"));
    assert.equal((await failure(() => F.removeData("layouts", "sai", r))).kind, "not_found");
  });

  test("listeners hear this window's changes and the folder's, of their kind only", async () => {
    const heard = [];
    F.onFolderData("layouts", () => heard.push("layouts"));
    F.onFolderData("bundles", () => heard.push("bundles"));
    const r = await F.writeData("layouts", "ouvido", {}, null);
    assert.deepEqual(heard, ["layouts"]);
    await F.removeData("layouts", "ouvido", r);
    assert.deepEqual(heard, ["layouts", "layouts"]);
    // A refused change is no change.
    await failure(() => F.writeData("layouts", "A", {}, null));
    assert.equal(heard.length, 2);
    // Outside: sync, another window.
    F.folderDataChangedAt([".verso/bundles/mundo.json", "Nota.md", ".verso/settings.json"]);
    assert.deepEqual(heard.slice(2), ["bundles"]);
    F.folderDataChangedAt([".verso/layouts/a.json", ".verso/bundles/b.json", ".verso/layouts/c.json"]);
    assert.deepEqual(heard.slice(3).sort(), ["bundles", "layouts"]);
    F.folderDataChangedAt(["Nota.md"]);
    assert.equal(heard.length, 5);
  });
});

describe("The oracle's keys in the folder's settings", () => {
  const settings = (oracle) => ({ bookmarks: null, folder_note_name: null, ignore_build_dirs: null, respect_gitignore: null, periodic: null, oracle, recommended_theme: null });
  const odds = Array.from({ length: 5 }, () => [10, 30, 20, 20, 15, 5]);
  const sparks = { action: ["abandonar"], theme: ["honra"], descriptor: ["ardente"], focus: ["aliado"] };
  const set = (oracle, revision = null) => {
    try {
      return F.core.invoke("set_folder_settings", { change: settings(oracle), revision });
    } catch (e) {
      return e;
    }
  };

  test("a change in the bounds is kept and read back; the file keeps every other key", () => {
    const layer = set({ odds, sparks });
    assert.deepEqual(layer.settings.oracle, { odds, sparks, clear_odds: null, clear_sparks: null });
    const next = set({ odds: null, sparks: { ...sparks, focus: ["rival", "aliado"] } }, layer.revision);
    assert.deepEqual(next.settings.oracle.odds, odds);
    assert.deepEqual(next.settings.oracle.sparks.focus, ["rival", "aliado"]);
    assert.deepEqual(next.warnings, []);
  });

  test("odds that are not five rows of six adding to 100, and sparks out of bounds, are refused", () => {
    const refused = (oracle) => assert.equal(set(oracle).kind, "refused", JSON.stringify(oracle).slice(0, 80));
    const row = (r, v) => odds.map((x, i) => (i === r ? v : x));
    refused({ odds: odds.slice(1), sparks: null });
    refused({ odds: [...odds, odds[0]], sparks: null });
    refused({ odds: row(2, [10, 30, 20, 20, 15]), sparks: null });
    refused({ odds: row(2, [10, 30, 20, 20, 15, 6]), sparks: null });
    refused({ odds: row(0, [10, 30, 20, 20, 15, 4]), sparks: null });
    refused({ odds: null, sparks: { ...sparks, action: [] } });
    refused({ odds: null, sparks: { ...sparks, theme: Array(201).fill("a") } });
    refused({ odds: null, sparks: { ...sparks, focus: [""] } });
    refused({ odds: null, sparks: { ...sparks, descriptor: ["a".repeat(61)] } });
    // Nothing was written by the refusals: the file is what the first test left.
    assert.equal(F.core.read(".verso/settings.json")?.includes('"focus": [\n        "rival"'), true);
    const edge = set({ odds: null, sparks: { ...sparks, theme: Array(200).fill("a") } }, F.core.invoke("get_folder_settings", {}).revision);
    assert.equal(edge.settings.oracle.sparks.theme.length, 200);
  });

  test("a clear takes one key out; the last one takes `oracle` itself; set and clear together are refused; a stale revision writes nothing", () => {
    const first = set({ odds, sparks }, F.core.invoke("get_folder_settings", {}).revision);
    const stale = first.revision;
    const afterOne = set({ odds: null, sparks: null, clear_odds: true }, first.revision);
    assert.equal(afterOne.settings.oracle.odds, null);
    assert.deepEqual(afterOne.settings.oracle.sparks, sparks);
    assert.equal(set({ odds: null, sparks: null, clear_sparks: true }, stale).kind, "changed");
    assert.equal(set({ odds, sparks: null, clear_odds: true }, afterOne.revision).kind, "refused");
    assert.equal(F.core.read(".verso/settings.json")?.includes('"sparks"'), true);
    const none = set({ odds: null, sparks: null, clear_sparks: true }, afterOne.revision);
    assert.equal(none.settings.oracle, null);
    assert.equal(F.core.read(".verso/settings.json")?.includes("oracle"), false);
  });

  test("a value written by hand that does not pass is not applied, and the read says so", () => {
    F.core.writeOutside(".verso/settings.json", JSON.stringify({ oracle: { odds: [[1, 2]], sparks: { action: ["a"] } }, bookmarks: ["Nota.md"] }));
    const layer = F.core.invoke("get_folder_settings", {});
    assert.deepEqual(layer.settings.oracle, { odds: null, sparks: null, clear_odds: null, clear_sparks: null });
    assert.equal(layer.warnings.length, 2);
    assert.deepEqual(layer.settings.bookmarks, ["Nota.md"]);
  });
});
