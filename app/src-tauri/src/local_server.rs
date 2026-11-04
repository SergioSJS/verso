//! "This app is a server" from the desktop app's side (ADR 0096): the
//! Settings section, the pairing dialog and the status mark call these
//! commands; the serving itself is `verso_server::local`, the same service
//! and code `verso serve` runs, started in this process.
//!
//! Off at every start unless "keep on at start" was ticked (item 1). The
//! host's own commands are desktop-only: a phone's allowlist refuses the
//! `local_server_` prefix whole (`verso_server::local::allow`).
//!
//! macOS, Linux and Windows serve (ADR 0096 item 17, revised 2026-10-15:
//! `verso-server` builds on Windows with OpenSSL compiled in, as elsewhere).

use verso_contract::{
    LocalAddressChoice, LocalAsked, LocalAudit, LocalDevice, LocalFolder, LocalInvitation,
    LocalLink, LocalOwnLogin, LocalPairState, LocalPairing, LocalPhone, LocalPlayer, LocalReset,
    LocalServerStatus,
};

use super::*;

/// The mode's server, made on first use.
#[derive(Default)]
pub(crate) struct LocalSlot {
    server: std::sync::OnceLock<verso_server::local::LocalServer>,
    /// The internet link's `cloudflared` (ADR 0117 D3, `crate::tunnel`).
    pub(crate) link: crate::tunnel::Slot,
}

mod accounts;
mod link;
mod own;
mod owner;
#[cfg(test)]
pub(crate) use own::hostname_of;
mod platform;
pub(crate) mod seat;

#[cfg(test)]
impl LocalSlot {
    /// The mode's server made by a test (its window's files, its
    /// directory), before the app makes its own.
    pub(crate) fn set_for_tests(&self, server: verso_server::local::LocalServer) {
        let _ = self.server.set(server);
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::status(app).await
}

/// The folders this computer has opened, to tick the ones to serve.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_folders<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalFolder>, ContractError> {
    platform::folders(app).await
}

/// Tick or untick a folder (by its key). A folder that also syncs with a
/// UniVerso is ticked like any other; one shared with this person by
/// another account is not (ADR 0081 item 4).
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_tick<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
    ticked: bool,
) -> Result<Vec<LocalFolder>, ContractError> {
    platform::tick(app, key, ticked).await
}

/// The folders inside a folder this computer has opened (by its key), to
/// choose which of them to serve: relative, `/`-joined, none hidden
/// (ADR 0096 item 2, amended 2026-10-16).
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_subfolders<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
) -> Result<Vec<String>, ContractError> {
    platform::subfolders(app, key).await
}

/// Serve only these folders inside a ticked folder. **None stops serving the
/// folder** (it is unticked and the choice forgotten); all of it is
/// `local_server_whole`. Not while serving, like ticking.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_parts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
    parts: Vec<String>,
) -> Result<Vec<LocalFolder>, ContractError> {
    platform::parts(app, key, parts).await
}

/// Serve all of a ticked folder again, with nothing chosen inside it: the
/// explicit way to the whole folder. Not while serving.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_whole<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
) -> Result<Vec<LocalFolder>, ContractError> {
    platform::whole(app, key).await
}

/// Keep on at start, and the host's own certificate (item 5 (d)).
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    keep_on: bool,
    cert_file: Option<String>,
    key_file: Option<String>,
    host_name: Option<String>,
    max_connected: u32,
) -> Result<LocalServerStatus, ContractError> {
    platform::settings(app, keep_on, cert_file, key_file, host_name, max_connected).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::start(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_stop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::stop(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_pair_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    address: Option<String>,
) -> Result<LocalPairing, ContractError> {
    platform::pair_open(app, address).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_pair_close<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), ContractError> {
    platform::pair_close(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_pair_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalPairState, ContractError> {
    platform::pair_state(app).await
}

/// The laptop's answer to "Was it you?": allow (as an editor, or as a
/// reader) or refuse.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_answer<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    allow: bool,
    editor: bool,
) -> Result<(), ContractError> {
    platform::answer(app, allow, editor).await
}

/// Let a paired phone edit (or only read) without pairing it again.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_phone_role<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    editor: bool,
) -> Result<(), ContractError> {
    platform::phone_role(app, id, editor).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_phones<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalPhone>, ContractError> {
    platform::phones(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_revoke<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    platform::revoke(app, id).await
}

/// Forget every device: every phone's session ends.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_forget<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<u32, ContractError> {
    platform::forget(app).await
}

/// "Replace this computer's identity": serving stops, the key is made
/// anew, every pairing ends.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_replace_identity<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::replace_identity(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_audit<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalAudit>, ContractError> {
    platform::audit(app).await
}

/// Sit this window at the table of its folder, which this app serves (ADR
/// 0117 D4 Q3, *Sit at the table*): the window becomes a client of its own
/// server, as the owner, and has the table, the campaign and the
/// invitation as on a UniVerso. Refused for a folder this app does not
/// serve, and while it serves none.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_sit_at_table<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<FolderInfo, ContractError> {
    seat::sit(app, window).await
}

/// The box *On my network* (ADR 0117 D1, D4 Q2): kept; changed while
/// serving is off.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_network<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    on: bool,
) -> Result<LocalServerStatus, ContractError> {
    link::network(app, on).await
}

/// The box *By an internet link* ticked (ADR 0117 D3): a quick link, or the
/// own address when that is the mode. Starts serving when it was off. The
/// first time it downloads the pinned `cloudflared`.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_link_on<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalLink, ContractError> {
    link::link_on(app).await
}

/// The link off: with *On my network* unticked, serving stops with it.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_link_off<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalLink, ContractError> {
    link::link_off(app).await
}

/// *Extend*: a quick link's twelve hours from now again (D4 Q6).
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_link_extend<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalLink, ContractError> {
    link::link_extend(app).await
}

/// The name the players see for this computer's owner (its account's,
/// as on a UniVerso), set in the section.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_owner_name<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
) -> Result<LocalServerStatus, ContractError> {
    owner::set(app, name).await
}

/// A quick link (`own` false) or the own address (D10), for the next time
/// the link is turned on.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_link_mode<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    own: bool,
) -> Result<LocalServerStatus, ContractError> {
    link::link_mode(app, own).await
}

/// *Use my own address*, step one: log in to Cloudflare in the browser
/// (D10 item 2).
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_own_address_login<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalOwnLogin, ContractError> {
    own::login(app).await
}

/// *Use my own address*, step two: the tunnel made and `hostname` routed to
/// it (D10 items 3 and 4); the link uses it from now on.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_own_address_set_up<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    hostname: String,
) -> Result<LocalServerStatus, ContractError> {
    own::set_up(app, hostname).await
}

/// Forget the own address: deleted at Cloudflare, or on this computer
/// alone with `here_only`.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_own_address_remove<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    here_only: bool,
) -> Result<LocalServerStatus, ContractError> {
    own::remove(app, here_only).await
}

/// Every invitation of this computer's server.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_invitations<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalInvitation>, ContractError> {
    link::invitations(app).await
}

/// End an invitation not used yet.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_invitation_revoke<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    link::invitation_revoke(app, id).await
}

/// The desktop apps of other people signed in to this computer's server
/// (ADR 0117 D9, S11), to end one; never the window at the table, never a
/// phone.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_devices<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalDevice>, ContractError> {
    accounts::devices(app).await
}

/// *End* a desktop app's session: it syncs nothing until it signs in again.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_end_device<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    accounts::end_device(app, id).await
}

/// Read links on or off for this computer's server (ADR 0105 item 3; ADR
/// 0117 D9, S12): off at first; off ends every link at once.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_read_links<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    on: bool,
) -> Result<LocalServerStatus, ContractError> {
    accounts::read_links(app, on).await
}

/// The people invited to this computer's server (ADR 0117 D9), for
/// *Pessoas convidadas*; never this computer's own accounts.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_accounts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalPlayer>, ContractError> {
    accounts::players(app).await
}

/// *Nova senha*: a single-use link for a day that sets a person's new
/// password (ADR 0117 D9; ADR 0074 item 5), said this once; their sessions
/// end now.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_account_reset<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<LocalReset, ContractError> {
    accounts::reset(app, id).await
}

/// *Encerrar sessões*: every session of a person ends, their tokens too.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_account_end_sessions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    accounts::end_sessions(app, id).await
}

/// *Remover*: a person's account and everything it held.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_account_remove<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    accounts::remove(app, id).await
}

/// At the app's start: serve again when the person asked it to keep on
/// (item 1), after the setup, off the main thread.
pub(crate) fn auto_start<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    platform::auto_start(app);
}

/// Whether it serves, how many folders and how many phones are connected
/// now; none before the server was first used.
#[cfg(any(target_os = "macos", windows))]
pub(crate) fn serving_now<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(bool, usize, u32)> {
    platform::serving_now(app)
}

/// Stop serving now, from the menu-bar mark's *Stop*: the link's tunnel
/// first.
#[cfg(any(target_os = "macos", windows))]
pub(crate) fn stop_now<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    crate::tunnel::stop_with(app, crate::tunnel::LinkEnd::Stopped);
    platform::stop_on_exit(app);
}

/// At the app's end: stop, so the port closes and the goodbye is sent; the
/// link's `cloudflared` is stopped first, so it does not outlive the app
/// (ADR 0117 D3 item 6).
pub(crate) fn stop_on_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    crate::tunnel::stop_with(app, crate::tunnel::LinkEnd::Quit);
    platform::stop_on_exit(app);
}

/// The mode's server, for the link's tunnel (`crate::tunnel`) and the
/// address of a read link made from the window at the table (`shares.rs`).
pub(crate) fn server_for_link<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<verso_server::local::LocalServer, String> {
    platform::server(app).map_err(|e| e.message)
}
