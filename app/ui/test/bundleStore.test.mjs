// Imported bundles kept in the folder (ADR 0098 item 2, decided 2026-10-21):
// `.verso/bundles/<id>.json` through the window's folder data wrapper and the
// harness's in-memory core, as the app has it. An import with a taken id gets
// a new one; what the folder holds is checked again when read; a file that
// is no bundle is named and left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.localStorage = win.localStorage;

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
        };`,
    }));
  },
};

await esbuild.build({
  stdin: {
    contents: `
      export * from "./src/bundles/store";
      export { bundleWords } from "./src/bundles/words";
      export { BUILTIN_PRESETS } from "./src/bundles/presets";
      export { core } from "bindings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/bundleStore.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*", "yaml"],
  banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" },
  plugins: [fakeBindings],
});
const m = await import("./.bundles/bundleStore.test-bundle.mjs");
const pt = m.bundleWords("pt-BR");
const en = m.bundleWords("en-US");
const bundle = (over = {}) => ({ version: 1, id: "mesa", name: "Mesa", description: "d", folders: ["Sessões"], files: [{ path: "A.md", content: "# {{title}}" }], ...over });
const taken = () => new Set(m.BUILTIN_PRESETS.map((b) => b.id));

test("an id the core accepts: lower case, digits, hyphens, never empty or a device", () => {
  assert.equal(m.dataIdOf("Campanha Épica 2"), "campanha-epica-2");
  assert.equal(m.dataIdOf("***"), "modelo");
  assert.equal(m.dataIdOf("nul"), "m-nul");
  assert.equal(m.dataIdOf("a".repeat(100)).length, 64);
});

test("freeId adds a number when the id is taken", () => {
  assert.equal(m.freeId("mesa", new Set()), "mesa");
  assert.equal(m.freeId("mesa", new Set(["mesa"])), "mesa-2");
  assert.equal(m.freeId("mesa", new Set(["mesa", "mesa-2"])), "mesa-3");
});

test("an imported bundle is a file of the folder, read back as the same bundle", async () => {
  const saved = await m.saveFolderBundle(bundle(), taken());
  assert.equal(saved.ok, true);
  assert.equal(saved.renamed, false);
  assert.deepEqual(JSON.parse(m.core.read(".verso/bundles/mesa.json")), bundle());
  const back = await m.loadFolderBundles(pt);
  assert.deepEqual(back.bundles.map((b) => b.id), ["mesa"]);
  assert.deepEqual(back.notes, []);
  assert.deepEqual(back.bundles[0].files, bundle().files);
});

test("an import with the id of another bundle gets a new id and says it was renamed", async () => {
  const again = await m.saveFolderBundle(bundle(), new Set([...taken(), "mesa"]));
  assert.equal(again.ok, true);
  assert.equal(again.renamed, true);
  assert.equal(again.bundle.id, "mesa-2");
  const builtin = await m.saveFolderBundle(bundle({ id: m.BUILTIN_PRESETS[0].id }), taken());
  assert.equal(builtin.renamed, true);
  assert.notEqual(builtin.bundle.id, m.BUILTIN_PRESETS[0].id);
});

test("a file another device created meanwhile is not overwritten", async () => {
  m.core.writeOutside(".verso/bundles/outro.json", JSON.stringify(bundle({ id: "outro", name: "Deles" })));
  const saved = await m.saveFolderBundle(bundle({ id: "outro", name: "Meu" }), taken());
  assert.equal(saved.ok, true);
  assert.equal(saved.bundle.id, "outro-2");
  assert.equal(JSON.parse(m.core.read(".verso/bundles/outro.json")).name, "Deles");
});

test("a file that is no bundle is left out and named; the others still load", async () => {
  m.core.writeOutside(".verso/bundles/quebrado.json", JSON.stringify({ version: 1, id: "quebrado" }));
  m.core.writeOutside(".verso/bundles/nao-json.json", "{ not json");
  m.core.writeOutside(".verso/bundles/mesa (conflict, Mac).json", "{}");
  const back = await m.loadFolderBundles(en);
  assert.ok(back.bundles.some((b) => b.id === "mesa"));
  assert.equal(back.bundles.some((b) => b.id === "quebrado" || b.id === "nao-json"), false);
  const said = back.notes.join("\n");
  assert.match(said, /"quebrado"/);
  assert.match(said, /"nao-json"/);
  assert.match(said, /conflict/);
});

test("a bundle moved by hand to another file name takes the file's name as its id", async () => {
  m.core.writeOutside(".verso/bundles/renomeado.json", JSON.stringify(bundle({ id: "mesa", name: "Movido" })));
  const back = await m.loadFolderBundles(pt);
  const ids = back.bundles.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "no two with one id");
  assert.equal(back.bundles.find((b) => b.id === "renomeado").name, "Movido");
});

test("a write the core refuses is said, not thrown", async () => {
  const huge = bundle({ files: [{ path: "A.md", content: "x".repeat(4 * 1024 * 1024 + 10) }] });
  const saved = await m.saveFolderBundle(huge, taken());
  assert.equal(saved.ok, false);
  assert.match(saved.message, /too large/);
});
