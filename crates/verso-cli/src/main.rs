// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso index | search | backlinks | mcp` (Phase 1, features 4 and 6;
//! feature 7's two languages come with them). The binary reads arguments and prints;
//! `verso-core` does the work (ADR 0026 rule 5). Provisional choices —
//! the subcommand-first shape, the exit codes, the JSON shape — are in
//! `docs/reference/cli-decision.md` for the maintainer.
//!
//! stdout carries the answer only; usage errors, open errors and the
//! problem lines of a run go to stderr, so `--json > file` never mixes
//! a sentence into the JSON.

mod mcp;
mod messages;

use std::ffi::OsString;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use messages::{Lang, Msg, text};
use verso_core::{CoreError, WalkProblem, Workspace};

/// The allocator of the `verso` binary (server and command line): mimalloc
/// is faster under many writers than musl's and gives most memory back
/// after a burst, which glibc's does not (`docs/reference/server-install.md`
/// section 14; adopted by the maintainer 2026-10-11).
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// What the arguments asked for.
#[derive(Debug, PartialEq, Eq)]
enum Command {
    Help,
    /// `verso --version`: the version and the commit it was built from.
    Version,
    Index {
        folder: PathBuf,
    },
    Search {
        folder: PathBuf,
        words: String,
        limit: usize,
    },
    Backlinks {
        folder: PathBuf,
        note: String,
    },
    Unresolved {
        folder: PathBuf,
    },
    /// Serve the folder over MCP on stdin/stdout until stdin closes.
    Mcp {
        folder: PathBuf,
    },
    /// The same, the folder named by the key the app gives it
    /// (`verso mcp --key <key>`): what the app writes into an MCP client's
    /// configuration, so that no path of the folder has to go there
    /// through the window (ADR 0026 rule 4).
    McpKey {
        key: String,
    },
    /// Every folder Verso has opened that is marked visible to agents
    /// (`verso mcp --all`; ADR 0054, revised 2026-10-08).
    McpAll,
    /// Open the folder in the app (`verso .`, like an editor's `code .`).
    Open {
        folder: PathBuf,
    },
    /// The server (ADR 0073): configured by its `VERSO_*` variables; with
    /// `--web`, the window served to a browser too (ADR 0073 item 2).
    Serve {
        web: bool,
    },
    /// `verso serve admin reset <e-mail>` (ADR 0074 item 5).
    ServeAdminReset {
        email: String,
    },
}

#[derive(Debug, PartialEq, Eq)]
struct Options {
    json: bool,
    lang: Option<Lang>,
}

/// The first argument when it is not a folder. A folder named like one of
/// these is reached through `verso open <folder>`.
const SUBCOMMANDS: [&str; 11] = [
    "index",
    "serve",
    "search",
    "backlinks",
    "mcp",
    "open",
    "help",
    "--help",
    "-h",
    "--version",
    "-V",
];

/// Parse `args` (without the program name). Options may appear anywhere
/// and are always read, so that an error about the command is printed in
/// the language the user asked for. The folder stays an `OsString` until
/// it becomes a `PathBuf`: a name that is not UTF-8 is still a folder.
fn parse(args: &[OsString]) -> (Options, Result<Command, Msg>) {
    parse_with(args, names_a_directory)
}

/// Whether a path names something the app opens — an existing directory,
/// or a Markdown or structured-data file (`.json`, `.yaml`, `.yml`,
/// `.toml`, `.xml`, `.csv`), opened without its folder (ADR 0114 items 8
/// and 34, the revisions of ADR 0042) — asked of `verso-fs`: the one crate
/// that touches the disk (ADR 0026 rule 5), whose `Root::open` and
/// `kind_of` are the entry edge where a path string is accepted. Nothing
/// is read.
fn names_a_directory(path: &Path) -> bool {
    verso_fs::Root::open(path, Vec::new()).is_ok()
        || matches!(
            verso_fs::kind_of(path),
            verso_fs::PathKind::MarkdownFile | verso_fs::PathKind::DataFile
        )
}

/// [`parse`] with the disk stood in for: `is_dir` says whether a first
/// argument names an existing directory.
fn parse_with(
    args: &[OsString],
    is_dir: impl Fn(&Path) -> bool,
) -> (Options, Result<Command, Msg>) {
    let mut json = false;
    let mut lang = None;
    let mut limit = 20usize;
    let mut unresolved = false;
    let mut key: Option<String> = None;
    let mut all = false;
    let mut web = false;
    let mut positional: Vec<OsString> = Vec::new();
    let mut error: Option<Msg> = None;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        let s = arg.to_string_lossy();
        match s.as_ref() {
            "--json" => json = true,
            "--unresolved" => unresolved = true,
            "--lang" => {
                let value = iter
                    .next()
                    .map(|v| v.to_string_lossy().to_ascii_lowercase());
                match value.as_deref() {
                    Some(v) if v.starts_with("pt") => lang = Some(Lang::PtBr),
                    Some("en") => lang = Some(Lang::En),
                    _ => {
                        error.get_or_insert(Msg::BadOptionValue("--lang".to_owned()));
                    }
                }
            }
            "--key" => match iter.next() {
                Some(v) => key = Some(v.to_string_lossy().into_owned()),
                None => {
                    error.get_or_insert(Msg::BadOptionValue("--key".to_owned()));
                }
            },
            "--all" => all = true,
            "--web" => web = true,
            "--limit" => match iter.next().and_then(|v| v.to_string_lossy().parse().ok()) {
                Some(n) => limit = n,
                None => {
                    error.get_or_insert(Msg::BadOptionValue("--limit".to_owned()));
                }
            },
            // Asking for help or the version is a command, not an unknown
            // option.
            "--help" | "--version" => positional.push(arg.clone()),
            other if other.starts_with("--") => {
                error.get_or_insert(Msg::UnknownOption(other.to_owned()));
            }
            _ => positional.push(arg.clone()),
        }
    }
    let options = Options { json, lang };
    let command = match error {
        Some(msg) => Err(msg),
        None if all => all_of(positional, unresolved, key.as_ref()),
        None => command_of(positional, limit, unresolved, key, is_dir).and_then(|c| match c {
            Command::Serve { .. } => Ok(Command::Serve { web }),
            _ if web => Err(Msg::ExtraArgument("--web".to_owned())),
            other => Ok(other),
        }),
    };
    (options, command)
}

/// `verso mcp --all`: `--all` belongs to `mcp` alone, without a folder or
/// a key.
fn all_of(
    positional: Vec<OsString>,
    unresolved: bool,
    key: Option<&String>,
) -> Result<Command, Msg> {
    let mut positional = positional.into_iter();
    if positional.next().is_none_or(|sub| sub != "mcp") {
        return Err(Msg::ExtraArgument("--all".to_owned()));
    }
    if key.is_some() {
        return Err(Msg::ExtraArgument("--key".to_owned()));
    }
    if unresolved {
        return Err(Msg::ExtraArgument("--unresolved".to_owned()));
    }
    if let Some(extra) = positional.next() {
        return Err(Msg::ExtraArgument(extra.to_string_lossy().into_owned()));
    }
    Ok(Command::McpAll)
}

fn command_of(
    positional: Vec<OsString>,
    limit: usize,
    unresolved: bool,
    key: Option<String>,
    is_dir: impl Fn(&Path) -> bool,
) -> Result<Command, Msg> {
    let mut positional = positional.into_iter();
    let Some(sub) = positional.next() else {
        return Err(Msg::Usage);
    };
    let sub_text = sub.to_string_lossy().into_owned();
    // `--key` names the folder for `mcp` only, and in place of it.
    if let Some(key) = key {
        if sub_text != "mcp" {
            return Err(Msg::ExtraArgument("--key".to_owned()));
        }
        if unresolved {
            return Err(Msg::ExtraArgument("--unresolved".to_owned()));
        }
        if let Some(extra) = positional.next() {
            return Err(Msg::ExtraArgument(extra.to_string_lossy().into_owned()));
        }
        return Ok(Command::McpKey { key });
    }
    // `verso .`, `verso ../notas`, `verso notas`: a first argument that is
    // not a subcommand and names an existing directory opens that folder
    // in the app; one that names nothing is a usage error. A subcommand
    // wins over a folder of the same name, which `verso open` reaches.
    // The rule ADR 0042 decides for Phase 2 (2026-09-23).
    if !SUBCOMMANDS.contains(&sub_text.as_str()) {
        if !is_dir(Path::new(&sub)) {
            return Err(Msg::UnknownSubcommand(sub_text));
        }
        if unresolved {
            return Err(Msg::ExtraArgument("--unresolved".to_owned()));
        }
        if let Some(extra) = positional.next() {
            return Err(Msg::ExtraArgument(extra.to_string_lossy().into_owned()));
        }
        return Ok(Command::Open {
            folder: PathBuf::from(sub),
        });
    }
    let folder = positional.next().map(PathBuf::from);
    let mut rest: Vec<String> = positional
        .map(|s| s.to_string_lossy().into_owned())
        .collect();
    let extra = |rest: &mut Vec<String>| -> Result<(), Msg> {
        match rest.pop() {
            Some(s) => Err(Msg::ExtraArgument(s)),
            None => Ok(()),
        }
    };
    let command = match sub_text.as_str() {
        "index" => {
            if unresolved {
                return Err(Msg::ExtraArgument("--unresolved".to_owned()));
            }
            extra(&mut rest)?;
            Command::Index {
                folder: folder.ok_or(Msg::MissingFolder)?,
            }
        }
        "search" => {
            if unresolved {
                return Err(Msg::ExtraArgument("--unresolved".to_owned()));
            }
            let folder = folder.ok_or(Msg::MissingFolder)?;
            if rest.is_empty() {
                return Err(Msg::MissingQuery);
            }
            Command::Search {
                folder,
                words: rest.join(" "),
                limit,
            }
        }
        "backlinks" => {
            let folder = folder.ok_or(Msg::MissingFolder)?;
            if unresolved {
                extra(&mut rest)?;
                Command::Unresolved { folder }
            } else {
                rest.reverse();
                let note = rest.pop().ok_or(Msg::MissingNote)?;
                extra(&mut rest)?;
                Command::Backlinks { folder, note }
            }
        }
        "mcp" => {
            if unresolved {
                return Err(Msg::ExtraArgument("--unresolved".to_owned()));
            }
            extra(&mut rest)?;
            Command::Mcp {
                folder: folder.ok_or(Msg::MissingFolder)?,
            }
        }
        // `verso open <folder>` opens whatever the folder is called, and
        // asks the disk nothing: the app reports a folder that is not there.
        "open" => {
            if unresolved {
                return Err(Msg::ExtraArgument("--unresolved".to_owned()));
            }
            extra(&mut rest)?;
            Command::Open {
                folder: folder.ok_or(Msg::MissingFolder)?,
            }
        }
        "serve" => {
            if unresolved {
                return Err(Msg::ExtraArgument("--unresolved".to_owned()));
            }
            let mut words: Vec<String> = folder
                .map(|f| f.to_string_lossy().into_owned())
                .into_iter()
                .chain(rest)
                .collect();
            match words.as_slice() {
                [] => Command::Serve { web: false },
                [admin, reset, _] if admin == "admin" && reset == "reset" => {
                    Command::ServeAdminReset {
                        email: words.pop().unwrap_or_default(),
                    }
                }
                [admin, reset] if admin == "admin" && reset == "reset" => {
                    return Err(Msg::BadOptionValue("admin reset <e-mail>".to_owned()));
                }
                [.., last] => return Err(Msg::ExtraArgument(last.clone())),
            }
        }
        "help" | "--help" | "-h" => Command::Help,
        "--version" | "-V" => Command::Version,
        // Every name in SUBCOMMANDS has an arm above.
        other => return Err(Msg::UnknownSubcommand(other.to_owned())),
    };
    Ok(command)
}

/// Start the app on `folder`, detached: `$VERSO_APP` when set, else the
/// `verso-app` binary beside this one (a development tree), else the
/// installed application by name. The error names what was tried.
///
/// The installed app gets the folder as a document to open, not as an
/// argument: macOS delivers it by an open event whether it launches the
/// app or the app is already running, where `open --args` reached only a
/// new process and a running app never saw the folder
/// (`docs/review/phase-2.md`, reading 3, finding 20). `open` refuses a
/// document that is not there. `verso open` asks the disk nothing before
/// it launches (ADR 0042); when nothing could be started, the disk says
/// which part was missing — the folder, or the app. `open`'s own words are
/// not shown.
fn launch_app(folder: &Path) -> Result<(), Launch> {
    let mut tried = Vec::new();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(env) = std::env::var_os("VERSO_APP") {
        candidates.push(PathBuf::from(env));
    }
    // `verso-app.exe` on Windows (ADR 0069), `verso-app` elsewhere.
    let beside = format!("verso-app{}", std::env::consts::EXE_SUFFIX);
    if let Ok(me) = std::env::current_exe() {
        if let Some(dir) = me.parent() {
            candidates.push(dir.join(&beside));
        }
        // The installed `verso` is often a symlink (Homebrew); the app
        // binary sits beside the real file, not beside the link. The
        // exception for `canonicalize` is declared in this crate's
        // clippy.toml (ADR 0026 rule 5: the CLI's input and output are
        // the entry edge, outside the open-folder rule).
        if let Ok(real) = std::fs::canonicalize(&me)
            && let Some(dir) = real.parent()
        {
            candidates.push(dir.join(&beside));
        }
    }
    // The installed macOS app is never run as a binary: `open -a` below hands
    // it the folder by an open event, and a running app takes it into a new
    // window. Running the bundle's binary, with `open -n` beside it, started
    // a second app that showed no window (ADR 0042, revised 2026-10-08). The
    // installed command line is a link into the bundle, so the binary beside
    // its real file is inside a `.app` too: none of those is run.
    #[cfg(target_os = "macos")]
    candidates.retain(|c| {
        !c.components()
            .any(|part| part.as_os_str().to_string_lossy().ends_with(".app"))
    });
    for app in candidates {
        match std::process::Command::new(&app)
            .arg(folder)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            Ok(_) => return Ok(()),
            Err(e) => tried.push(format!("{}: {e}", app.display())),
        }
    }
    #[cfg(target_os = "macos")]
    {
        let mut app_names = vec![APP_NAME];
        if APP_NAME == "Verso" {
            app_names.push("Verso Beta");
        } else if APP_NAME == "Verso Beta" {
            app_names.push("Verso");
        }
        for name in app_names {
            match std::process::Command::new("open")
                .args(["-a", name])
                .arg(folder)
                .stderr(std::process::Stdio::null())
                .status()
            {
                Ok(status) if status.success() => return Ok(()),
                Ok(status) => tried.push(format!("open -a {name}: {status}")),
                Err(e) => tried.push(format!("open -a {name}: {e}")),
            }
        }
    }
    if !names_a_directory(folder) {
        return Err(Launch::NoFolder);
    }
    Err(Launch::NoApp(tried.join("; ")))
}

/// The installed app's name: "Verso", or what the build was given — a beta
/// release builds its command line with `VERSO_APP_NAME=Verso Beta`, so that
/// `verso <folder>` opens the app of its own channel (ADR 0051), and says
/// which one it opened. Only macOS opens an installed app by name; every
/// platform names it.
const APP_NAME: &str = match option_env!("VERSO_APP_NAME") {
    Some(name) => name,
    None => "Verso",
};

/// Why nothing was started on a folder.
enum Launch {
    /// The folder is not there.
    NoFolder,
    /// No app could be started; what was tried.
    NoApp(String),
}

fn with_code(mut out: Output, code: u8) -> Output {
    out.code = code;
    out
}

/// What a run prints and how it exits.
#[derive(Debug, Default)]
struct Output {
    code: u8,
    stdout: Vec<String>,
    stderr: Vec<String>,
}

fn open_error(e: &CoreError) -> Msg {
    match e {
        CoreError::NoConfigDir => Msg::NoConfigDir,
        other => Msg::CannotOpen(other.to_string()),
    }
}

fn problem_msg(p: &WalkProblem) -> Msg {
    match p {
        WalkProblem::Loop { path, first_seen } => Msg::ProblemLoop {
            path: path.clone(),
            first_seen: first_seen.clone(),
        },
        WalkProblem::Duplicate { path, first_seen } => Msg::ProblemDuplicate {
            path: path.clone(),
            first_seen: first_seen.clone(),
        },
        WalkProblem::TooDeep { path } => Msg::ProblemTooDeep(path.clone()),
        WalkProblem::Io { path, error, .. } => Msg::ProblemIo {
            path: path.clone(),
            error: error.clone(),
        },
    }
}

/// Exit codes (provisional): 0 ok; 1 the run completed but reported
/// problems in the folder; 2 usage; 3 the folder or the index could not
/// be opened.
fn run(args: &[OsString]) -> Output {
    let (options, command) = parse(args);
    let lang = options.lang.unwrap_or_else(Lang::from_env);
    let mut out = Output::default();
    let command = match command {
        Ok(Command::Help) => {
            out.stdout.push(text(&Msg::Usage, lang));
            return out;
        }
        // The same line in every language: a name, a version, a commit.
        Ok(Command::Version) => {
            out.stdout.push(format!(
                "verso {} ({})",
                env!("CARGO_PKG_VERSION"),
                env!("VERSO_COMMIT")
            ));
            return out;
        }
        Ok(command) => command,
        Err(msg) => {
            out.stderr.push(text(&msg, lang));
            if msg != Msg::Usage {
                out.stderr.push(text(&Msg::Usage, lang));
            }
            out.code = 2;
            return out;
        }
    };
    let folder = match &command {
        Command::Index { folder }
        | Command::Search { folder, .. }
        | Command::Backlinks { folder, .. }
        | Command::Unresolved { folder }
        | Command::Mcp { folder } => Some(folder.clone()),
        Command::McpKey { .. } => None,
        Command::Help | Command::Version => return out,
        Command::Serve { .. } | Command::ServeAdminReset { .. } => {
            return serve(&command, lang, out);
        }
        Command::McpAll => {
            // Nothing is opened before the first call that names a folder.
            out.stderr.push(text(&Msg::McpServingAll, lang));
            emit(std::io::stderr().lock(), &out.stderr);
            out.stderr.clear();
            let served = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
                .and_then(|rt| {
                    rt.block_on(mcp::serve(mcp::Server::all(None)))
                        .map_err(|e| e.to_string())
                });
            out.code = match served {
                Ok(()) => 0,
                Err(e) => {
                    out.stderr.push(text(&Msg::McpFailed(e), lang));
                    3
                }
            };
            return out;
        }
        Command::Open { folder } => {
            let folder = std::path::absolute(folder).unwrap_or_else(|_| folder.clone());
            match launch_app(&folder) {
                Ok(()) => out.stderr.push(text(
                    &Msg::Opening {
                        folder: folder.to_string_lossy().into_owned(),
                        app: APP_NAME.to_owned(),
                    },
                    lang,
                )),
                Err(Launch::NoFolder) => {
                    out.stderr.push(text(
                        &Msg::NoFolderToOpen(folder.to_string_lossy().into_owned()),
                        lang,
                    ));
                    out.code = 3;
                }
                Err(Launch::NoApp(e)) => {
                    out.stderr.push(text(
                        &Msg::AppNotFound {
                            app: APP_NAME.to_owned(),
                            tried: e,
                        },
                        lang,
                    ));
                    out.code = 3;
                }
            }
            return out;
        }
    };
    let opened = match (&folder, &command) {
        (Some(folder), _) => Workspace::open(folder, None),
        (None, Command::McpKey { key }) => Workspace::reopen(key, None),
        (None, _) => Err(CoreError::UnknownFolder),
    };
    let mut ws = match opened {
        Ok(ws) => ws,
        Err(e) => {
            out.stderr.push(text(&open_error(&e), lang));
            out.code = 3;
            return out;
        }
    };
    out.code = match command {
        // Answered above, before any folder is opened.
        Command::Help
        | Command::Version
        | Command::Open { .. }
        | Command::McpAll
        | Command::Serve { .. }
        | Command::ServeAdminReset { .. } => 0,
        Command::Mcp { .. } | Command::McpKey { .. } => {
            // One incremental pass before the first answer (memo §6.3);
            // its report goes to stderr, stdout is the protocol.
            match ws.index() {
                Ok(r) => out.stderr.push(text(
                    &Msg::McpServing {
                        folder: ws.folder().to_string_lossy().into_owned(),
                        indexed: r.indexed,
                        unchanged: r.unchanged,
                    },
                    lang,
                )),
                Err(e) => {
                    out.stderr
                        .push(text(&Msg::IndexFailed(e.to_string()), lang));
                    return with_code(out, 3);
                }
            }
            emit(std::io::stderr().lock(), &out.stderr);
            out.stderr.clear();
            let served = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
                .and_then(|rt| {
                    rt.block_on(mcp::serve(mcp::Server::new(ws, None)))
                        .map_err(|e| e.to_string())
                });
            match served {
                Ok(()) => 0,
                Err(e) => {
                    out.stderr.push(text(&Msg::McpFailed(e), lang));
                    3
                }
            }
        }
        Command::Index { .. } => match ws.index() {
            Ok(r) => {
                let space = space_of(&ws);
                if options.json {
                    out.stdout.push(json_index(&r, &space));
                } else {
                    out.stdout.push(text(
                        &Msg::IndexSummary {
                            indexed: r.indexed,
                            unchanged: r.unchanged,
                            removed: r.removed,
                            placeholders: r.placeholders,
                        },
                        lang,
                    ));
                    out.stdout.push(text(
                        &Msg::Space {
                            total: human_bytes(space.total),
                            notes: human_bytes(space.notes),
                            attachments: human_bytes(space.attachments),
                            files: space.files,
                            index: human_bytes(space.index),
                        },
                        lang,
                    ));
                }
                for (p, e) in &r.unreadable {
                    out.stderr
                        .push(text(&Msg::Unreadable(p.clone(), e.clone()), lang));
                }
                for p in &r.problems {
                    out.stderr.push(text(&problem_msg(p), lang));
                }
                u8::from(!(r.unreadable.is_empty() && r.problems.is_empty()))
            }
            Err(e) => {
                out.stderr
                    .push(text(&Msg::IndexFailed(e.to_string()), lang));
                3
            }
        },
        Command::Search { words, limit, .. } => match ws.search(&words, limit) {
            Ok(hits) if options.json => {
                out.stdout.push(json_object(
                    "hits",
                    hits.iter().map(|h| {
                        format!(
                            "{{\"path\":{},\"snippet\":{}}}",
                            json_str(&h.path),
                            json_str(&h.snippet)
                        )
                    }),
                ));
                0
            }
            Ok(hits) => {
                if hits.is_empty() {
                    out.stdout.push(text(&Msg::NoHits, lang));
                }
                for h in hits {
                    out.stdout.push(text(
                        &Msg::HitLine {
                            path: h.path,
                            snippet: h.snippet,
                        },
                        lang,
                    ));
                }
                0
            }
            Err(e) => {
                out.stderr
                    .push(text(&Msg::IndexFailed(e.to_string()), lang));
                3
            }
        },
        Command::Backlinks { note, .. } => match ws.backlinks(&note) {
            Ok(None) => {
                out.stderr.push(text(&Msg::UnknownNote(note), lang));
                if options.json {
                    out.stdout
                        .push(json_object("backlinks", std::iter::empty()));
                }
                0
            }
            Ok(Some(back)) if options.json => {
                out.stdout.push(json_object(
                    "backlinks",
                    back.iter().map(|b| {
                        format!(
                            "{{\"from\":{},\"line\":{},\"col\":{},\"target\":{},\"embed\":{}}}",
                            json_str(&b.from),
                            b.line,
                            b.col,
                            json_str(&b.target),
                            b.embed
                        )
                    }),
                ));
                0
            }
            Ok(Some(back)) => {
                if back.is_empty() {
                    out.stdout.push(text(&Msg::NoBacklinks(note), lang));
                }
                for b in back {
                    out.stdout.push(text(
                        &Msg::BacklinkLine {
                            from: b.from,
                            line: b.line,
                            col: b.col,
                            target: b.target,
                            embed: b.embed,
                        },
                        lang,
                    ));
                }
                0
            }
            // A path that cannot name a note of the folder is a usage error,
            // said as such — not "indexing failed".
            Err(CoreError::Confined(why)) => {
                out.stderr
                    .push(text(&Msg::RefusedNote(note, why.to_string()), lang));
                2
            }
            Err(e) => {
                out.stderr
                    .push(text(&Msg::IndexFailed(e.to_string()), lang));
                3
            }
        },
        Command::Unresolved { .. } => match ws.unresolved() {
            Ok(un) if options.json => {
                out.stdout.push(json_object(
                    "unresolved",
                    un.iter().map(|u| {
                        format!(
                            "{{\"target\":{},\"count\":{}}}",
                            json_str(&u.target),
                            u.count
                        )
                    }),
                ));
                0
            }
            Ok(un) => {
                if un.is_empty() {
                    out.stdout.push(text(&Msg::NoUnresolved, lang));
                }
                for u in un {
                    out.stdout.push(text(
                        &Msg::UnresolvedLine {
                            target: u.target,
                            count: u.count,
                        },
                        lang,
                    ));
                }
                0
            }
            Err(e) => {
                out.stderr
                    .push(text(&Msg::IndexFailed(e.to_string()), lang));
                3
            }
        },
    };
    out
}

fn json_problem(p: &WalkProblem) -> String {
    match p {
        WalkProblem::Loop { path, first_seen } => format!(
            "{{\"kind\":\"loop\",\"path\":{},\"first_seen\":{}}}",
            json_str(path),
            json_str(first_seen)
        ),
        WalkProblem::Duplicate { path, first_seen } => format!(
            "{{\"kind\":\"duplicate\",\"path\":{},\"first_seen\":{}}}",
            json_str(path),
            json_str(first_seen)
        ),
        WalkProblem::TooDeep { path } => {
            format!("{{\"kind\":\"too_deep\",\"path\":{}}}", json_str(path))
        }
        WalkProblem::Io { path, kind, error } => format!(
            "{{\"kind\":\"io\",\"path\":{},\"io_kind\":{},\"error\":{}}}",
            json_str(path),
            json_str(kind),
            json_str(error)
        ),
    }
}

/// The space a folder takes (ADR 0075 item 4), from the walk the index
/// just made — the count the server and the app show.
struct Space {
    total: u64,
    notes: u64,
    attachments: u64,
    files: usize,
    index: u64,
}

fn space_of(ws: &Workspace) -> Space {
    let mut s = Space {
        total: 0,
        notes: 0,
        attachments: 0,
        files: 0,
        index: ws.index_bytes().unwrap_or(0),
    };
    for e in ws.entries() {
        match e.kind {
            verso_core::FileKind::Note => s.notes += e.len,
            verso_core::FileKind::File | verso_core::FileKind::Placeholder => {
                s.attachments += e.len
            }
            verso_core::FileKind::Folder => continue,
        }
        s.total += e.len;
        s.files += 1;
    }
    s
}

/// Bytes as a person reads them, the same in both languages.
fn human_bytes(n: u64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut v = n as f64;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if i == 0 {
        format!("{n} B")
    } else {
        format!("{v:.1} {}", units[i])
    }
}

fn json_index(r: &verso_core::IndexReport, space: &Space) -> String {
    format!(
        "{{\"indexed\":{},\"unchanged\":{},\"removed\":{},\"placeholders\":{},\"unreadable\":{},\"problems\":{},\"space\":{{\"total\":{},\"notes\":{},\"attachments\":{},\"files\":{},\"index\":{}}}}}",
        r.indexed,
        r.unchanged,
        r.removed,
        r.placeholders,
        json_array(r.unreadable.iter().map(|(p, e)| format!(
            "{{\"path\":{},\"error\":{}}}",
            json_str(p),
            json_str(e)
        ))),
        json_array(r.problems.iter().map(json_problem)),
        space.total,
        space.notes,
        space.attachments,
        space.files,
        space.index
    )
}

fn json_array(items: impl Iterator<Item = String>) -> String {
    format!("[{}]", items.collect::<Vec<_>>().join(","))
}

/// One JSON object per run (memo §6.3): `{"<key>":[...]}`.
fn json_object(key: &str, items: impl Iterator<Item = String>) -> String {
    format!("{{\"{key}\":{}}}", json_array(items))
}

/// A JSON string, quoted by hand: three shapes of output do not justify
/// a JSON dependency.
fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Write the lines; a closed pipe (`head -1`) is the reader's choice, not
/// a failure, so it ends the output quietly instead of panicking.
/// `verso serve` and `verso serve admin reset` (ADR 0073, 0074, 0075): the
/// configuration from the `VERSO_*` variables; the directories, when none
/// names them, under the user's configuration directory, and the window's
/// files where the packages put them, beside the binary.
fn serve(command: &Command, lang: Lang, mut out: Output) -> Output {
    let base = match verso_core::config_dir() {
        Ok(dir) => dir,
        Err(e) => {
            out.stderr.push(text(&open_error(&e), lang));
            return with_code(out, 3);
        }
    };
    // Where the packages put the window, beside the binary: UniVerso's
    // under share/universo (ADR 0078), the command line's under share/verso.
    let ui = std::env::current_exe()
        .ok()
        .and_then(|exe| {
            let share = if exe.file_stem().is_some_and(|s| s == "universo") {
                "../share/universo/ui"
            } else {
                "../share/verso/ui"
            };
            exe.parent().map(|bin| bin.join(share))
        })
        .unwrap_or_else(|| PathBuf::from("ui"));
    let defaults = verso_server::config::Defaults {
        data_dir: base.join("server"),
        folders_dir: base.join("server-folders"),
        ui_dir: ui,
    };
    let config = match verso_server::config::Config::from_env(
        &verso_server::config::ProcessEnv,
        &defaults,
    ) {
        // `--web` is the command line's, not the environment's.
        Ok(c) => verso_server::config::Config {
            web: matches!(command, Command::Serve { web: true }),
            ..c
        },
        Err(e) => {
            out.stderr
                .push(text(&Msg::ServeFailed(e.to_string()), lang));
            return with_code(out, 2);
        }
    };
    match command {
        Command::ServeAdminReset { email } => match verso_server::admin_reset(&config, email) {
            Ok(link) => out.stdout.push(text(&Msg::ResetLink(link), lang)),
            Err(e) => {
                out.stderr.push(text(&Msg::ServeFailed(e), lang));
                out.code = 3;
            }
        },
        _ => {
            if let Err(e) = verso_server::serve(config, env!("VERSO_COMMIT")) {
                out.stderr.push(text(&Msg::ServeFailed(e), lang));
                out.code = 3;
            }
        }
    }
    out
}

fn emit(mut sink: impl Write, lines: &[String]) {
    for line in lines {
        if writeln!(sink, "{line}").is_err() {
            return;
        }
    }
    let _ = sink.flush();
}

/// UniVerso is Verso as a server (ADR 0078): the binary started by that
/// name — the server's packages install it as `universo` — runs `verso
/// serve`, so `universo`, `universo --web` and `universo admin reset
/// <e-mail>` are the server's own commands; `--help` and `--version` stay
/// what they are.
fn as_invoked(program: Option<&std::ffi::OsStr>, args: Vec<OsString>) -> Vec<OsString> {
    let universo = program
        .and_then(|p| Path::new(p).file_stem())
        .is_some_and(|stem| stem == "universo");
    let asks_about_itself = args.first().is_some_and(|a| {
        matches!(
            a.to_str(),
            Some("--help" | "-h" | "help" | "--version" | "-V")
        )
    });
    if !universo || asks_about_itself {
        return args;
    }
    let mut serve = vec![OsString::from("serve")];
    serve.extend(args);
    serve
}

fn main() -> ExitCode {
    let mut all = std::env::args_os();
    let program = all.next();
    let args = as_invoked(program.as_deref(), all.collect());
    let out = run(&args);
    emit(std::io::stdout().lock(), &out.stdout);
    emit(std::io::stderr().lock(), &out.stderr);
    ExitCode::from(out.code)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
    }

    #[test]
    fn started_as_universo_it_is_the_server() {
        let as_universo =
            |list: &[&str]| as_invoked(Some(std::ffi::OsStr::new("/usr/bin/universo")), args(list));
        assert_eq!(as_universo(&[]), args(&["serve"]));
        assert_eq!(as_universo(&["--web"]), args(&["serve", "--web"]));
        assert_eq!(
            as_universo(&["admin", "reset", "a@b.co"]),
            args(&["serve", "admin", "reset", "a@b.co"])
        );
        assert_eq!(as_universo(&["--version"]), args(&["--version"]));
        assert_eq!(as_universo(&["--help"]), args(&["--help"]));
        // As verso, nothing changes.
        assert_eq!(
            as_invoked(Some(std::ffi::OsStr::new("verso")), args(&["index", "/v"])),
            args(&["index", "/v"])
        );
        let (_, c) = parse(&as_universo(&["--web"]));
        assert_eq!(c.unwrap(), Command::Serve { web: true });
    }

    #[test]
    fn parses_the_three_subcommands_and_the_options() {
        let (o, c) = parse(&args(&["index", "/v", "--json"]));
        assert_eq!(
            c.unwrap(),
            Command::Index {
                folder: "/v".into()
            }
        );
        assert!(o.json);
        let (_, c) = parse(&args(&[
            "search", "/v", "barão", "vermelho", "--limit", "5",
        ]));
        assert_eq!(
            c.unwrap(),
            Command::Search {
                folder: "/v".into(),
                words: "barão vermelho".into(),
                limit: 5
            }
        );
        let (o, c) = parse(&args(&["backlinks", "/v", "Taverna", "--lang", "pt-BR"]));
        assert_eq!(
            c.unwrap(),
            Command::Backlinks {
                folder: "/v".into(),
                note: "Taverna".into()
            }
        );
        assert_eq!(o.lang, Some(Lang::PtBr));
        let (_, c) = parse(&args(&["backlinks", "/v", "--unresolved"]));
        assert_eq!(
            c.unwrap(),
            Command::Unresolved {
                folder: "/v".into()
            }
        );
        assert_eq!(parse(&args(&["help"])).1.unwrap(), Command::Help);
        assert_eq!(parse(&args(&["--help"])).1.unwrap(), Command::Help);
        assert_eq!(parse(&args(&["-h"])).1.unwrap(), Command::Help);
        for form in ["--version", "-V"] {
            assert_eq!(parse(&args(&[form])).1.unwrap(), Command::Version);
        }
        assert_eq!(
            parse(&args(&["mcp", "/v"])).1.unwrap(),
            Command::Mcp {
                folder: "/v".into()
            }
        );
        assert_eq!(parse(&args(&["mcp"])).1.unwrap_err(), Msg::MissingFolder);
        // The key the app writes into an MCP client's configuration names
        // the folder in its place, for `mcp` only.
        assert_eq!(
            parse(&args(&["mcp", "--key", "Campanha-0123456789abcdef"]))
                .1
                .unwrap(),
            Command::McpKey {
                key: "Campanha-0123456789abcdef".into()
            }
        );
        assert_eq!(
            parse(&args(&["mcp", "--key", "k", "/v"])).1.unwrap_err(),
            Msg::ExtraArgument("/v".into())
        );
        assert_eq!(
            parse(&args(&["index", "--key", "k"])).1.unwrap_err(),
            Msg::ExtraArgument("--key".into())
        );
        assert_eq!(
            parse(&args(&["mcp", "--key"])).1.unwrap_err(),
            Msg::BadOptionValue("--key".into())
        );
        assert_eq!(parse(&args(&[])).1.unwrap_err(), Msg::Usage);
        assert_eq!(parse(&args(&["index"])).1.unwrap_err(), Msg::MissingFolder);
        assert_eq!(
            parse(&args(&["search", "/v"])).1.unwrap_err(),
            Msg::MissingQuery
        );
        assert_eq!(
            parse(&args(&["frob"])).1.unwrap_err(),
            Msg::UnknownSubcommand("frob".into())
        );
        // An option is read even when the command is wrong.
        let (o, c) = parse(&args(&["index", "--lang", "pt-BR"]));
        assert_eq!(
            (o.lang, c.unwrap_err()),
            (Some(Lang::PtBr), Msg::MissingFolder)
        );
    }

    #[test]
    fn refuses_unknown_options_bad_values_and_extra_arguments() {
        // `--limit castelos` must not eat a search word silently.
        assert_eq!(
            parse(&args(&["search", "/v", "dragoes", "--limit", "castelos"]))
                .1
                .unwrap_err(),
            Msg::BadOptionValue("--limit".into())
        );
        assert_eq!(
            parse(&args(&["index", "/v", "--limit"])).1.unwrap_err(),
            Msg::BadOptionValue("--limit".into())
        );
        assert_eq!(
            parse(&args(&["index", "/v", "--lang", "klingon"]))
                .1
                .unwrap_err(),
            Msg::BadOptionValue("--lang".into())
        );
        assert_eq!(
            parse(&args(&["index", "--foo", "/v"])).1.unwrap_err(),
            Msg::UnknownOption("--foo".into())
        );
        assert_eq!(
            parse(&args(&["index", "/v", "extra"])).1.unwrap_err(),
            Msg::ExtraArgument("extra".into())
        );
        assert_eq!(
            parse(&args(&["backlinks", "/v", "a", "b"])).1.unwrap_err(),
            Msg::ExtraArgument("b".into())
        );
        assert_eq!(
            parse(&args(&["index", "/v", "--unresolved"]))
                .1
                .unwrap_err(),
            Msg::ExtraArgument("--unresolved".into())
        );
        // The language is still read when an option is wrong.
        let (o, c) = parse(&args(&["index", "/v", "--foo", "--lang", "pt-BR"]));
        assert_eq!(
            (o.lang, c.unwrap_err()),
            (Some(Lang::PtBr), Msg::UnknownOption("--foo".into()))
        );
    }

    #[test]
    fn a_first_argument_that_names_a_directory_opens_it() {
        // The disk stood in for: these are the directories that exist.
        let dirs = |p: &Path| ["notas", ".", "index"].iter().any(|d| Path::new(d) == p);
        let parse = |list: &[&str]| parse_with(&args(list), dirs).1;
        assert_eq!(
            parse(&["notas"]).unwrap(),
            Command::Open {
                folder: "notas".into()
            }
        );
        assert_eq!(parse(&["."]).unwrap(), Command::Open { folder: ".".into() });
        // Neither a command nor a folder, also when it looks like a path.
        assert_eq!(
            parse(&["nao-existe"]).unwrap_err(),
            Msg::UnknownSubcommand("nao-existe".into())
        );
        assert_eq!(
            parse(&["./nao-existe"]).unwrap_err(),
            Msg::UnknownSubcommand("./nao-existe".into())
        );
        // A folder named like a subcommand: the subcommand wins; `open`
        // reaches the folder, and asks the disk nothing.
        assert_eq!(parse(&["index"]).unwrap_err(), Msg::MissingFolder);
        assert_eq!(
            parse(&["open", "index"]).unwrap(),
            Command::Open {
                folder: "index".into()
            }
        );
        assert_eq!(
            parse(&["open", "nao-existe"]).unwrap(),
            Command::Open {
                folder: "nao-existe".into()
            }
        );
        // `open` needs its folder and nothing more; so does `verso <folder>`.
        assert_eq!(parse(&["open"]).unwrap_err(), Msg::MissingFolder);
        assert_eq!(
            parse(&["open", "notas", "extra"]).unwrap_err(),
            Msg::ExtraArgument("extra".into())
        );
        assert_eq!(
            parse(&["notas", "extra"]).unwrap_err(),
            Msg::ExtraArgument("extra".into())
        );
        assert_eq!(
            parse(&["notas", "--unresolved"]).unwrap_err(),
            Msg::ExtraArgument("--unresolved".into())
        );
    }

    #[test]
    fn the_directory_check_asks_the_disk_through_verso_fs() {
        let dir = tempfile::tempdir().unwrap();
        let file = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
        let (_, c) = parse(&args(&[dir.path().to_str().unwrap()]));
        assert_eq!(
            c.unwrap(),
            Command::Open {
                folder: dir.path().to_path_buf()
            }
        );
        // A file that is neither Markdown nor structured data is not a
        // folder, and neither is a path to nowhere; a `.md` file opens,
        // without its folder (ADR 0114 item 8), and so does a data file
        // (item 34).
        let file = file.path().to_string_lossy().into_owned();
        assert_eq!(
            parse(&args(&[&file])).1.unwrap_err(),
            Msg::UnknownSubcommand(file)
        );
        let note = tempfile::Builder::new()
            .prefix("Nota")
            .suffix(".md")
            .tempfile_in(dir.path())
            .unwrap();
        assert_eq!(
            parse(&args(&[note.path().to_str().unwrap()])).1.unwrap(),
            Command::Open {
                folder: note.path().to_path_buf()
            }
        );
        for suffix in [".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".JSON"] {
            let data = tempfile::Builder::new()
                .prefix("dados")
                .suffix(suffix)
                .tempfile_in(dir.path())
                .unwrap();
            assert_eq!(
                parse(&args(&[data.path().to_str().unwrap()])).1.unwrap(),
                Command::Open {
                    folder: data.path().to_path_buf()
                },
                "{suffix}"
            );
        }
        let text = tempfile::Builder::new()
            .prefix("texto")
            .suffix(".txt")
            .tempfile_in(dir.path())
            .unwrap();
        let text = text.path().to_string_lossy().into_owned();
        assert_eq!(
            parse(&args(&[&text])).1.unwrap_err(),
            Msg::UnknownSubcommand(text)
        );
        let missing = dir.path().join("nao-existe").to_string_lossy().into_owned();
        assert_eq!(
            parse(&args(&[&missing])).1.unwrap_err(),
            Msg::UnknownSubcommand(missing)
        );
    }

    #[test]
    fn json_strings_are_escaped() {
        assert_eq!(json_str("a\"b\\c\nd"), "\"a\\\"b\\\\c\\nd\"");
        assert_eq!(json_object("hits", std::iter::empty()), "{\"hits\":[]}");
    }

    #[test]
    fn serve_takes_web_and_nothing_else_does() {
        let is_dir = |_: &Path| false;
        let (_, c) = parse_with(&args(&["serve", "--web"]), is_dir);
        assert_eq!(c, Ok(Command::Serve { web: true }));
        let (_, c) = parse_with(&args(&["serve"]), is_dir);
        assert_eq!(c, Ok(Command::Serve { web: false }));
        let (_, c) = parse_with(&args(&["index", "x", "--web"]), is_dir);
        assert_eq!(c, Err(Msg::ExtraArgument("--web".to_owned())));
    }
}
