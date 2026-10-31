// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The embedded terminal's commands (ADR 0115, accepted 2026-10-31): a
//! shell of this computer in a tab, on the desktop host alone (item 2; the
//! server has no route for any of these, and never forwards them:
//! `remote::forwards`).
//!
//! The window names a terminal by an opaque id and a folder below the open
//! one by its relative path; the directory is formed here, at the edge, and
//! goes to the operating system only (rule 4). The host refuses what the
//! window would not draw (item 6): while the person's switch is off (Q5,
//! Settings › Features) and in a window of files opened without their
//! folder (ADR 0114 item 9). A window of a folder of this computer — a
//! synced one included (ADR 0079) — starts its shell at the folder's root
//! (Q2); a window of a server's folder, with no copy here, in the person's
//! home directory (Q4, decided 2026-10-31).

use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;

use tauri::Manager;
use tauri::ipc::Channel;
use verso_contract::{
    AiCli, AiCliFound, ContractError, ErrorKind, TerminalAt, TerminalId, TerminalOpened,
    TerminalOutput, TerminalShell, TerminalSize, TerminalStart,
};
use verso_service::{lock, refused};

use crate::pty::{Pty, Sink, Start};
use crate::{App, failed};

/// No such terminal in the window (it ended, or a layout of another run
/// named it).
fn not_found(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::NotFound,
        message: message.to_owned(),
    }
}

/// One terminal, and the window that shows it.
struct Entry {
    pty: Arc<Pty>,
    owner: String,
    at: TerminalAt,
}

/// The terminals of this run of the app. Nothing survives the app: a
/// terminal is a child of this process (Q6).
pub(crate) struct Terminals {
    /// The person's switch, as the window last said it (item 7).
    on: AtomicBool,
    /// This run's mark in every id: a layout brought back after a restart
    /// names no terminal of this run.
    run: String,
    next: AtomicU64,
    open: Mutex<HashMap<String, Entry>>,
}

impl Default for Terminals {
    fn default() -> Self {
        let mark = std::collections::hash_map::RandomState::new()
            .build_hasher()
            .finish();
        Self {
            on: AtomicBool::new(false),
            run: format!("{mark:016x}"),
            next: AtomicU64::new(1),
            open: Mutex::new(HashMap::new()),
        }
    }
}

impl Terminals {
    pub(crate) fn enabled(&self) -> bool {
        self.on.load(Ordering::SeqCst)
    }

    /// The switch: off ends every terminal, as the window closes their tabs.
    pub(crate) fn set_enabled(&self, on: bool) {
        self.on.store(on, Ordering::SeqCst);
        if !on {
            self.end_all();
        }
    }

    fn fresh_id(&self) -> String {
        let n = self.next.fetch_add(1, Ordering::SeqCst);
        format!("{}-{n}", self.run)
    }

    /// Start a shell for `owner`.
    pub(crate) fn open(
        self: &Arc<Self>,
        owner: &str,
        at: TerminalAt,
        start: Start,
        sink: Sink,
    ) -> Result<TerminalOpened, String> {
        let id = self.fresh_id();
        let gone = {
            let me: Weak<Self> = Arc::downgrade(self);
            let id = id.clone();
            Box::new(move || {
                if let Some(me) = me.upgrade() {
                    lock(&me.open).remove(&id);
                }
            })
        };
        let pty = Pty::spawn(start, gone)?;
        pty.attach(sink);
        let opened = TerminalOpened {
            id: TerminalId(id.clone()),
            at,
            shell: pty.shell.clone(),
        };
        lock(&self.open).insert(
            id,
            Entry {
                pty,
                owner: owner.to_owned(),
                at,
            },
        );
        Ok(opened)
    }

    /// The terminal `id` of `window`, or `not_found`.
    fn of(&self, window: &str, id: &TerminalId) -> Result<Arc<Pty>, ContractError> {
        lock(&self.open)
            .get(&id.0)
            .filter(|e| e.owner == window)
            .map(|e| Arc::clone(&e.pty))
            .ok_or_else(|| not_found("no such terminal in this window"))
    }

    /// A window found its terminal again after a reload (Q6): what was kept
    /// first, then what comes. A terminal another live window shows is that
    /// window's (`live` says which are).
    pub(crate) fn attach(
        &self,
        window: &str,
        id: &TerminalId,
        live: impl Fn(&str) -> bool,
        sink: Sink,
    ) -> Result<TerminalOpened, ContractError> {
        let (pty, at) = {
            let mut open = lock(&self.open);
            let entry = open
                .get_mut(&id.0)
                .filter(|e| e.owner == window || !live(&e.owner))
                .ok_or_else(|| not_found("that terminal ended"))?;
            entry.owner = window.to_owned();
            (Arc::clone(&entry.pty), entry.at)
        };
        if !pty.attach(sink) {
            return Err(failed("the window's channel closed"));
        }
        Ok(TerminalOpened {
            id: id.clone(),
            at,
            shell: pty.shell.clone(),
        })
    }

    pub(crate) fn write(
        &self,
        window: &str,
        id: &TerminalId,
        data: String,
    ) -> Result<(), ContractError> {
        self.of(window, id)?.write(data.into_bytes());
        Ok(())
    }

    pub(crate) fn resize(
        &self,
        window: &str,
        id: &TerminalId,
        size: TerminalSize,
    ) -> Result<(), ContractError> {
        self.of(window, id)?.resize(size).map_err(failed)
    }

    pub(crate) fn behind(
        &self,
        window: &str,
        id: &TerminalId,
        behind: bool,
    ) -> Result<(), ContractError> {
        self.of(window, id)?.set_behind(behind);
        Ok(())
    }

    pub(crate) fn busy(&self, window: &str, id: &TerminalId) -> bool {
        self.of(window, id).is_ok_and(|p| p.busy())
    }

    /// Close one terminal: its shell and everything it started end.
    pub(crate) fn close(&self, window: &str, id: &TerminalId) {
        let entry = {
            let mut open = lock(&self.open);
            match open.get(&id.0) {
                Some(e) if e.owner == window => open.remove(&id.0),
                _ => None,
            }
        };
        if let Some(entry) = entry {
            entry.pty.end();
        }
    }

    /// A window went (closed, not reloaded): its terminals end with it.
    pub(crate) fn end_of(&self, window: &str) {
        let ended: Vec<Entry> = {
            let mut open = lock(&self.open);
            let ids: Vec<String> = open
                .iter()
                .filter(|(_, e)| e.owner == window)
                .map(|(id, _)| id.clone())
                .collect();
            ids.iter().filter_map(|id| open.remove(id)).collect()
        };
        for entry in ended {
            entry.pty.end();
        }
    }

    /// Every terminal ends: the switch went off, or the app exits.
    pub(crate) fn end_all(&self) {
        let ended: Vec<Entry> = lock(&self.open).drain().map(|(_, e)| e).collect();
        for entry in ended {
            entry.pty.end();
        }
    }

    #[cfg(test)]
    pub(crate) fn count(&self) -> usize {
        lock(&self.open).len()
    }
}

/// The window's output channel as a sink.
fn sink(output: Channel<TerminalOutput>) -> Sink {
    Box::new(move |message| output.send(message).is_ok())
}

/// Refused where the window draws no terminal (item 6).
fn allowed<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> Result<(), ContractError> {
    let state = app.state::<App>();
    if !state.terminals.enabled() {
        return Err(refused(
            "the terminal is off: Settings › Features turns it on",
        ));
    }
    if state.service.is_loose(label) {
        return Err(refused(
            "a window of files opened without their folder has no terminal",
        ));
    }
    Ok(())
}

/// Where a window's shell starts (Q2, Q4): the folder's root, or `folder`
/// below it, for a folder of this computer — a synced one too; the home
/// directory for a server's folder (or a window with none open). `folder`
/// is relative to the open folder and confined by the core (rule 4).
pub(crate) fn place<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    folder: Option<&str>,
) -> Result<(Option<PathBuf>, TerminalAt), ContractError> {
    let state = app.state::<App>();
    if state.service.folder_of(label).is_none() {
        return Ok((None, TerminalAt::Home));
    }
    let below = folder.filter(|f| !f.is_empty()).map(str::to_owned);
    let dir = state.service.with(label, move |ws| match below {
        Some(f) => Ok(ws.absolute(&f)?),
        None => Ok(ws.folder().to_path_buf()),
    })?;
    Ok((Some(dir), TerminalAt::Folder))
}

/// `LANG` from the window's language (`pt-BR`): a GUI app on macOS is
/// started without one, and a shell without it shows `ç` as `<0347>`. A
/// tag with no region (`pt`) names no locale the system has: what matters
/// is UTF-8, `en_US.UTF-8`, which every system has. Anything that is not a
/// language tag is ignored.
pub(crate) fn lang_of(locale: Option<&str>) -> Option<String> {
    let tag = locale?;
    let mut parts = tag.split(['-', '_']);
    let language = parts.next()?;
    let region = parts.next();
    let fits = |s: &str, n: std::ops::RangeInclusive<usize>| {
        n.contains(&s.len()) && s.chars().all(|c| c.is_ascii_alphabetic())
    };
    if !fits(language, 2..=3) || parts.next().is_some() {
        return None;
    }
    match region {
        Some(r) if fits(r, 2..=2) => Some(format!(
            "{}_{}.UTF-8",
            language.to_ascii_lowercase(),
            r.to_ascii_uppercase()
        )),
        Some(_) => None,
        None => Some("en_US.UTF-8".to_owned()),
    }
}

/// Start a terminal in this window (item 5): at the folder's root, or at
/// `folder` below it ("Open terminal here"), or in the home directory for
/// a server's folder; `cli` types an AI tool's command in once the shell
/// starts (item 14). Its output comes on `output`.
#[tauri::command]
#[specta::specta]
pub(crate) async fn terminal_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    start: TerminalStart,
    output: Channel<TerminalOutput>,
) -> Result<TerminalOpened, ContractError> {
    allowed(&app, window.label())?;
    let (dir, at) = place(&app, window.label(), start.folder.as_deref())?;
    let begin = Start {
        dir,
        size: start.size,
        shell: start.shell.unwrap_or(TerminalShell::PowerShell),
        lang: lang_of(start.locale.as_deref()),
        typed: start.cli.map(|c| crate::pty::cli_word(c).to_owned()),
    };
    let terminals = Arc::clone(&app.state::<App>().terminals);
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || terminals.open(&owner, at, begin, sink(output)))
        .await
        .map_err(|e| failed(e.to_string()))?
        .map_err(failed)
}

/// A window that reloaded finds its terminal again (Q6): what the terminal
/// kept comes first on `output`.
#[tauri::command]
#[specta::specta]
pub(crate) fn terminal_attach<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: TerminalId,
    output: Channel<TerminalOutput>,
) -> Result<TerminalOpened, ContractError> {
    allowed(&app, window.label())?;
    let live = |label: &str| app.get_window(label).is_some();
    app.state::<App>()
        .terminals
        .attach(window.label(), &id, live, sink(output))
}

/// Keys typed, or text pasted, in a terminal of this window.
#[tauri::command]
#[specta::specta]
pub(crate) fn terminal_write<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: TerminalId,
    data: String,
) -> Result<(), ContractError> {
    allowed(&app, window.label())?;
    app.state::<App>()
        .terminals
        .write(window.label(), &id, data)
}

/// The terminal's size changed in the window.
#[tauri::command]
#[specta::specta]
pub(crate) fn terminal_resize<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: TerminalId,
    size: TerminalSize,
) -> Result<(), ContractError> {
    app.state::<App>()
        .terminals
        .resize(window.label(), &id, size)
}

/// The window is behind on a terminal's output, or caught up again (item
/// 8): while it is behind, the shell's output waits.
#[tauri::command]
#[specta::specta]
pub(crate) fn terminal_flow<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: TerminalId,
    behind: bool,
) -> Result<(), ContractError> {
    app.state::<App>()
        .terminals
        .behind(window.label(), &id, behind)
}

/// Whether a program other than the shell runs in the terminal (item 13),
/// for the question before its tab closes or the app quits; on Windows,
/// whether the terminal is open at all.
#[tauri::command]
#[specta::specta]
pub(crate) fn terminal_busy<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: TerminalId,
) -> bool {
    app.state::<App>().terminals.busy(window.label(), &id)
}

/// Close a terminal: the shell and its whole process tree end (item 13).
#[tauri::command]
#[specta::specta]
pub(crate) fn terminal_close<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: TerminalId,
) {
    app.state::<App>().terminals.close(window.label(), &id);
}

/// The person's switch (item 7, Q5), pushed by the window at its start and
/// on every change.
#[tauri::command]
#[specta::specta]
pub(crate) fn set_terminal_enabled<R: tauri::Runtime>(app: tauri::AppHandle<R>, on: bool) {
    app.state::<App>().terminals.set_enabled(on);
}

/// Which AI command-line tools the person's login shell finds (item 14):
/// asked on a click, never at start.
#[tauri::command]
#[specta::specta]
pub(crate) async fn terminal_detect<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    shell: Option<TerminalShell>,
    locale: Option<String>,
) -> Result<Vec<AiCliFound>, ContractError> {
    allowed(&app, window.label())?;
    let (dir, _) = place(&app, window.label(), None)?;
    let start = Start {
        dir,
        size: TerminalSize { cols: 80, rows: 24 },
        shell: shell.unwrap_or(TerminalShell::PowerShell),
        lang: lang_of(locale.as_deref()),
        typed: None,
    };
    let found = tauri::async_runtime::spawn_blocking(move || {
        crate::pty::detect(&start, Duration::from_secs(15))
    })
    .await
    .map_err(|e| failed(e.to_string()))?
    .map_err(failed)?;
    Ok(crate::pty::CLIS
        .iter()
        .map(|&cli| AiCliFound {
            cli,
            found: found.contains(&cli),
        })
        .collect())
}

/// The page where a tool not found is installed from (item 14): a fixed
/// address for each, opened in the system's browser, as the settings open
/// Claude Desktop's (ADR 0054).
pub(crate) fn install_page(cli: AiCli) -> &'static str {
    match cli {
        AiCli::Claude => "https://claude.com/product/claude-code",
        AiCli::Gemini => "https://github.com/google-gemini/gemini-cli",
        AiCli::Codex => "https://github.com/openai/codex",
        AiCli::Antigravity => "https://antigravity.google",
    }
}

/// Open a tool's install page in the system's browser.
#[tauri::command]
#[specta::specta]
pub(crate) fn terminal_install_page(cli: AiCli) -> Result<(), ContractError> {
    crate::cli::open_page(install_page(cli))
}
