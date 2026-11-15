// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which commands a paired phone may run (ADR 0096 item 12): **default
//! deny, an allowlist in the code**. A phone is a reader or an editor,
//! never an owner or an admin; it runs the commands of a folder it was
//! given and nothing that acts on the laptop outside it.
//!
//! The lists name every command of the contract and of the server's own
//! dispatch. A test reads the generated bindings and fails when a command
//! is on no list — so a command added tomorrow is refused until someone
//! decides about it, here, in a diff a reviewer reads — and when a command
//! is on two lists, or when a command that writes sits on the reader's.

use verso_contract::{ContractError, ErrorKind};

use crate::db::Role;

/// What a phone of a given role may do with a command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Any paired phone.
    Allow,
    /// Only a phone the person let edit.
    Editor,
    /// No phone, whatever its role.
    Refuse,
}

/// Commands any paired phone runs: reading the folders it was given, and
/// the window's own bookkeeping that touches nothing outside them.
/// `set_embed_origins`, `set_menu_language`, `note_made_from_template`,
/// `set_history_days` and `fetch_file` are answered by the server without
/// acting (`rpc.rs`): the window calls them, and refusing them would only
/// make its calls fail.
pub const READ: &[&str] = &[
    "open_server_folder",
    "reopen_folder",
    "pick_folder",
    "open_initial",
    "current_folder",
    "capabilities",
    "app_info",
    "reindex",
    "render_markdown",
    "project_secrets",
    "project_board",
    "board_text",
    "list_notes",
    "read_note",
    "notes_of_type",
    "search",
    "links",
    "backlinks",
    "unlinked_mentions",
    "list_files",
    "list_tags",
    "list_block_ids",
    "list_web_notes",
    "graph",
    "graph_unresolved",
    "list_folders",
    "read_file_text",
    "resolve_attachment",
    "list_entries",
    "read_text",
    "board_preview",
    "map_open",
    "map_tile",
    "query_base",
    "get_focuses",
    "can_sync_focuses",
    "folder_space",
    "get_folder_settings",
    "get_obsidian_periodic",
    "list_folder_data",
    "read_folder_data",
    "collab_join",
    "collab_leave",
    // The table (ADR 0107): a phone is at the table and writes at it; the
    // server checks the folder's role again (an image is a file, so an
    // editor's; clearing is an owner's, which no phone is).
    "table_join",
    "table_leave",
    "table_look",
    "table_history",
    "table_say",
    "table_roll",
    "table_pin",
    "table_delete",
    // The table's music (ADR 0116): a phone listens — the server's clock,
    // and "this phone cannot play that track"; the controls are the game
    // master's, which no phone is.
    "table_time",
    "table_cannot_play",
    // A phone hears the game master's live share (ADR 0116 Q1 a: the
    // desktop shares, the web and the phone listen).
    "table_share_listen",
    "campaign_status",
    "collab_awareness",
    "collab_present",
    "set_embed_origins",
    "set_menu_language",
    "note_made_from_template",
    "set_history_days",
    "fetch_file",
    "fetch_focuses_file",
    "set_walk_rules",
    "set_folder_note_name",
    "log_write",
    "embed_frameable",
];

/// Commands only a phone the person let edit runs: those that change a
/// note, a board, a picture or the bin of a folder it was given. The
/// server checks the folder's role again before the core acts.
pub const EDIT: &[&str] = &[
    "write_note",
    "create_note",
    "create_file",
    "create_folder",
    "delete_note",
    "rename_note",
    "rename_entry",
    "move_entries",
    "delete_entry",
    "write_text",
    "write_board",
    "write_folder_data",
    "remove_folder_data",
    "set_focuses",
    "collab_update",
    "collab_save",
    "collab_resolve",
    "collab_canvas",
    "collab_roll",
    "collab_oracle",
    "table_send_image",
    "table_attach",
    "trash_list",
    "trash_restore",
    "trash_delete",
    "history_list",
    "history_read",
    "history_restore",
    "history_copy",
];

/// Commands no phone runs, however it was paired. Each acts on the laptop
/// outside the folders served, or is the owner's: the system's (open,
/// reveal, copy a path, windows), the updater and the command-line tool,
/// the system's file picker ("Import files…" reads the laptop's disk),
/// the app's settings and the agent's, the log and the bug report, the
/// pairing's own commands, accounts, shares, servers and sync, the MCP,
/// the web-embed proxy and its frameability probe (ADR 0056: a note must
/// not make the laptop fetch an address on the network for a phone), the
/// folder's own settings and rules, emptying the bin, deleting history.
pub const REFUSED: &[&str] = &[
    // ADR 0118 (2026-11-12): the phone host's own commands, about the
    // device the app runs on (its shared storage, what was shared to it,
    // its background sync, its status bar): never a remote phone's.
    "folder_in_app",
    "open_shared_folder",
    "set_background_sync",
    "set_bars_dark",
    "shared_storage",
    "shared_storage_access",
    "take_shared",
    "loose_close",         // ADR 0114: host-side loose-files window of the laptop
    "loose_files",         // ADR 0114: host-side loose-files window of the laptop
    "loose_save_again",    // ADR 0114: writes beside a file of the laptop's disk
    "loose_save_copy",     // ADR 0114: writes to a place of the laptop's disk
    "open_default_apps",   // ADR 0114: opens the laptop's system settings
    "open_folder_of_file", // ADR 0114: opens a folder of the laptop's disk
    "open_recent_file",    // ADR 0114: opens a file of the laptop's disk
    "open_sibling",        // ADR 0114: opens a file of the laptop's disk outside the served folders
    "pick_file",           // ADR 0114: the laptop's file picker
    "recent_files",        // ADR 0114: lists the laptop's recent files
    // ADR 0115 items 6 and 23: a shell of the laptop is never run remotely.
    "set_terminal_enabled",
    "terminal_attach",
    "terminal_busy",
    "terminal_close",
    "terminal_detect",
    "terminal_flow",
    "terminal_install_page",
    "terminal_open",
    "terminal_resize",
    "terminal_write",
    "agent_visible",
    "set_agent_visible",
    "check_for_updates",
    "download_and_install_update",
    "restart_app",
    "install_cli",
    "uninstall_cli",
    "mcp_add_claude",
    "mcp_status",
    "open_claude_download",
    "copy_full_path",
    "pick_files",
    "create_picked",
    "take_dropped",
    "reveal",
    "open_url",
    "open_window",
    "new_window",
    "popout_target",
    "return_to_main",
    "placeholder_plan",
    "web_open",
    "web_bounds",
    "web_visible",
    "web_snapshot",
    "web_close",
    "web_nav",
    "web_url",
    "device_name",
    "set_device_name",
    "folder_sync",
    "folder_sync_cloud_cancel",
    "folder_sync_cloud_check",
    "folder_sync_cloud_start",
    "folder_sync_confirm",
    "folder_sync_now",
    "folder_sync_pause",
    "folder_sync_start",
    "folder_sync_stop",
    "sync_rights",
    "server_accounts",
    "server_create_folder",
    "server_folders",
    "server_open",
    "server_copy_open",
    "server_copy_plan",
    "server_copy_make",
    // Pairing this device with a computer at home (ADR 0117, "The Verso
    // app paired") is the device's own, never a remote phone's.
    "server_pair",
    "server_prove",
    "server_retry",
    "window_server",
    "discover_servers_start",
    "discover_servers_list",
    "discover_servers_stop",
    "server_sign_in",
    "server_sign_in_page",
    "server_sign_out",
    "share_attachments",
    "share_grant",
    "share_invite",
    "share_list",
    "share_revoke",
    // Read links are a server's (ADR 0105): the phone's server has none.
    "read_link_create",
    "read_link_list",
    "read_link_revoke",
    "read_link_secrets",
    "log_read",
    "table_clear",
    "table_play",
    "table_sound",
    // Sharing audio (ADR 0116 section B) is the desktop host's capture and
    // the game master's: no phone captures, none shares (item 27).
    "table_share_start",
    "table_share_stop",
    "audio_sources_list",
    "audio_share_start",
    "audio_share_stop",
    // The window's own sounds while it shares (the host plays them): the
    // same desktop host, never a phone.
    "audio_share_own_begin",
    "audio_share_own_pcm",
    "audio_share_own_end",
    // A desktop window's channel for the frames it hears; a phone hears
    // through its own page (the web bridge answers it there).
    "audio_share_hear",
    // A table is a server's and its game master's (ADR 0110): no phone runs
    // the commands that change one; the status is read below.
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
    "set_folder_settings",
    "set_sync_focuses",
    "trash_empty",
    "trash_set_days",
    "history_delete",
    "recent_folders",
    "cli_status",
    "open_devtools",
    // The desktop's own menu (the Mac bar, and the in-window menu of Windows
    // and Linux): it acts on this window, and a phone has none.
    "set_menu_commands",
    "set_menu_enabled",
    "menu_sections",
    "quit_app",
];

/// The sync's commands (ADR 0079) that the Verso app paired runs to read
/// the folders it was given into its copy (ADR 0117, "The Verso app
/// paired"): at any role, as a reader's sync on a UniVerso. A browser's
/// phone runs none of them — it keeps no copy — however it was paired.
pub const APP_READ: &[&str] = &["sync_state", "sync_changes", "sync_read"];

/// The sync's commands that carry the app's changes up: an editor's only.
/// The server checks the folder's role again, as for every device.
pub const APP_EDIT: &[&str] = &["sync_put", "sync_delete", "sync_rename"];

/// The prefix of the commands that run this mode itself.
pub const LOCAL_PREFIX: &str = "local_server_";

/// The verdict on `cmd`: on a list, that list's; on none, refused.
#[must_use]
pub fn verdict(cmd: &str) -> Verdict {
    if cmd.starts_with(LOCAL_PREFIX) {
        Verdict::Refuse
    } else if READ.contains(&cmd) {
        Verdict::Allow
    } else if EDIT.contains(&cmd) {
        Verdict::Editor
    } else {
        Verdict::Refuse
    }
}

fn refused(kind: ErrorKind, message: &str) -> ContractError {
    ContractError {
        kind,
        message: message.to_owned(),
    }
}

/// Commands the web window asks while it loads or reports that a phone
/// answers **without acting** (`rpc.rs`): the walk's rules and the folder
/// note's name are the folder's own, set from the computer; the window's
/// log lines are not written into the computer's log from a phone. They are
/// on the reader's list so that the window's start is not refused (the
/// maintainer saw "not from a phone" on the first pairing, 2026-10-15).
pub const HEARD: &[&str] = &["set_walk_rules", "set_folder_note_name", "log_write"];

/// Whether a phone of `role` may run `cmd`; the refusal says why, in the
/// contract's own words.
pub fn check(cmd: &str, role: Role) -> Result<(), ContractError> {
    check_as(cmd, role, false)
}

/// [`check`] for a phone's browser (`app` false) or the Verso app paired
/// (`app` true), which runs the sync's commands at its role besides.
pub fn check_as(cmd: &str, role: Role, app: bool) -> Result<(), ContractError> {
    let verdict = match verdict(cmd) {
        Verdict::Refuse if app && APP_READ.contains(&cmd) => Verdict::Allow,
        Verdict::Refuse if app && APP_EDIT.contains(&cmd) => Verdict::Editor,
        v => v,
    };
    match verdict {
        Verdict::Allow => Ok(()),
        Verdict::Editor if role.writes() => Ok(()),
        Verdict::Editor => Err(refused(
            ErrorKind::PhoneReads,
            "this phone only reads: let it edit from the computer's Settings",
        )),
        Verdict::Refuse => Err(refused(ErrorKind::NotOnPhone, "not from a phone")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The server's own commands, which the bindings (the desktop's) do not
    /// list: the window opens a folder by id, and the sync devices speak.
    const SERVER_ONLY: &[&str] = &[
        "open_server_folder",
        "sync_state",
        "sync_changes",
        "sync_read",
        "sync_put",
        "sync_delete",
        "sync_rename",
    ];

    /// Every command the contract has: the generated bindings' invokes, and
    /// the server's own.
    fn every_command() -> Vec<String> {
        let bindings = include_str!("../../../../app/ui/src/bindings.ts");
        // `__TAURI_INVOKE("name"` and `__TAURI_INVOKE<Type>("name"`; the
        // import line names it too and is skipped.
        let mut all: Vec<String> = bindings
            .split("__TAURI_INVOKE")
            .skip(1)
            .filter(|rest| !rest.starts_with(" }"))
            .filter_map(|rest| rest.split_once("(\"")?.1.split('"').next())
            .map(str::to_owned)
            .collect();
        all.extend(SERVER_ONLY.iter().map(|s| (*s).to_owned()));
        all.sort();
        all.dedup();
        all
    }

    fn listed(cmd: &str) -> usize {
        usize::from(READ.contains(&cmd))
            + usize::from(EDIT.contains(&cmd))
            + usize::from(REFUSED.contains(&cmd))
            + usize::from(APP_READ.contains(&cmd))
            + usize::from(APP_EDIT.contains(&cmd))
            + usize::from(cmd.starts_with(LOCAL_PREFIX))
    }

    /// The guardrail of item 12: every command of the contract is either on
    /// the allowlist or refused by name, none on two lists. A command added
    /// without a decision fails this test, and is refused meanwhile.
    #[test]
    fn every_command_of_the_contract_is_on_the_allowlist_or_refused() {
        let all = every_command();
        assert!(all.len() > 100, "the bindings were read: {}", all.len());
        let unlisted: Vec<_> = all.iter().filter(|c| listed(c) == 0).collect();
        assert!(unlisted.is_empty(), "no decision yet for {unlisted:?}");
        let twice: Vec<_> = all.iter().filter(|c| listed(c) > 1).collect();
        assert!(twice.is_empty(), "on two lists: {twice:?}");
    }

    /// A name on a list that no command has is a typo that decides nothing.
    #[test]
    fn every_listed_name_is_a_command() {
        let all = every_command();
        // Commands the server answers that the desktop's bindings do not
        // list, and one the host has and the window calls.
        let extra = ["pick_folder", "open_initial", "reopen_folder"];
        for name in READ
            .iter()
            .chain(EDIT)
            .chain(REFUSED)
            .chain(APP_READ)
            .chain(APP_EDIT)
        {
            assert!(
                all.iter().any(|c| c == name) || extra.contains(name),
                "{name} is on a list and is no command"
            );
        }
    }

    /// A command that changes a folder is never on the reader's list, and
    /// one that only reads is never refused for being a write: the folder
    /// commands' own `Access` decides which list they may be on.
    #[test]
    fn a_command_that_writes_is_not_a_reader_s() {
        use verso_service::ops::{Access, FOLDER_COMMANDS};
        for (name, access) in FOLDER_COMMANDS {
            if *access == Access::Write {
                assert!(
                    !READ.contains(name),
                    "{name} writes and is on the list any phone runs"
                );
            }
            assert!(
                listed(name) == 1,
                "{name} is a folder command and is not on exactly one list"
            );
        }
    }

    /// The collaboration commands that write a note are the editor's.
    #[test]
    fn what_edits_needs_an_editor() {
        for cmd in [
            "write_note",
            "collab_update",
            "collab_save",
            "trash_restore",
        ] {
            assert!(check(cmd, Role::Reader).is_err(), "{cmd} as a reader");
            assert!(check(cmd, Role::Editor).is_ok(), "{cmd} as an editor");
        }
        for cmd in ["read_note", "search", "list_notes", "collab_join"] {
            assert!(check(cmd, Role::Reader).is_ok(), "{cmd} as a reader");
        }
    }

    /// What the window asks while it loads is answered, and what would
    /// change the laptop's folder settings is heard without acting.
    #[test]
    fn what_the_window_asks_while_loading_is_not_refused() {
        for cmd in HEARD {
            for role in [Role::Reader, Role::Editor] {
                assert!(check(cmd, role).is_ok(), "{cmd} as {role:?}");
            }
        }
    }

    /// What acts on the laptop is refused to every role: even an owner's
    /// role on the folder opens none of it (a phone is never an owner).
    #[test]
    fn what_acts_on_the_laptop_is_refused_to_every_role() {
        for cmd in [
            "reveal",
            "open_url",
            "copy_full_path",
            "web_open",
            "check_for_updates",
            "download_and_install_update",
            "restart_app",
            "log_read",
            "install_cli",
            "mcp_add_claude",
            "share_grant",
            "server_sign_in",
            "folder_sync_start",
            "server_copy_make",
            "folder_sync_cloud_check",
            "folder_sync_cloud_start",
            "folder_sync_cloud_cancel",
            "sync_put",
            "sync_state",
            "trash_empty",
            "local_server_start",
            "local_server_pair_open",
            "local_server_answer",
            "local_server_forget",
            // ADR 0117's: the link, the own address, the invitations, the seat.
            "local_server_network",
            "local_server_link_on",
            "local_server_link_off",
            "local_server_link_extend",
            "local_server_link_mode",
            "local_server_own_address_login",
            "local_server_own_address_set_up",
            "local_server_own_address_remove",
            "local_server_invitations",
            "local_server_invitation_revoke",
            "local_server_sit_at_table",
            // S7c: the desktop apps signed in, and the read links' switch.
            "local_server_devices",
            "local_server_end_device",
            "local_server_read_links",
            // The people invited: the list, a new password, sessions, remove.
            "local_server_accounts",
            "local_server_account_reset",
            "local_server_account_end_sessions",
            "local_server_account_remove",
            "a_command_added_tomorrow",
        ] {
            for role in [Role::Reader, Role::Editor, Role::Owner] {
                assert!(check(cmd, role).is_err(), "{cmd} as {role:?}");
            }
            assert_eq!(verdict(cmd), Verdict::Refuse, "{cmd}");
        }
    }

    /// The Verso app paired syncs its copy at its role; a phone's browser
    /// syncs nothing; neither runs what acts on the laptop, nor the host's
    /// own sync commands (turning a folder's sync on, its rights).
    #[test]
    fn the_app_syncs_at_its_role_and_a_browser_not_at_all() {
        for cmd in APP_READ {
            for role in [Role::Reader, Role::Editor] {
                assert!(
                    check_as(cmd, role, true).is_ok(),
                    "{cmd} as an app {role:?}"
                );
                assert!(check(cmd, role).is_err(), "{cmd} as a browser {role:?}");
            }
        }
        for cmd in APP_EDIT {
            assert!(check_as(cmd, Role::Editor, true).is_ok(), "{cmd}");
            assert!(
                check_as(cmd, Role::Reader, true).is_err(),
                "{cmd} as a reader"
            );
            assert!(check(cmd, Role::Editor).is_err(), "{cmd} as a browser");
        }
        for cmd in [
            "folder_sync_start",
            "sync_rights",
            "server_copy_make",
            "local_server_answer",
            "reveal",
            "a_command_added_tomorrow",
        ] {
            assert!(check_as(cmd, Role::Editor, true).is_err(), "{cmd}");
        }
        // What a writing sync command is, the folder commands' own access
        // says nothing of: the lists here do, and they hold no write as a
        // reader's.
        for cmd in APP_READ {
            assert!(!cmd.contains("put") && !cmd.contains("delete") && !cmd.contains("rename"));
        }
    }
}
