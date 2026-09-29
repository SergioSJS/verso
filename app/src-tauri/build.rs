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
        "pick_folder",
        "reopen_folder",
        "open_initial",
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
        "copy_full_path",
        "set_embed_origins",
        "set_walk_rules",
        "set_menu_language",
        "reindex",
        "app_info",
        "query_base",
        "new_window",
        "cli_status",
        "install_cli",
        "uninstall_cli",
        "mcp_status",
        "mcp_add_claude",
        "check_for_updates",
        "download_and_install_update",
        "restart_app",
    ]);
    commit();
    if let Err(e) = tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)) {
        eprintln!("tauri-build: {e:#}");
        std::process::exit(1);
    }
}

/// The commit `app_info` and the About panel name (ADR 0051):
/// `VERSO_COMMIT` when the build is given one, else git's short hash of
/// HEAD, else "unknown". The same step as the command line's
/// (`crates/verso-cli/build.rs`).
fn commit() {
    let commit = std::env::var("VERSO_COMMIT")
        .ok()
        .filter(|c| !c.is_empty())
        .or_else(|| git(&["rev-parse", "--short=7", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=VERSO_COMMIT={commit}");
    println!("cargo:rerun-if-env-changed=VERSO_COMMIT");
    // Built again when HEAD moves: this checkout's HEAD, and the branches
    // in the shared refs (a worktree keeps its HEAD apart; a packed ref has
    // no file of its own, and a path that may be absent would make Cargo
    // run this on every build).
    if let Some(dir) = git(&["rev-parse", "--absolute-git-dir"]) {
        println!("cargo:rerun-if-changed={dir}/HEAD");
    }
    if let Some(common) = git(&["rev-parse", "--path-format=absolute", "--git-common-dir"]) {
        println!("cargo:rerun-if-changed={common}/refs/heads");
    }
}

/// A git command's output, trimmed; `None` when git is missing or fails.
fn git(args: &[&str]) -> Option<String> {
    let out = std::process::Command::new("git").args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8(out.stdout).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}
