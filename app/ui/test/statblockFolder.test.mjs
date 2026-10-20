// The store's folder through the window's own wrapper (statblock/folderWire.ts
// over src/folderData.ts) and the harness's in-memory core, as the app has it
// (ADR 0099 item 2): layouts written as `.verso/layouts/<id>.json`, read back
// validated, a change made outside read again, a stale write refused and
// said, a file that cannot be read now left out.
import { test, beforeEach } from "node:test";
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
          getFolderSettings: () => ask("get_folder_settings", {}),
          setFolderSettings: (change: object, revision: string | null) => ask("set_folder_settings", { change, revision }),
        };`,
    }));
  },
};

await esbuild.build({
  stdin: {
    contents: `
      export * from "./src/statblock/store";
      export { attachFolderLayouts, folderLayoutsApi } from "./src/statblock/folderWire";
      export { setStatblockLang } from "./src/statblock/strings";
      export { core } from "bindings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblockFolder.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
  banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" },
  plugins: [fakeBindings],
});
const m = await import("./.bundles/statblockFolder.test-bundle.mjs");
const tick = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  localStorage.clear();
  m.setStatblockLang("en");
});

test("a duplicate is a file of the folder, read back as a folder layout", async () => {
  await m.attachFolderLayouts();
  assert.equal(m.canWriteLayouts(), true);
  const r = await m.duplicateLayout("facts-trackers");
  assert.equal(r.ok, true, r.why);
  const text = m.core.read(".verso/layouts/facts-trackers-copy.json");
  assert.equal(JSON.parse(text).id, "facts-trackers-copy");
  await m.reloadFolder();
  const mine = m.allLayouts().find((s) => s.layout.id === "facts-trackers-copy");
  assert.equal(mine.source, "folder");
  assert.ok(mine.revision);
});

test("a change made outside is read again; a stale save is refused and said", async () => {
  await m.attachFolderLayouts();
  await m.duplicateLayout("d20-creature");
  await m.reloadFolder();
  const mine = m.allLayouts().find((s) => s.layout.id === "d20-creature-copy");
  const theirs = { ...mine.layout, name: { en: "Theirs", pt: "Deles" } };
  m.core.writeOutside(".verso/layouts/d20-creature-copy.json", JSON.stringify(theirs));
  const r = await m.saveLayout({ ...mine.layout, columns: 3 }, mine.revision);
  assert.equal(r.ok, false);
  assert.equal(r.stale, true);
  assert.equal(JSON.parse(m.core.read(".verso/layouts/d20-creature-copy.json")).name.en, "Theirs", "nothing written over theirs");
  await m.reloadFolder();
  assert.equal(m.resolveLayout("Theirs").stored.layout.id, "d20-creature-copy");
});

test("this window's writes are heard and read again", async () => {
  await m.attachFolderLayouts();
  let told = 0;
  const stop = m.onLayoutsChanged(() => told++);
  await m.duplicateLayout("facts-trackers");
  await tick();
  assert.ok(told >= 2, "the store's own notice and the folder's");
  stop();
});

test("a file that is not a layout's JSON object is left out, not thrown", async () => {
  m.core.writeOutside(".verso/layouts/broken.json", "{ not json");
  await m.attachFolderLayouts();
  assert.equal(m.allLayouts().some((s) => s.layout.id === "broken"), false);
});
