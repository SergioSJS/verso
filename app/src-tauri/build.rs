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
        "unlinked_mentions",
        "write_note",
        "create_note",
        "create_file",
        "pick_files",
        "create_picked",
        "take_dropped",
        "create_folder",
        "delete_note",
        "rename_note",
        "resolve_attachment",
        "list_files",
        "list_folders",
        "list_tags",
        "read_file_text",
        "list_entries",
        "list_block_ids",
        "list_web_notes",
        "graph",
        "graph_unresolved",
        "current_folder",
        "loose_files",
        "loose_close",
        "open_folder_of_file",
        "open_sibling",
        "loose_save_again",
        "loose_save_copy",
        "pick_file",
        "recent_files",
        "open_recent_file",
        "open_default_apps",
        "open_window",
        "popout_target",
        "return_to_main",
        "open_url",
        "open_devtools",
        "fetch_file",
        "placeholder_plan",
        "web_open",
        "web_bounds",
        "web_visible",
        "web_snapshot",
        "web_close",
        "web_nav",
        "web_url",
        "embed_frameable",
        "read_text",
        "write_text",
        "write_board",
        "board_text",
        "board_preview",
        "render_markdown",
        "project_secrets",
        "project_board",
        "map_open",
        "map_tile",
        "rename_entry",
        "move_entries",
        "notes_of_type",
        "delete_entry",
        "reveal",
        "copy_full_path",
        "set_embed_origins",
        "set_walk_rules",
        "set_folder_note_name",
        "get_focuses",
        "fetch_focuses_file",
        "set_focuses",
        "can_sync_focuses",
        "set_sync_focuses",
        "get_folder_settings",
        "set_folder_settings",
        "get_obsidian_periodic",
        "list_folder_data",
        "read_folder_data",
        "write_folder_data",
        "remove_folder_data",
        "log_write",
        "log_read",
        "set_menu_language",
        "set_menu_commands",
        "set_bars_dark",
        "take_shared",
        "set_background_sync",
        "shared_storage",
        "shared_storage_access",
        "open_shared_folder",
        "folder_in_app",
        "set_menu_enabled",
        "menu_sections",
        "quit_app",
        "reindex",
        "capabilities",
        "folder_space",
        "trash_list",
        "trash_restore",
        "trash_delete",
        "trash_empty",
        "trash_set_days",
        "history_list",
        "history_read",
        "history_restore",
        "history_copy",
        "history_delete",
        "set_history_days",
        // The embedded terminal (ADR 0115).
        "terminal_open",
        "terminal_attach",
        "terminal_write",
        "terminal_resize",
        "terminal_flow",
        "terminal_busy",
        "terminal_close",
        "set_terminal_enabled",
        "terminal_detect",
        "terminal_install_page",
        "collab_join",
        "collab_update",
        "collab_awareness",
        "collab_leave",
        "collab_save",
        "collab_resolve",
        "collab_present",
        "collab_canvas",
        "collab_roll",
        "collab_oracle",
        "table_join",
        "table_leave",
        "table_look",
        "table_history",
        "table_say",
        "table_send_image",
        "table_attach",
        "table_roll",
        "table_pin",
        "table_delete",
        "table_clear",
        "table_play",
        "table_sound",
        "table_time",
        "table_cannot_play",
        "table_share_start",
        "table_share_stop",
        "table_share_listen",
        "audio_sources_list",
        "audio_share_start",
        "audio_share_stop",
        "audio_share_own_begin",
        "audio_share_own_pcm",
        "audio_share_own_end",
        "audio_share_hear",
        "campaign_status",
        "campaign_make",
        "campaign_unmake",
        "campaign_settings",
        "campaign_release",
        "campaign_release_all",
        "campaign_audience",
        "campaign_access",
        "campaign_secret_name",
        "campaign_grant",
        "campaign_invite",
        "access_get",
        "access_set",
        "table_rights_set",
        "server_sign_in",
        "server_sign_in_page",
        "server_accounts",
        "server_sign_out",
        "device_name",
        "set_device_name",
        "server_folders",
        "server_create_folder",
        "server_open",
        "server_retry",
        "window_server",
        "discover_servers_start",
        "discover_servers_list",
        "discover_servers_stop",
        "share_list",
        "share_grant",
        "share_invite",
        "share_revoke",
        "share_attachments",
        "read_link_list",
        "read_link_secrets",
        "read_link_create",
        "read_link_revoke",
        "server_prove",
        "recent_folders",
        "local_server_status",
        "local_server_folders",
        "local_server_tick",
        "local_server_subfolders",
        "local_server_parts",
        "local_server_whole",
        "local_server_settings",
        "local_server_start",
        "local_server_stop",
        "local_server_pair_open",
        "local_server_pair_close",
        "local_server_pair_state",
        "local_server_answer",
        "local_server_phones",
        "local_server_phone_role",
        "local_server_revoke",
        "local_server_forget",
        "local_server_replace_identity",
        "local_server_audit",
        "local_server_sit_at_table",
        "local_server_table_host",
        "local_server_move_table",
        "local_server_network",
        "local_server_link_on",
        "local_server_link_off",
        "local_server_link_extend",
        "local_server_link_mode",
        "local_server_owner_name",
        "local_server_own_address_login",
        "local_server_own_address_set_up",
        "local_server_own_address_remove",
        "local_server_invitations",
        "local_server_invitation_revoke",
        "local_server_devices",
        "local_server_end_device",
        "local_server_read_links",
        "local_server_accounts",
        "local_server_account_reset",
        "local_server_account_end_sessions",
        "local_server_account_remove",
        "folder_sync",
        "folder_sync_start",
        "folder_sync_stop",
        "folder_sync_pause",
        "folder_sync_confirm",
        "folder_sync_now",
        "sync_rights",
        "folder_sync_cloud_check",
        "folder_sync_cloud_start",
        "folder_sync_cloud_cancel",
        "note_made_from_template",
        "app_info",
        "query_base",
        "new_window",
        "cli_status",
        "install_cli",
        "uninstall_cli",
        "mcp_status",
        "mcp_add_claude",
        "agent_visible",
        "set_agent_visible",
        "open_claude_download",
        "check_for_updates",
        "download_and_install_update",
        "restart_app",
    ]);
    commit();
    let mut attributes = tauri_build::Attributes::new().app_manifest(manifest);
    if windows_msvc() {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        embed_windows_manifest();
    }
    if let Err(e) = tauri_build::try_build(attributes) {
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
    // A commit on the checked-out branch rewrites the branch's own ref (a
    // file under refs/heads, or a line of packed-refs once the refs were
    // packed), never HEAD, and a directory's scan misses the packed form —
    // a beta reported the build before's hash on 2026-10-12. Git appends
    // to the logs of HEAD and of the branch at every move, whatever form
    // the ref is kept in: those are watched, each only when git says it
    // exists (`git reflog exists`), never by a stat of our own.
    let branch = git(&["rev-parse", "--symbolic-full-name", "HEAD"]);
    for name in std::iter::once("HEAD").chain(branch.as_deref()) {
        if git_ok(&["reflog", "exists", name]) {
            let log = format!("logs/{name}");
            if let Some(path) = git(&["rev-parse", "--path-format=absolute", "--git-path", &log]) {
                println!("cargo:rerun-if-changed={path}");
            }
        }
    }
    // iOS links the static library into the Xcode project's binary; the
    // shared library (Android's `cdylib`, built for every target) cannot
    // link alone there: the Swift halves of Tauri's plugins
    // (`init_plugin_*`, `log_stdout`) are the Xcode binary's. Left to be
    // found when loaded — it never is: no one loads it on iOS — so a
    // release archive builds (ADR 0119 Phase 0, the device).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        println!("cargo:rustc-cdylib-link-arg=-Wl,-undefined,dynamic_lookup");
    }
}

/// Whether the build is for Windows with Microsoft's linker.
fn windows_msvc() -> bool {
    std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
}

/// Windows: the application manifest (Common Controls 6, which Tauri's
/// dialogs call into) goes into every binary the linker makes for this
/// package — the app and its test harness alike. tauri-build alone puts it
/// in the app, and `cargo test` then dies at start with
/// `STATUS_ENTRYPOINT_NOT_FOUND` (ADR 0069; Tauri's own repository does
/// the same). `windows-app-manifest.xml` is tauri-build 2.6.3's, as is.
fn embed_windows_manifest() {
    let dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let manifest = std::path::Path::new(&dir).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed=windows-app-manifest.xml");
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}

/// Whether a git command succeeds (an answer with no output, such as
/// `git reflog exists`); false when git is missing or says no.
fn git_ok(args: &[&str]) -> bool {
    std::process::Command::new("git")
        .args(args)
        .output()
        .is_ok_and(|out| out.status.success())
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
