// The oracle finds the folder's tables through the index, not by reading
// every note (ADR 0102 item 3, R.2 = B): `list_block_ids` lists them, and a
// note is read only when its table is chosen (or on the settings page, for
// the notes that hold one). The harness's core answers the command.
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
    // The window's folder state needs the page's elements; the scan only
    // reads which folder is open.
    build.onResolve({ filter: /(^|\/)folder$/ }, () => ({ path: "folder", namespace: "fake" }));
    build.onLoad({ filter: /^folder$/, namespace: "fake" }, () => ({ loader: "ts", contents: 'export const currentFolder = "";' }));
    build.onLoad({ filter: /^bindings$/, namespace: "fake" }, () => ({
      resolveDir: ".",
      loader: "ts",
      contents: `
        import { Core } from "./src/harness/core";
        export const core = new Core([], "t");
        export const calls: string[] = [];
        const ask = async (cmd: string, args: object) => {
          calls.push(cmd);
          try {
            return { status: "ok", data: core.invoke(cmd, args) };
          } catch (error) {
            return { status: "error", error };
          }
        };
        export const commands = {
          listBlockIds: (kinds: string[]) => ask("list_block_ids", { kinds }),
          listNotes: () => ask("list_notes", {}),
          readNote: (path: string) => ask("read_note", { path }),
          createNote: (name: string, text: string) => ask("create_note", { name, text }),
        };`,
    }));
  },
};

await esbuild.build({
  stdin: {
    contents: `
      export * from "./src/oracle/scan";
      export * from "./src/oracle/tables";
      export { core, calls } from "bindings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/oracleScan.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*", "yaml"],
  banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" },
  plugins: [fakeBindings],
});
const S = await import("./.bundles/oracleScan.test-bundle.mjs");

const MESA = "# Mesa\n\n## Clima\n\n- sol\n- chuva\n- neve\n\n^clima\n\n## Texto\n\nUm paragrafo. ^par\n\n## Tabelinha\n\n| d4 | Algo |\n| --- | --- |\n| 1 | um |\n| 2-3 | dois |\n| 4 | quatro |\n\n^dado\n";
S.core.invoke("create_note", { name: "Mesa", text: MESA });
S.core.invoke("create_note", { name: "Outra", text: "- a\n- b ^lista\n" });
S.core.invoke("create_note", { name: "Vazia", text: "- so ^um\n" });
S.core.invoke("create_note", { name: "Nada", text: "sem blocos\n" });

test("the tables are listed from the index: no note is read to discover them", async () => {
  S.calls.length = 0;
  const found = await S.scanNoteTables(true);
  assert.equal(found.capped, false);
  assert.deepEqual(S.calls, ["list_block_ids"]);
  // Lists and tables only, never the paragraph; rows not read yet.
  assert.deepEqual(found.tables.map((t) => t.id), ["Mesa.md#^clima", "Mesa.md#^dado", "Outra.md#^lista", "Vazia.md#^um"]);
  assert.ok(found.tables.every((t) => t.unread === true && t.entries.length === 0));
  // Named by the heading above, else by the id.
  assert.deepEqual(found.tables.map((t) => t.name), ["Clima", "Tabelinha", "Lista", "Um"]);
  assert.equal(S.getAllOracleTables().length, S.BUILTIN_ORACLE_TABLES.length + 4);
});

test("a note is read when its table is chosen, and only that note", async () => {
  await S.scanNoteTables(true);
  S.calls.length = 0;
  const dado = S.noteTables().find((t) => t.block === "dado");
  const loaded = await S.loadTableRows(dado);
  assert.deepEqual(S.calls, ["read_note"]);
  assert.deepEqual(loaded.entries, ["um", "dois", "dois", "quatro"]);
  assert.equal(loaded.die, "d4");
  assert.equal(loaded.name, "Tabelinha");
  assert.equal(loaded.unread, undefined);
  // The folder's list holds the loaded table now.
  assert.equal(S.noteTables().find((t) => t.block === "dado").entries.length, 4);
  assert.equal(S.noteTables().find((t) => t.block === "clima").unread, true);
});

test("a listed block that does not read as a table is taken off the list", async () => {
  await S.scanNoteTables(true);
  S.core.invoke("create_note", { name: "Tarefas", text: "- uma ^tarefas\n" });
  const found = await S.scanNoteTables(true);
  const t = found.tables.find((x) => x.block === "tarefas");
  assert.ok(t, "listed from the index");
  // One entry is a list a roll could draw from: it reads. A die that no row
  // owns does not.
  S.core.invoke("create_note", { name: "Buraco", text: "| d4 | Algo |\n| --- | --- |\n| 1 | um |\n| 2 | dois |\n\n^buraco\n" });
  const again = await S.scanNoteTables(true);
  const hole = again.tables.find((x) => x.block === "buraco");
  assert.ok(hole);
  assert.equal(await S.loadTableRows(hole), null);
  assert.equal(S.noteTables().some((x) => x.block === "buraco"), false);
});

test("the settings read the notes that hold a table, once each", async () => {
  const found = await S.scanNoteTables(true);
  S.calls.length = 0;
  const all = await S.loadAllRows(found.tables);
  assert.deepEqual([...S.calls].sort(), Array.from({ length: S.calls.length }, () => "read_note"));
  const notes = new Set(found.tables.map((t) => t.note));
  assert.equal(S.calls.length, notes.size);
  assert.ok(all.every((t) => t.entries.length > 0 && !t.unread));
  assert.deepEqual(all.find((t) => t.block === "clima").entries, ["sol", "chuva", "neve"]);
});

test("T.2: a table of one row and a task list are not offered; a table of two rows and a plain list are", async () => {
  S.core.invoke("create_note", {
    name: "Misto",
    text: "| d4 | A |\n| --- | --- |\n| 1 | so uma |\n\n^pouca\n\n| d4 | A |\n| --- | --- |\n| 1 | um |\n| 2 | dois |\n\n^duas\n\n- [ ] a fazer\n- [x] feito\n\n^tarefas\n\n- um\n- dois\n\n^lista2\n",
  });
  const found = await S.scanNoteTables(true);
  const mine = found.tables.filter((t) => t.note === "Misto.md").map((t) => t.block);
  assert.deepEqual(mine, ["duas", "lista2"]);
  S.core.invoke("delete_note", { path: "Misto.md" });
});
