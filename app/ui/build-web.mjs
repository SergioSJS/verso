// The files "this app is a server" gives a phone's browser (ADR 0096,
// item 5 of its Status, decided 2026-10-15): `dist/` without its source
// maps, which only a developer's inspector reads and which were half of
// the installed app's `ui-web` (about 107 MB, 57 of them maps). Tauri's
// `bundle.resources` takes this folder in place of `dist/`
// (`src-tauri/tauri.conf.json`); the desktop window keeps embedding `dist/`
// whole, and the server image does the same trim (`*.map`) on its own.
// Run last by "build".
//   node build-web.mjs

import { cpSync, rmSync } from "node:fs";

const ui = new URL(".", import.meta.url);
const from = new URL("dist/", ui);
const to = new URL("dist-web/", ui);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith(".map") });
