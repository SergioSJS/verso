// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso index | search | backlinks` (Phase 1, feature 4; feature 7's
//! two languages come with it). The binary reads arguments and prints;
//! `verso-core` does the work (ADR 0026 rule 5). Provisional choices —
//! the subcommand-first shape, the exit codes, the JSON shape — are in
//! `docs/reference/cli-decision.md` for the maintainer.

mod messages;

use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

use messages::{Lang, Msg, text};
use verso_core::Workspace;

/// What the arguments asked for.
#[derive(Debug, PartialEq, Eq)]
enum Command {
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
}

#[derive(Debug, PartialEq, Eq)]
struct Options {
    json: bool,
    lang: Option<Lang>,
}

/// Parse `args` (without the program name). Options may appear anywhere
/// and are always read, so that an error about the command is printed in
/// the language the user asked for.
fn parse(args: &[OsString]) -> (Options, Result<Command, Msg>) {
    let mut json = false;
    let mut lang = None;
    let mut limit = 20usize;
    let mut unresolved = false;
    let mut positional: Vec<String> = Vec::new();
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
                lang = Some(match value.as_deref() {
                    Some(v) if v.starts_with("pt") => Lang::PtBr,
                    _ => Lang::En,
                });
            }
            "--limit" => {
                limit = iter
                    .next()
                    .and_then(|v| v.to_string_lossy().parse().ok())
                    .unwrap_or(limit);
            }
            _ => positional.push(s.into_owned()),
        }
    }
    let options = Options { json, lang };
    (options, command_of(positional, limit, unresolved))
}

fn command_of(positional: Vec<String>, limit: usize, unresolved: bool) -> Result<Command, Msg> {
    let mut positional = positional.into_iter();
    let Some(sub) = positional.next() else {
        return Err(Msg::Usage);
    };
    let folder = positional.next().map(PathBuf::from);
    let command = match sub.as_str() {
        "index" => Command::Index {
            folder: folder.ok_or(Msg::MissingFolder)?,
        },
        "search" => {
            let folder = folder.ok_or(Msg::MissingFolder)?;
            let words: Vec<String> = positional.collect();
            if words.is_empty() {
                return Err(Msg::MissingQuery);
            }
            Command::Search {
                folder,
                words: words.join(" "),
                limit,
            }
        }
        "backlinks" => {
            let folder = folder.ok_or(Msg::MissingFolder)?;
            if unresolved {
                Command::Unresolved { folder }
            } else {
                Command::Backlinks {
                    folder,
                    note: positional.next().ok_or(Msg::MissingNote)?,
                }
            }
        }
        "help" | "--help" | "-h" => return Err(Msg::Usage),
        other => return Err(Msg::UnknownSubcommand(other.to_owned())),
    };
    Ok(command)
}

/// Exit codes (provisional): 0 ok; 1 the run completed but reported
/// problems in the folder; 2 usage; 3 the folder or the index could not
/// be opened.
fn run(args: &[OsString]) -> (ExitCode, Vec<String>) {
    let (options, command) = parse(args);
    let lang = options.lang.unwrap_or_else(Lang::from_env);
    let command = match command {
        Ok(command) => command,
        Err(msg) => {
            let mut lines = vec![text(&msg, lang)];
            if msg != Msg::Usage {
                lines.push(text(&Msg::Usage, lang));
            }
            return (ExitCode::from(2), lines);
        }
    };
    let folder = match &command {
        Command::Index { folder }
        | Command::Search { folder, .. }
        | Command::Backlinks { folder, .. }
        | Command::Unresolved { folder } => folder.clone(),
    };
    let mut ws = match Workspace::open(&folder, None) {
        Ok(ws) => ws,
        Err(e) => {
            return (
                ExitCode::from(3),
                vec![text(&Msg::CannotOpen(e.to_string()), lang)],
            );
        }
    };
    let mut out = Vec::new();
    let code = match command {
        Command::Index { .. } => match ws.index() {
            Ok(r) => {
                if options.json {
                    out.push(json_index(&r));
                } else {
                    out.push(text(
                        &Msg::IndexSummary {
                            indexed: r.indexed,
                            unchanged: r.unchanged,
                            removed: r.removed,
                            placeholders: r.placeholders,
                        },
                        lang,
                    ));
                    for (p, e) in &r.unreadable {
                        out.push(text(&Msg::Unreadable(p.clone(), e.clone()), lang));
                    }
                    for p in &r.problems {
                        out.push(text(&Msg::WalkProblem(p.clone()), lang));
                    }
                }
                if r.unreadable.is_empty() && r.problems.is_empty() {
                    ExitCode::SUCCESS
                } else {
                    ExitCode::from(1)
                }
            }
            Err(e) => {
                out.push(text(&Msg::IndexFailed(e.to_string()), lang));
                ExitCode::from(3)
            }
        },
        Command::Search { words, limit, .. } => match ws.search(&words, limit) {
            Ok(hits) if options.json => {
                out.push(json_array(hits.iter().map(|h| {
                    format!(
                        "{{\"path\":{},\"snippet\":{}}}",
                        json_str(&h.path),
                        json_str(&h.snippet)
                    )
                })));
                ExitCode::SUCCESS
            }
            Ok(hits) => {
                if hits.is_empty() {
                    out.push(text(&Msg::NoHits, lang));
                }
                for h in hits {
                    out.push(text(
                        &Msg::HitLine {
                            path: h.path,
                            snippet: h.snippet,
                        },
                        lang,
                    ));
                }
                ExitCode::SUCCESS
            }
            Err(e) => {
                out.push(text(&Msg::IndexFailed(e.to_string()), lang));
                ExitCode::from(3)
            }
        },
        Command::Backlinks { note, .. } => match ws.backlinks(&note) {
            Ok(back) if options.json => {
                out.push(json_array(back.iter().map(|b| {
                    format!(
                        "{{\"from\":{},\"line\":{},\"col\":{},\"target\":{},\"embed\":{}}}",
                        json_str(&b.from),
                        b.line,
                        b.col,
                        json_str(&b.target),
                        b.embed
                    )
                })));
                ExitCode::SUCCESS
            }
            Ok(back) => {
                if back.is_empty() {
                    out.push(text(&Msg::NoBacklinks(note), lang));
                }
                for b in back {
                    out.push(text(
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
                ExitCode::SUCCESS
            }
            Err(e) => {
                out.push(text(&Msg::IndexFailed(e.to_string()), lang));
                ExitCode::from(3)
            }
        },
        Command::Unresolved { .. } => match ws.unresolved() {
            Ok(un) if options.json => {
                out.push(json_array(un.iter().map(|u| {
                    format!(
                        "{{\"target\":{},\"count\":{}}}",
                        json_str(&u.target),
                        u.count
                    )
                })));
                ExitCode::SUCCESS
            }
            Ok(un) => {
                if un.is_empty() {
                    out.push(text(&Msg::NoUnresolved, lang));
                }
                for u in un {
                    out.push(text(
                        &Msg::UnresolvedLine {
                            target: u.target,
                            count: u.count,
                        },
                        lang,
                    ));
                }
                ExitCode::SUCCESS
            }
            Err(e) => {
                out.push(text(&Msg::IndexFailed(e.to_string()), lang));
                ExitCode::from(3)
            }
        },
    };
    (code, out)
}

fn json_index(r: &verso_core::IndexReport) -> String {
    format!(
        "{{\"indexed\":{},\"unchanged\":{},\"removed\":{},\"placeholders\":{},\"unreadable\":{},\"problems\":{}}}",
        r.indexed,
        r.unchanged,
        r.removed,
        r.placeholders,
        json_array(r.unreadable.iter().map(|(p, e)| format!(
            "{{\"path\":{},\"error\":{}}}",
            json_str(p),
            json_str(e)
        ))),
        json_array(r.problems.iter().map(|p| json_str(p)))
    )
}

fn json_array(items: impl Iterator<Item = String>) -> String {
    format!("[{}]", items.collect::<Vec<_>>().join(","))
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

fn main() -> ExitCode {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let (code, lines) = run(&args);
    for line in lines {
        println!("{line}");
    }
    code
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
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
    fn json_strings_are_escaped() {
        assert_eq!(json_str("a\"b\\c\nd"), "\"a\\\"b\\\\c\\nd\"");
    }
}
