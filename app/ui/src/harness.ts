// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The browser harness (ADR 0058): the window as the app runs it, in a plain
// browser, with the Rust core answered by `harness/core.ts` from a folder
// held in memory — the demo vault, an empty folder with `?vault=empty`, or
// a big synthetic one with `?vault=big` (37 folders of 136 notes, as the
// benchmark's shape), for what the window must keep cheap on 5,000 notes.
// `e2e/build.mjs` builds it into `e2e/.site/` beside a copy of the window's
// build, as `harness.html` (the app's own page, this script in place of
// main.js), never into `dist/`, which the app packages; `npm run e2e` serves
// it (`e2e/serve.mjs`) and drives it with Playwright (`e2e/*.spec.mjs`).

import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { DEMO_VAULT_FILES } from "./demoVault";
import type { Capabilities, LooseFileInfo, Mentions, Opened, PickedFiles } from "./bindings";
import { FOLDER_CAN } from "./can";
import { Core, type Seed } from "./harness/core";
import { UNUSED_ARGS } from "./harness/unusedArgs";
import { Rooms } from "./harness/room";
import { Table } from "./harness/table";
import { Campaign } from "./harness/campaign";
import { projectBoard } from "./harness/maps";
import { Versions } from "./harness/history";
import { SystemNotifications } from "./harness/notifications";
import { FakeTerminals } from "./harness/terminal";
import * as sanitize from "./sanitize";

const vault = new URLSearchParams(location.search).get("vault");
const big = (): Seed[] =>
  Array.from({ length: 37 * 136 }, (_, i) => ({
    path: `pasta-${String(i % 37).padStart(2, "0")}/nota-${i}.md`,
    b64: btoa(`# Nota ${i}\n`),
  }));
// A `.md` opened without its folder (`?loose=1`, ADR 0114): the file, a
// sibling note and a picture, as a Downloads folder holds them.
const looseSeed = (): Seed[] => [
  { path: "Lista de compras.md", b64: btoa("# Lista de compras\n\n- arroz\n- feijao\n\n![[foto.png]]\n\nVer [[Vizinha]] e [[Longe]].\n") },
  { path: "Vizinha.md", b64: btoa("# Vizinha\n\nA nota ao lado.\n") },
  { path: "foto.png", b64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" },
];
const core =
  vault === "empty"
    ? new Core([], "pasta-vazia")
    : vault === "big"
      ? new Core(big(), "pasta-grande")
      : new URLSearchParams(location.search).get("loose") === "1"
        ? new Core(looseSeed(), "Downloads")
        : new Core(DEMO_VAULT_FILES, "demo-vault");

// The side the window talks to (ADR 0076 item 11): the desktop app by
// default; `?side=server` stands for a browser served by `verso serve`,
// with `&role=reader` for a person who only reads the folder. The role can
// change while the window is open (`setRole`), as the server says it does.
const params = new URLSearchParams(location.search);
const onServer = params.get("side") === "server";
let role = params.get("role") ?? "owner";
// A server serves folders, never one file: the folder set is always there (ADR 0114 item 19).
const serverCan = (): Capabilities => ({ host: "server", can: role === "reader" ? ["account", "collab", ...FOLDER_CAN] : ["write", "account", "collab", ...FOLDER_CAN], latency_ms: null });
if (onServer) {
  // No room for simultaneous editing in the harness: the server's `collab`
  // is left out, so a note opens as the desktop's does.
  core.handlers["capabilities"] = () => ({ ...serverCan(), can: serverCan().can.filter((c) => c !== "collab") });
  // A reader's answer holds no mention inside a secret block, as the
  // server's (ADR 0089 item 1, ADR 0087).
  const mentions = core.handlers["unlinked_mentions"];
  core.handlers["unlinked_mentions"] = (a) => {
    const all = mentions?.(a) as Mentions;
    return role === "reader" ? { ...all, mentions: all.mentions.filter((m) => !m.secret) } : all;
  };
  // A reader's board is the core's projection of it: without its secret
  // pins (ADR 0090 item 5).
  for (const command of ["read_text", "read_file_text"]) {
    const read = core.handlers[command];
    core.handlers[command] = (a) => {
      const text = read?.(a);
      if (role !== "reader" || !/\.canvas$/i.test(String(a["path"]))) return text;
      return typeof text === "string" ? projectBoard(text) : { ...(text as { text: string }), text: projectBoard((text as { text: string }).text) };
    };
  }
  document.documentElement.dataset["host"] = "server";
  document.documentElement.dataset["role"] = role;
}

// The embedded terminal (ADR 0115): a scripted shell for a window of the
// desktop app; a server and its web window have none (items 6 and 23), and
// refuse its commands as a side without them does.
const terminals = new FakeTerminals(core.handlers);
const TERMINAL_COMMANDS = ["terminal_open", "terminal_attach", "terminal_write", "terminal_resize", "terminal_flow", "terminal_busy", "terminal_close", "set_terminal_enabled", "terminal_detect", "terminal_install_page"];
if (onServer)
  for (const cmd of TERMINAL_COMMANDS) {
    const own = core.handlers[cmd]!;
    core.handlers[cmd] = Object.assign(() => refuseHere("a server runs no program"), { wraps: own });
  }
function refuseHere(message: string): never {
  throw { kind: "refused", message };
}

// A Markdown file opened without its folder (ADR 0114): `?loose=1` stands
// for the loose-files window the host makes when a `.md` is double-clicked.
// The folder in memory holds the file, a sibling note and a picture; the
// window is told `Opened::File`, reads and writes the file by its name,
// resolves a link by one sibling's name, and every folder command is
// refused as the service refuses it. `&ro=permissions|too_large` opens it
// read only for that reason; `&known=1` says a folder opened before holds it.
if (params.get("loose") === "1") {
  const name = "Lista de compras.md";
  const info = (): LooseFileInfo => ({
    name,
    key: "lista-de-compras-0123456789abcdef",
    place: "Downloads",
    read_only: params.get("ro") === "permissions" ? "permissions" : params.get("ro") === "too_large" ? "too_large" : null,
    size: 160,
    known_folder: params.get("known") === "1" ? "Notas" : null,
  });
  let handed = true;
  core.handlers["open_initial"] = (): Opened | null => {
    if (!handed) return null;
    handed = false;
    return { kind: "file", info: info() };
  };
  core.handlers["current_folder"] = () => null;
  core.handlers["loose_files"] = () => (handed ? [] : [info()]);
  core.handlers["capabilities"] = (): Capabilities => ({ host: "desktop", can: ["write", "windows", "web_views", "agents", "updates", "devtools", "local_folders"], latency_ms: null });
  core.handlers["backlinks"] = () => [];
  core.handlers["open_sibling"] = (a) => {
    const target = String(a["target"]).replace(/\.md$/, "");
    if (target !== "Vizinha") throw { kind: "not_found", message: "no such note beside this file" };
    return { ...info(), name: "Vizinha.md", key: "vizinha-0123456789abcdef", read_only: null, known_folder: null };
  };
  core.handlers["loose_save_again"] = (a) => {
    const w = core.handlers["create_note"]!({ name: a["name"], text: a["text"] });
    return { note: w, warnings: [] };
  };
  core.handlers["open_folder_of_file"] = (a) => {
    (window as unknown as { __harnessOpenedFolder?: unknown }).__harnessOpenedFolder = a;
    return null;
  };
  const refusedHere = ["list_notes", "search", "list_entries", "list_files", "list_folders", "list_tags", "create_note", "create_folder", "create_file", "rename_entry", "move_entries", "delete_entry", "delete_note", "graph", "graph_unresolved", "list_block_ids", "list_web_notes", "unlinked_mentions", "reindex", "notes_of_type"];
  for (const cmd of refusedHere) core.handlers[cmd] = () => { throw { kind: "refused", message: "not available for a file opened without its folder" }; };
}

// A folder of this computer that syncs with a server where the person only
// reads (ADR 0079 item 1), from the start: `?sync=reader`. The window asks
// `folder_sync` as it opens, as the app's does; a test that changes the
// state later says it with `sync-status`.
if (params.get("sync") === "reader") {
  core.sync = { ...Core.syncOff(), on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "reader", state: "synced", last: "2026-10-12T12:00:00Z" };
}

// A server that cannot be reached (the maintainer, 2026-10-14): while a
// test says so (`serverDown("localhost:7351")`), every command that goes to
// a server answers as the app's host does when no connection is made —
// the contract's `unreachable`, carrying the address — whatever the test
// set its handler to; `serverDown(null)` brings it back. `?server=down`
// starts with it down at localhost:7351.
const TO_A_SERVER = new Set(["server_folders", "server_create_folder", "server_open", "server_sign_in", "folder_sync_start", "share_list", "share_grant", "share_revoke", "share_attachments", "read_link_list", "read_link_secrets", "read_link_create", "read_link_revoke", "server_prove"]);
let serverDown: string | null = params.get("server") === "down" ? "localhost:7351" : null;
const answer = core.invoke.bind(core);
// The system's notifications (ADR 0084 item 9): the plugin's calls,
// answered as the desktop's host answers them.
const notifications = new SystemNotifications();
core.invoke = (cmd: string, args: unknown): unknown => {
  if (cmd.startsWith("plugin:notification|")) {
    core.calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
    return notifications.handle(cmd, (args ?? {}) as Record<string, unknown>);
  }
  // The webview's zoom (ADR 0072): the host sets it; here the call is kept.
  if (cmd === "plugin:webview|set_webview_zoom") {
    core.calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
    return null;
  }
  if (serverDown === null || !TO_A_SERVER.has(cmd)) return answer(cmd, args);
  core.calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
  throw { kind: "unreachable", message: serverDown };
};

// A synced folder's live notes (ADR 0082): the server's room, played here
// when a test says the sync's link is up.
const rooms = onServer ? null : new Rooms(core);
// The folder's table (ADR 0107): a server's, played here when a test says it
// is up; it wraps the room's rolls, so it comes after the rooms.
const table = onServer ? null : new Table(core);
// A window on a server joins the table when a folder is shown; this harness does
// not play that table, and answers as a side with none does.
if (onServer)
  for (const cmd of ["table_join", "table_leave", "table_look", "table_history", "table_say", "table_send_image", "table_roll", "table_pin", "table_delete", "table_clear"])
    core.handlers[cmd] = () => {
      throw { kind: "refused", message: "the table is not played in this harness" };
    };
// A table is a campaign folder (ADR 0110): the server's commands, played
// here when a test says it is up; `?table=owner` and `?table=player` start
// with it up, for the game master and for a player.
const campaign = new Campaign(core);
// A synced folder's table and campaign are the server's while the sync's
// link is up (ADR 0107 item 9): reached over the link the rooms play, and
// unavailable with it down, as the host answers; the status says "none".
const link = (): boolean | null => (core.sync.on && rooms ? rooms.up : null);
if (table) table.linked = link;
// The folder's tables are the campaign's (one log per table, ADR 0107 as amended 2026-10-23).
if (table) table.roots = () => (campaign.up ? campaign.tables.map((t) => t.root) : []);
if (table) table.mayImage = (root) => campaign.up && campaign.viewer === "player" && campaign.rightFor(root, "images");
if (table) table.mayFile = (root) => campaign.up && campaign.viewer === "player" && campaign.rightFor(root, "files");
campaign.linked = link;
for (const cmd of ["table_join", "table_leave", "table_look", "table_history", "table_say", "table_send_image", "table_roll", "table_pin", "table_delete", "table_clear", "campaign_status", "campaign_make", "campaign_unmake", "campaign_settings", "campaign_release", "campaign_release_all", "campaign_secret_name", "campaign_grant", "campaign_invite", "access_get", "access_set", "table_rights_set"]) {
  const own = core.handlers[cmd];
  if (!own) continue;
  const linked = (a: Parameters<typeof own>[0]) => {
    if (link() === false) {
      if (cmd === "campaign_status") return { viewer: "none", tables: [], notes: [], players: [], can_invite: false };
      if (cmd === "table_leave") return null;
      throw { kind: "unavailable", message: "the folder's sync is not connected: the table is the server's" };
    }
    return own(a);
  };
  // The handler it wraps, whose source names the arguments it reads
  // (e2e/harness.spec.mjs).
  core.handlers[cmd] = Object.assign(linked, { wraps: own });
}
// The owner of a synced folder reaches the server's shares while its link is
// up: the game master's rows of the menu are the owner's (ADR 0081).
const sharesOwn = core.handlers["share_list"]!;
core.handlers["share_list"] = (a) => (core.sync.on && core.sync.role === "owner" && rooms?.up ? [{ id: null, path: "", people: [], attachments: null, missing: false }] : sharesOwn(a));
const tableParam = params.get("table");
if (tableParam === "owner" || tableParam === "player") {
  campaign.up = true;
  campaign.viewer = tableParam;
}
// A player at a closed table (`?closed=1`): no folder is open at the start and
// every way to open one is refused as the server refuses it, until a test says
// the game master opened the table (`__harness.shutOut = false`).
if (params.get("closed") === "1") {
  const win = window as unknown as { __harness: Record<string, unknown> };
  let shut = true;
  Object.defineProperty(win, "__harnessShutOut", { get: () => shut, set: (v: boolean) => (shut = v) });
  const opens = ["pick_folder", "reopen_folder", "open_initial"];
  const was = opens.map((c) => core.handlers[c]!);
  opens.forEach((c, i) => {
    core.handlers[c] = (a) => {
      if (shut) throw { kind: "refused", message: "a mesa está fechada" };
      return was[i]!(a);
    };
  });
  core.handlers["current_folder"] = () => (shut ? null : was[0]!({}));
  void win;
}
// The owner of a server's folder is told so by the shares' list (ADR 0081):
// the game master's rows of the menu are the owner's.
if (tableParam === "owner") core.handlers["share_list"] = () => [{ id: null, path: "", people: [], attachments: null, missing: false }];
// A file's version history (ADR 0091): none for a reader on a server.
const versions = new Versions(core, rooms, () => !onServer || role !== "reader");

mockWindows("main");
// Answered in a task of its own, as the app's IPC answers: never within the
// event that asked (an Enter that confirms a name must not also press the
// button of the plan its answer opens).
mockIPC(
  (cmd, args) =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(core.invoke(cmd, args));
        } catch (e) {
          reject(e);
        }
      }, 0),
    ),
  { shouldMockEvents: true },
);

// The page's `Notification`, as the plugin's script makes it in the app.
notifications.install((cmd, args) => (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__.invoke(cmd, args));

// A file of the folder, as the `verso:` protocol serves it: the harness's
// server answers `/__vault/<path>` from the demo vault on disk, and a test
// answers it from the folder in memory (e2e/fixtures.mjs).
const internals = (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string, protocol?: string) => string } }).__TAURI_INTERNALS__;
internals.convertFileSrc = (path: string) => `/__vault/${path.split("/").map(encodeURIComponent).join("/")}`;

// What the tests read and do: the folder, the commands asked for, the
// app's log, an event from the host. `__VERSO_TEST__` asks the window for
// the board's scene (board/view.tsx); the app never sets it.
// "Import files…" (A11Y.10): the system's file picker is the host's; a test
// says what the person chose with `pickNext` and the next `pick_files`
// answers it (then the picker is "cancelled" again).
const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
let nextPick: PickedFiles = { files: [], skipped: [] };
core.handlers["pick_files"] = (a) => {
  const now = nextPick;
  nextPick = { files: [], skipped: [] };
  // As the host does: a file past the limit asked is named, not given.
  const max = Number(a["maxMb"]) * 1024 * 1024;
  const sizeOf = (f: PickedFiles["files"][number]) => (f.token ? (held.get(f.token) ?? "").length : atob(f.base64 ?? "").length);
  const files = now.files.filter((f) => sizeOf(f) <= max);
  const skipped = [...now.skipped, ...now.files.filter((f) => sizeOf(f) > max).map((f) => ({ name: f.name, reason: "too_large" as const }))];
  return { files, skipped };
};

// Files dropped from the file manager: the host took the paths, the window
// asks for them (`take_dropped`) and gets what a picker would have.
// As the host does (files.rs `take_dropped`): for the tree (`asBytes` false)
// each file is held under a token up to the limit set (`maxMb`); for a note
// or a board (`asBytes` true) it comes as its bytes, bounded at 32 MiB.
core.handlers["take_dropped"] = (a) => {
  const now = nextPick;
  nextPick = { files: [], skipped: [] };
  const asBytes = a["asBytes"] === true;
  const max = (asBytes ? 32 : Number(a["maxMb"])) * 1024 * 1024;
  const files: PickedFiles["files"] = [];
  const skipped = [...now.skipped];
  for (const f of now.files) {
    const text = f.token ? (held.get(f.token) ?? "") : atob(f.base64 ?? "");
    if (text.length > max) {
      skipped.push({ name: f.name, reason: "too_large" as const });
      continue;
    }
    if (asBytes) files.push({ name: f.name, base64: f.base64 ?? toBase64(text), token: null });
    else {
      const token = f.token ?? `pick-${files.length}-${f.name}`;
      held.set(token, text);
      files.push({ name: f.name, base64: null, token });
    }
  }
  return { files, skipped };
};

// A file chosen "on this computer's own folder" is held by the host under a
// token and copied by `create_picked`: the text of each, by token.
const held = new Map<string, string>();
core.handlers["create_picked"] = (a) => {
  const token = String(a["token"]);
  const text = held.get(token);
  if (text === undefined) throw { kind: "refused", message: "that file was not chosen by this window, or was already copied" };
  const path = core.handlers["create_file"]?.({ path: a["path"], base64: toBase64(text ?? "") });
  held.delete(token);
  return path;
};

const harness = {
  ready: false,
  /** A command of the window, answered as the side answers it (a test
   *  asks what a stale command gets). */
  invoke: (cmd: string, args: unknown): Promise<unknown> => Promise.resolve().then(() => core.invoke(cmd, args)),
  /** What the next `pick_files` gives: files by name and text. */
  pickNext: (files: { name: string; text: string }[], skipped: PickedFiles["skipped"] = [], byToken = false) => {
    nextPick = {
      files: files.map((f, i) => {
        if (!byToken) return { name: f.name, base64: toBase64(f.text), token: null };
        const token = `pick-${i}-${f.name}`;
        held.set(token, f.text);
        return { name: f.name, base64: null, token };
      }),
      skipped,
    };
  },
  core,
  read: (path: string) => core.read(path),
  bytes: (path: string) => core.bytes(path),
  files: () => [...core.files.keys()].sort(),
  folders: () => [...core.folders].sort(),
  calls: core.calls,
  log: core.log,
  commands: Object.keys(core.handlers),
  unusedArgs: UNUSED_ARGS,
  writeOutside: (path: string, text: string) => core.writeOutside(path, text),
  removeOutside: (path: string) => core.removeOutside(path),
  emit: (event: string, payload: unknown) => emit(event, payload),
  /** The server's room of a synced folder's notes (ADR 0082). */
  rooms,
  /** The folder's table (ADR 0107): the server's commands and events, played in the page. */
  table,
  /** A table is a campaign folder (ADR 0110): the server's state and commands, played in the page. */
  campaign,
  /** The files' version histories (ADR 0091). */
  versions,
  /** The window's own sanitizer — the instance main.ts configures, not a
   *  copy — for the hostile-HTML suite run in the browsers
   *  (e2e/sanitize.spec.mjs, ADR 0083 item 16). */
  sanitize,
  /** The servers out of reach at `address`, or back (`null`). */
  serverDown: (address: string | null) => {
    serverDown = address;
  },
  /** The system's notifications: its permission, its answer when asked,
   *  what was sent, a click on the last (ADR 0084 item 9). */
  notifications,
  /** The embedded terminal's scripted shell (ADR 0115). */
  terminals,
  /** The desktop window shows a server's folder where the person is `as`
   *  (the host's merge, app/src-tauri/src/remote.rs): the server's answer
   *  plus the app's own abilities that do not depend on the folder's side.
   *  Only `verso:folder-shown` is heard, as in the app: the window asks again. */
  showServerFolder: (as: string) => {
    role = as;
    core.handlers["capabilities"] = () => ({
      host: "server",
      can: [...(as === "reader" ? [] : ["write"]), "account", "windows", "web_views", "updates", "devtools", "local_folders", "terminal", ...FOLDER_CAN],
      latency_ms: null,
    } as Capabilities);
    // This computer's shell starts in the home directory there (ADR 0115 Q4).
    terminals.local = false;
    dispatchEvent(new Event("verso:folder-shown"));
  },
  /** The server says the person's role in the folder changed (web.ts). */
  setRole: (next: string) => {
    role = next;
    document.documentElement.dataset["role"] = next;
    dispatchEvent(new CustomEvent("verso:role", { detail: next }));
  },
};
Object.assign(window as unknown as Record<string, unknown>, { __harness: harness, __VERSO_TEST__: {} });

// Ready once the window's start is over — the folder shown, its tabs
// back — not when its script has loaded: keys typed before that land
// wherever the start leaves the focus.
void import("./main")
  .then((m) => m.started)
  .then(() => {
    harness.ready = true;
  });
