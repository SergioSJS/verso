// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's commands that take arguments they never read (moved out of
// `core.ts`, which had reached ADR 0067's 1 500 lines).

/** Arguments a handler takes and has no use for: windows, web views, the
 *  menu and the system are the host's, and do nothing in a browser. Named,
 *  so that `e2e/harness.spec.mjs` tells them from an argument the core
 *  renamed, which a handler would read as `undefined`. */
export const UNUSED_ARGS: Record<string, string[]> = {
  // The server's: refused here whatever they carry.
  collab_join: ["path"],
  collab_update: ["path", "update"],
  collab_awareness: ["path", "update"],
  collab_leave: ["path"],
  collab_save: ["path"],
  collab_resolve: ["path", "keep"],
  collab_present: ["path"],
  collab_canvas: ["path", "at", "json"],
  collab_roll: ["path", "notation", "source"],
  server_sign_in: ["url"],
  server_sign_out: ["url"],
  server_folders: ["url"],
  server_open: ["url", "folder"],
  // Sharing is a server's (ADR 0081): a folder of the harness is not on
  // one; a test stands in for the server by replacing these.
  share_grant: ["path", "email", "role"],
  share_revoke: ["path", "account"],
  share_attachments: ["path", "attachments"],
  // A fresh proof to the window's server (ADR 0083 item 6).
  server_prove: ["password"],
  reopen_folder: ["key"],
  open_window: ["path"],
  return_to_main: ["path"],
  open_url: ["url"],
  fetch_file: ["path"],
  web_open: ["x", "y", "w", "h"],
  web_bounds: ["label", "x", "y", "w", "h"],
  web_visible: ["label", "visible"],
  web_nav: ["action"],
  reveal: ["path"],
  copy_full_path: ["path"],
  set_embed_origins: ["origins"],
  set_walk_rules: ["builtinIgnores", "gitignore"],
  set_menu_language: ["language"],
  install_cli: ["replace"],
  new_window: ["sameFolder"],
};
