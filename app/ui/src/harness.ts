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
import type { Capabilities } from "./bindings";
import { Core, type Seed } from "./harness/core";
import { UNUSED_ARGS } from "./harness/unusedArgs";
import { Rooms } from "./harness/room";
import * as sanitize from "./sanitize";

const vault = new URLSearchParams(location.search).get("vault");
const big = (): Seed[] =>
  Array.from({ length: 37 * 136 }, (_, i) => ({
    path: `pasta-${String(i % 37).padStart(2, "0")}/nota-${i}.md`,
    b64: btoa(`# Nota ${i}\n`),
  }));
const core =
  vault === "empty"
    ? new Core([], "pasta-vazia")
    : vault === "big"
      ? new Core(big(), "pasta-grande")
      : new Core(DEMO_VAULT_FILES, "demo-vault");

// The side the window talks to (ADR 0076 item 11): the desktop app by
// default; `?side=server` stands for a browser served by `verso serve`,
// with `&role=reader` for a person who only reads the folder. The role can
// change while the window is open (`setRole`), as the server says it does.
const params = new URLSearchParams(location.search);
const onServer = params.get("side") === "server";
let role = params.get("role") ?? "owner";
const serverCan = (): Capabilities => ({ host: "server", can: role === "reader" ? ["account", "collab"] : ["write", "account", "collab"], latency_ms: null });
if (onServer) {
  // No room for simultaneous editing in the harness: the server's `collab`
  // is left out, so a note opens as the desktop's does.
  core.handlers["capabilities"] = () => ({ ...serverCan(), can: serverCan().can.filter((c) => c !== "collab") });
  document.documentElement.dataset["host"] = "server";
  document.documentElement.dataset["role"] = role;
}

// A folder of this computer that syncs with a server where the person only
// reads (ADR 0079 item 1), from the start: `?sync=reader`. The window asks
// `folder_sync` as it opens, as the app's does; a test that changes the
// state later says it with `sync-status`.
if (params.get("sync") === "reader") {
  core.sync = { ...Core.syncOff(), on: true, server: "https://notas.casa", folder: "f1", folder_name: "Campanha", role: "reader", state: "synced", last: "2026-10-12T12:00:00Z" };
}

// A synced folder's live notes (ADR 0082): the server's room, played here
// when a test says the sync's link is up.
const rooms = onServer ? null : new Rooms(core);

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

// A file of the folder, as the `verso:` protocol serves it: the harness's
// server answers `/__vault/<path>` from the demo vault on disk, and a test
// answers it from the folder in memory (e2e/fixtures.mjs).
const internals = (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string, protocol?: string) => string } }).__TAURI_INTERNALS__;
internals.convertFileSrc = (path: string) => `/__vault/${path.split("/").map(encodeURIComponent).join("/")}`;

// What the tests read and do: the folder, the commands asked for, the
// app's log, an event from the host. `__VERSO_TEST__` asks the window for
// the board's scene (board/view.tsx); the app never sets it.
const harness = {
  ready: false,
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
  /** The window's own sanitizer — the instance main.ts configures, not a
   *  copy — for the hostile-HTML suite run in the browsers
   *  (e2e/sanitize.spec.mjs, ADR 0083 item 16). */
  sanitize,
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
