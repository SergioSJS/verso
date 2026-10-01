// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The browser harness (ADR 0058): the window as the app runs it, in a plain
// browser, with the Rust core answered by `harness/core.ts` from a folder
// held in memory — the demo vault, or an empty folder with `?vault=empty`.
// `npm run build` writes it beside the app as `dist/harness.html` (the
// app's own page, this script in place of main.js); `npm run e2e` serves it
// (`e2e/serve.mjs`) and drives it with Playwright (`e2e/*.spec.mjs`). The
// app never opens it.

import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { DEMO_VAULT_FILES } from "./demoVault";
import { Core } from "./harness/core";

const empty = new URLSearchParams(location.search).get("vault") === "empty";
const core = new Core(empty ? [] : DEMO_VAULT_FILES, empty ? "pasta-vazia" : "demo-vault");

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
  writeOutside: (path: string, text: string) => core.writeOutside(path, text),
  emit: (event: string, payload: unknown) => emit(event, payload),
};
Object.assign(window as unknown as Record<string, unknown>, { __harness: harness, __VERSO_TEST__: {} });

void import("./main").then(() => {
  harness.ready = true;
});
