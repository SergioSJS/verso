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
  collab_roll: ["path", "notation", "source", "styles", "secret", "occurrence"],
  collab_oracle: ["path", "ask"],
  // What a note was made with is desktop sync's (ADR 0093 item 12): the
  // harness's folder syncs with nothing; the call is recorded as any is.
  note_made_from_template: ["path", "text"],
  server_sign_in: ["url"],
  server_sign_out: ["url"],
  server_folders: ["url"],
  server_create_folder: ["url", "name"],
  server_open: ["url", "folder"],
  // Sharing is a server's (ADR 0081): a folder of the harness is not on
  // one; a test stands in for the server by replacing these.
  share_grant: ["path", "email", "role"],
  share_revoke: ["path", "account"],
  share_attachments: ["path", "attachments"],
  // Read links are a server's (ADR 0105): refused here whatever they carry.
  read_link_secrets: ["kind", "path"],
  read_link_create: ["kind", "path", "expiresDays", "expiresAt", "password"],
  read_link_revoke: ["id"],
  // A fresh proof to the window's server (ADR 0083 item 6).
  server_prove: ["password"],
  reopen_folder: ["key"],
  open_window: ["path"],
  return_to_main: ["path"],
  open_url: ["url"],
  web_open: ["place"],
  web_bounds: ["label", "place"],
  web_visible: ["label", "visible"],
  web_nav: ["action"],
  reveal: ["path"],
  copy_full_path: ["path"],
  set_embed_origins: ["origins"],
  set_walk_rules: ["builtinIgnores", "gitignore"],
  set_menu_language: ["language"],
  set_menu_commands: ["features", "keys"],
  set_menu_enabled: ["enabled"],
  install_cli: ["replace"],
  new_window: ["sameFolder"],
  // A file opened without its folder (ADR 0114): a folder's window has no
  // loose file to close, save, open beside or reopen; `?loose=1`
  // (src/harness.ts) answers them with what they carry.
  loose_close: ["name"],
  open_folder_of_file: ["name", "known"],
  open_sibling: ["from", "target"],
  loose_save_again: ["name", "text"],
  loose_save_copy: ["name", "text"],
  open_recent_file: ["index"],
  // The Mac's own-sound route (ADR 0116, decision A2): the harness is no
  // Mac, its begin answers false, so no block is ever sent.
  audio_share_own_pcm: ["block"],
};
