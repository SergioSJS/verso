// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Every string the user sees, in pt-BR and EN (ADR 0035). A message is
//! an id with its data; `text` renders it in one language. The `match`
//! is exhaustive per language, so a message missing in one language does
//! not compile. Nothing else in the binary prints a literal.

/// The two product languages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    PtBr,
    En,
}

impl Lang {
    /// From the environment: `VERSO_LANG`, then `LC_ALL`, `LC_MESSAGES`,
    /// `LANG`; `pt_BR`/`pt-BR`/`pt` → pt-BR, anything else → EN.
    #[must_use]
    pub fn from_env() -> Self {
        for var in ["VERSO_LANG", "LC_ALL", "LC_MESSAGES", "LANG"] {
            if let Some(value) = std::env::var_os(var) {
                let value = value.to_string_lossy().to_ascii_lowercase();
                if value.is_empty() {
                    continue;
                }
                return if value.starts_with("pt") {
                    Self::PtBr
                } else {
                    Self::En
                };
            }
        }
        Self::En
    }
}

/// Everything the command can say.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Msg {
    Usage,
    UnknownSubcommand(String),
    MissingFolder,
    MissingQuery,
    MissingNote,
    CannotOpen(String),
    IndexSummary {
        indexed: usize,
        unchanged: usize,
        removed: usize,
        placeholders: usize,
    },
    Unreadable(String, String),
    WalkProblem(String),
    NoHits,
    NoBacklinks(String),
    NoUnresolved,
    BacklinkLine {
        from: String,
        line: u32,
        col: u32,
        target: String,
        embed: bool,
    },
    UnresolvedLine {
        target: String,
        count: u64,
    },
    HitLine {
        path: String,
        snippet: String,
    },
    IndexFailed(String),
}

/// The text of a message in a language.
#[must_use]
pub fn text(msg: &Msg, lang: Lang) -> String {
    match lang {
        Lang::PtBr => match msg {
            Msg::Usage => "\
uso: verso <comando> <pasta> [...]

  verso index <pasta>                  indexa a pasta (de novo: só o que mudou)
  verso search <pasta> <palavras...>   busca no texto das notas
  verso backlinks <pasta> <nota>       quem linka para a nota
  verso backlinks <pasta> --unresolved alvos que nenhuma nota responde

opções: --json (saída em JSON), --limit N (busca), --lang pt-BR|en
códigos de saída: 0 ok, 1 problemas na pasta reportados, 2 uso, 3 não abriu"
                .to_owned(),
            Msg::UnknownSubcommand(s) => format!("comando desconhecido: {s}"),
            Msg::MissingFolder => "falta a pasta".to_owned(),
            Msg::MissingQuery => "faltam as palavras da busca".to_owned(),
            Msg::MissingNote => "falta a nota (caminho relativo à pasta)".to_owned(),
            Msg::CannotOpen(e) => format!("não abriu: {e}"),
            Msg::IndexSummary {
                indexed,
                unchanged,
                removed,
                placeholders,
            } => format!(
                "indexadas {indexed}, sem mudança {unchanged}, removidas {removed}, placeholders presentes {placeholders}"
            ),
            Msg::Unreadable(p, e) => format!("não lida: {p}: {e}"),
            Msg::WalkProblem(p) => format!("problema: {p}"),
            Msg::NoHits => "nenhuma nota encontrada".to_owned(),
            Msg::NoBacklinks(n) => format!("nenhum backlink para {n}"),
            Msg::NoUnresolved => "nenhum alvo sem nota".to_owned(),
            Msg::BacklinkLine {
                from,
                line,
                col,
                target,
                embed,
            } => format!(
                "{from}: {line}:{col}  {}[[{target}]]",
                if *embed { "!" } else { "" }
            ),
            Msg::UnresolvedLine { target, count } => format!("{target}  ({count})"),
            Msg::HitLine { path, snippet } => format!("{path}: {snippet}"),
            Msg::IndexFailed(e) => format!("indexação falhou: {e}"),
        },
        Lang::En => match msg {
            Msg::Usage => "\
usage: verso <command> <folder> [...]

  verso index <folder>                 index the folder (again: only what changed)
  verso search <folder> <words...>     search the notes' text
  verso backlinks <folder> <note>      who links to the note
  verso backlinks <folder> --unresolved targets no note answers to

options: --json (JSON output), --limit N (search), --lang pt-BR|en
exit codes: 0 ok, 1 problems in the folder reported, 2 usage, 3 could not open"
                .to_owned(),
            Msg::UnknownSubcommand(s) => format!("unknown command: {s}"),
            Msg::MissingFolder => "missing the folder".to_owned(),
            Msg::MissingQuery => "missing the search words".to_owned(),
            Msg::MissingNote => "missing the note (path relative to the folder)".to_owned(),
            Msg::CannotOpen(e) => format!("could not open: {e}"),
            Msg::IndexSummary {
                indexed,
                unchanged,
                removed,
                placeholders,
            } => format!(
                "indexed {indexed}, unchanged {unchanged}, removed {removed}, placeholders present {placeholders}"
            ),
            Msg::Unreadable(p, e) => format!("unreadable: {p}: {e}"),
            Msg::WalkProblem(p) => format!("problem: {p}"),
            Msg::NoHits => "no note found".to_owned(),
            Msg::NoBacklinks(n) => format!("no backlinks to {n}"),
            Msg::NoUnresolved => "no unresolved targets".to_owned(),
            Msg::BacklinkLine {
                from,
                line,
                col,
                target,
                embed,
            } => format!(
                "{from}: {line}:{col}  {}[[{target}]]",
                if *embed { "!" } else { "" }
            ),
            Msg::UnresolvedLine { target, count } => format!("{target}  ({count})"),
            Msg::HitLine { path, snippet } => format!("{path}: {snippet}"),
            Msg::IndexFailed(e) => format!("indexing failed: {e}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One of every variant, so both `match` arms are exercised and a
    /// language that lags the other is caught here as well as by the
    /// compiler.
    fn every() -> Vec<Msg> {
        vec![
            Msg::Usage,
            Msg::UnknownSubcommand("x".into()),
            Msg::MissingFolder,
            Msg::MissingQuery,
            Msg::MissingNote,
            Msg::CannotOpen("e".into()),
            Msg::IndexSummary {
                indexed: 1,
                unchanged: 2,
                removed: 3,
                placeholders: 4,
            },
            Msg::Unreadable("p".into(), "e".into()),
            Msg::WalkProblem("p".into()),
            Msg::NoHits,
            Msg::NoBacklinks("n".into()),
            Msg::NoUnresolved,
            Msg::BacklinkLine {
                from: "a.md".into(),
                line: 1,
                col: 2,
                target: "b".into(),
                embed: true,
            },
            Msg::UnresolvedLine {
                target: "t".into(),
                count: 2,
            },
            Msg::HitLine {
                path: "p".into(),
                snippet: "s".into(),
            },
            Msg::IndexFailed("e".into()),
        ]
    }

    #[test]
    fn every_message_exists_in_both_languages_and_they_differ() {
        for msg in every() {
            let pt = text(&msg, Lang::PtBr);
            let en = text(&msg, Lang::En);
            assert!(!pt.is_empty() && !en.is_empty(), "{msg:?}");
            // Data-only lines are the same in both; the rest must differ.
            if !matches!(
                msg,
                Msg::BacklinkLine { .. } | Msg::UnresolvedLine { .. } | Msg::HitLine { .. }
            ) {
                assert_ne!(pt, en, "{msg:?} is not translated");
            }
        }
    }
}
