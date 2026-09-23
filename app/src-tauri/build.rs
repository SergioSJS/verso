// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Tauri's build step, with an app manifest: every command below gets an
//! `allow-…` permission, and `capabilities/default.json` grants them to
//! the app's own views only. Without a manifest, Tauri lets any local
//! document in any web view call every command of the app (review
//! `docs/review/phase-2.md`, B3). A command missing here is refused at
//! run time — the list fails closed, and the IPC test catches it.

fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "open_folder",
        "list_notes",
        "read_note",
        "search",
        "links",
        "backlinks",
        "write_note",
        "create_note",
        "create_file",
        "create_folder",
        "delete_note",
        "rename_note",
        "resolve_attachment",
        "list_files",
        "list_folders",
        "list_tags",
        "read_file_text",
        "list_entries",
        "list_web_notes",
        "graph",
        "initial_folder",
        "current_folder",
        "open_window",
        "popout_target",
        "return_to_main",
        "open_url",
        "web_open",
        "web_bounds",
        "web_visible",
        "web_close",
        "web_nav",
        "web_url",
        "read_text",
        "write_text",
        "rename_entry",
        "delete_entry",
        "reveal",
        "reindex",
    ]);
    if let Err(e) = tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)) {
        eprintln!("tauri-build: {e:#}");
        std::process::exit(1);
    }
}
