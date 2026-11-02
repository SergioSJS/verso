// The synced desktop's window (ADR 0113 S8): for a folder synced here that
// is not the person's own, editing a file is what the host heard the server
// say of it — a reader edits the notes they have the right to, an editor
// leaves those they only see — whatever their role, and the host is asked
// again when access changes.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const listeners = {};
globalThis.addEventListener = (name, fn) => ((listeners[name] ??= []).push(fn));
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = (e) => {
  for (const fn of listeners[e.type] ?? []) fn(e);
  return true;
};
globalThis.CustomEvent = class extends Event {
  constructor(type, init) {
    super(type);
    this.detail = init?.detail;
  }
};

const asked = [];
let heard = { fresh: true, files: [] };
let entries = [];
globalThis.window = globalThis;
globalThis.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    if (cmd === "sync_rights") {
      asked.push(args.paths);
      return heard;
    }
    if (cmd === "capabilities") return { host: "desktop", can: ["write"], latency_ms: null };
    if (cmd === "list_entries") return entries;
    throw new Error(cmd);
  },
  transformCallback: () => 0,
};

await esbuild.build({
  stdin: { contents: 'export * from "./access"; export { commands } from "./bindings";', resolveDir: "src", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/access-synced.test-bundle.mjs",
  logLevel: "error",
});
const access = await import("./.bundles/access-synced.test-bundle.mjs");
const { commands } = access;

const state = (role) => dispatchEvent(new CustomEvent("verso:sync-state", { detail: { on: true, state: "synced", role, live: true } }));
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const edit = (level) => ({ level, attach: false, why: { kind: "own" } });

test("a window the host never answered keeps to its role", async () => {
  state("reader");
  access.remember("Edita.md", edit("edit"));
  // The web's synced folder: the server's own answer rides its reads, and a
  // reader there stays locked as before.
  assert.equal(access.may("Edita.md", "edit"), false);
});

test("a reader edits the note the host heard they may, and only that one", async () => {
  access.hearAccess();
  state("reader");
  access.forgetAccess();
  entries = [{ path: "Edita.md" }, { path: "Le.md" }];
  await commands.listEntries("");
  await settle();
  // Locked as ever until the host has told.
  assert.equal(access.may("Edita.md", "edit"), false);
  access.remember("Edita.md", edit("edit"));
  access.remember("Le.md", edit("see"));
  assert.equal(access.may("Edita.md", "edit"), true);
  assert.equal(access.may("Le.md", "edit"), false);
  // The folder itself stays the reader's: nothing is created or deleted.
  assert.equal(access.may("", "create"), false);
  assert.equal(access.may("Edita.md", "delete"), false);
});

test("an editor leaves the note the host heard they only see", async () => {
  state("editor");
  access.forgetAccess();
  access.remember("Livre.md", edit("see"));
  access.remember("Minha.md", edit("edit"));
  assert.equal(access.may("Livre.md", "edit"), false);
  assert.equal(access.may("Minha.md", "edit"), true);
});

test("an editor of a synced folder is offered no delete, only the folder's owner is (B8, item 8 of 2026-11-01)", async () => {
  // No word from the server's capabilities yet (the seat is not known): the
  // sync state's role is what the window has, and it is enough.
  state("editor");
  access.forgetAccess();
  assert.equal(access.may("Nota.md", "delete"), false);
  assert.equal(access.may("Pasta", "delete"), false);
  // A move and an edit stay the editor's: the notice says why, as the server's window does.
  assert.equal(access.may("Nota.md", "move"), true);
  state("reader");
  assert.equal(access.may("Nota.md", "delete"), false);
  state("owner");
  assert.equal(access.may("Nota.md", "delete"), true);
  assert.equal(access.may("Pasta", "delete"), true);
});

test("the folder's owner is never second-guessed, and the host is not asked", async () => {
  await settle();
  asked.length = 0;
  state("owner");
  access.forgetAccess();
  assert.equal(access.may("Qualquer.md", "edit"), true);
  await settle();
  assert.deepEqual(asked, []);
});

test("the files listed are asked of the host, once, and asked again when access changes", async () => {
  state("reader");
  asked.length = 0;
  heard = { fresh: true, files: [{ path: "Edita.md", access: edit("edit") }] };
  // The window lists its folder: the host has no word of them in the list.
  const was = commands.listEntries;
  assert.equal(typeof was, "function");
  entries = [{ path: "Edita.md" }, { path: "Le.md" }];
  await commands.listEntries("");
  await settle();
  assert.deepEqual(asked, [["Edita.md", "Le.md"]]);
  assert.equal(access.may("Edita.md", "edit"), true);
  // Listed again: no new question.
  await commands.listEntries("");
  await settle();
  assert.equal(asked.length, 1);
  // The server says access changed: the window forgets, the host is asked once more.
  heard = { fresh: true, files: [] };
  access.forgetAccess();
  await settle();
  assert.equal(asked.length, 2);
});
