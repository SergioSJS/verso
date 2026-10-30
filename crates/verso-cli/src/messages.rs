// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Every user-facing message, in both languages (ADR 0035, feature 7). A
//! message is a variant of [`Msg`]; [`text`] renders it with one
//! exhaustive `match` per language, so a message that exists in one
//! language and not in the other does not compile. No loose string
//! literal reaches the output from anywhere else.

/// The two product languages (ADR 0035).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    PtBr,
    En,
}

impl Lang {
    /// From the environment: `VERSO_LANG`, then `LC_ALL`, `LC_MESSAGES`,
    /// `LANG`; a value starting with `pt` is pt-BR, anything else is
    /// English. Provisional (`docs/reference/cli-decision.md`).
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
    /// `verso <folder>`: the app, by its name ("Verso", or a test
    /// release's "Verso Beta"), is starting on the folder.
    Opening {
        folder: String,
        app: String,
    },
    /// `verso <folder>`: no app to start, by its name; what was tried.
    AppNotFound {
        app: String,
        tried: String,
    },
    /// `verso open <folder>`: nothing started, and no folder is there.
    NoFolderToOpen(String),
    /// A first argument that is neither a subcommand nor an existing folder.
    UnknownSubcommand(String),
    UnknownOption(String),
    /// An option whose value is missing or not what it takes.
    BadOptionValue(String),
    /// An argument the command does not take.
    ExtraArgument(String),
    MissingFolder,
    MissingQuery,
    MissingNote,
    NoConfigDir,
    CannotOpen(String),
    IndexSummary {
        indexed: usize,
        unchanged: usize,
        removed: usize,
        placeholders: usize,
    },
    Unreadable(String, String),
    ProblemLoop {
        path: String,
        first_seen: String,
    },
    ProblemDuplicate {
        path: String,
        first_seen: String,
    },
    ProblemTooDeep(String),
    ProblemIo {
        path: String,
        error: String,
    },
    NoHits,
    UnknownNote(String),
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
    /// A note found; a note found by its file name alone has no excerpt,
    /// and its line is the path.
    HitLine {
        path: String,
        snippet: String,
    },
    IndexFailed(String),
    /// The note asked for is not a path of the folder (absolute, `..`,
    /// hidden, ignored…): the asking was wrong, not the index.
    RefusedNote(String, String),
    /// `verso mcp` is up: said once, on stderr, before the first answer.
    McpServing {
        folder: String,
        indexed: usize,
        unchanged: usize,
    },
    McpFailed(String),
    /// `verso mcp --all` is up.
    McpServingAll,
    /// The space the folder takes, after an index run (ADR 0075 item 4).
    Space {
        total: String,
        notes: String,
        attachments: String,
        files: usize,
        index: String,
    },
    /// `verso serve` could not start, or stopped with an error.
    ServeFailed(String),
    /// `verso serve admin reset`: the link to give the account's owner.
    ResetLink(String),
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
  verso backlinks <pasta> <nota>       quem linka para a nota ou o board (caminho ou nome)
  verso backlinks <pasta> --unresolved alvos que nenhuma nota responde
  verso mcp <pasta>                    servidor MCP (stdio) só de leitura para um agente
  verso mcp --key <chave>              o mesmo, com a pasta pela chave que o app dá a ela
  verso mcp --all                      um servidor para as pastas visíveis para agentes
  verso serve [--web]                  o servidor (variáveis VERSO_*); --web serve também a janela ao navegador
  verso serve admin reset <e-mail>     um link para criar senha nova numa conta, aqui na máquina
  universo [--web]                     o mesmo servidor, pelo nome dele (o UniVerso); universo admin reset <e-mail>
  verso <pasta>                        abre a pasta no aplicativo (verso . = esta pasta)
  verso open <pasta>                   o mesmo, para uma pasta chamada como um comando
  verso help                           esta ajuda
  verso --version                      a versão e o commit

opções: --json (saída em JSON), --limit N (busca), --lang pt-BR|en
códigos de saída: 0 ok, 1 problemas na pasta reportados, 2 uso, 3 não abriu

mcp: o cliente que se conectar lê a pasta inteira (toda nota que o índice
lista); ainda não há como esconder um bloco ou uma nota. Escolha a pasta."
                .to_owned(),
            Msg::UnknownSubcommand(s) => {
                format!("comando desconhecido, e nenhuma pasta nem arquivo Markdown com esse nome: {s}")
            }
            Msg::UnknownOption(s) => format!("opção desconhecida: {s}"),
            Msg::BadOptionValue(s) => format!("valor inválido ou ausente para {s}"),
            Msg::ExtraArgument(s) => format!("argumento a mais: {s}"),
            Msg::MissingFolder => "falta a pasta".to_owned(),
            Msg::MissingQuery => "faltam as palavras da busca".to_owned(),
            Msg::MissingNote => "falta a nota (caminho relativo à pasta)".to_owned(),
            Msg::NoConfigDir => {
                "sem diretório de configuração: defina HOME (LOCALAPPDATA no Windows), XDG_CONFIG_HOME ou VERSO_CONFIG_DIR"
                    .to_owned()
            }
            Msg::CannotOpen(e) => format!("não abriu: {e}"),
            Msg::Opening { folder, app } => format!("abrindo {folder} no {app}"),
            Msg::AppNotFound { app, tried } => format!(
                "não achei o aplicativo {app} ({tried}). Defina VERSO_APP com o caminho do executável ou instale o app."
            ),
            Msg::NoFolderToOpen(folder) => {
                format!("não há pasta nem arquivo Markdown em {folder}")
            }
            Msg::IndexSummary {
                indexed,
                unchanged,
                removed,
                placeholders,
            } => format!(
                "indexadas {indexed}, sem mudança {unchanged}, removidas {removed}, placeholders presentes {placeholders}"
            ),
            Msg::Unreadable(p, e) => format!("não lida: {p}: {e}"),
            Msg::ProblemLoop { path, first_seen } => {
                format!("problema: {path}: symlink em laço, volta a {first_seen}; não entrou")
            }
            Msg::ProblemDuplicate { path, first_seen } => {
                format!("problema: {path}: mesma pasta que {first_seen}; percorrida uma vez")
            }
            Msg::ProblemTooDeep(p) => format!("problema: {p}: fundo demais; não entrou"),
            Msg::ProblemIo { path, error } => {
                format!("problema: {path}: não examinada ({error}); nada abaixo foi removido")
            }
            Msg::NoHits => "nenhuma nota encontrada".to_owned(),
            Msg::UnknownNote(n) => format!("nota desconhecida: {n} (indexe a pasta?)"),
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
            Msg::HitLine { path, snippet } if snippet.is_empty() => path.clone(),
            Msg::HitLine { path, snippet } => format!("{path}: {snippet}"),
            Msg::IndexFailed(e) => format!("indexação falhou: {e}"),
            Msg::RefusedNote(note, why) => format!("nota recusada: {note} — {why}"),
            Msg::McpServing {
                folder,
                indexed,
                unchanged,
            } => format!(
                "verso mcp: servindo {folder} (indexadas {indexed}, sem mudança {unchanged}); aguardando o cliente"
            ),
            Msg::McpFailed(e) => format!("verso mcp falhou: {e}"),
            Msg::McpServingAll => "verso mcp: atende as pastas visíveis para agentes; esperando o cliente".to_owned(),
            Msg::ServeFailed(e) => format!("verso serve falhou: {e}"),
            Msg::Space { total, notes, attachments, files, index } => format!(
                "espaço: {total} — notas {notes}, anexos {attachments}, {files} arquivos; índice {index}"
            ),
            Msg::ResetLink(link) => format!(
                "as sessões da conta terminaram; o link para criar uma senha nova (vale 24 horas, uma vez):\n{link}"
            ),
        },
        Lang::En => match msg {
            Msg::Usage => "\
usage: verso <command> <folder> [...]

  verso index <folder>                 index the folder (again: only what changed)
  verso search <folder> <words...>     search the notes' text
  verso backlinks <folder> <note>      who links to the note or board (path or name)
  verso backlinks <folder> --unresolved targets no note answers to
  verso mcp <folder>                   read-only MCP server (stdio) for an agent
  verso mcp --key <key>                the same, the folder named by the key the app gives it
  verso mcp --all                      one server for the folders visible to agents
  verso serve [--web]                  the server (VERSO_* variables); --web serves the window to a browser too
  verso serve admin reset <e-mail>     a link to set a new password for an account, on this machine
  universo [--web]                     the same server, by its name (UniVerso); universo admin reset <e-mail>
  verso <folder>                       open the folder in the app (verso . = this one)
  verso open <folder>                  the same, for a folder named like a command
  verso help                           this help
  verso --version                      the version and the commit

options: --json (JSON output), --limit N (search), --lang pt-BR|en
exit codes: 0 ok, 1 problems in the folder reported, 2 usage, 3 could not open

mcp: the client that connects reads the whole folder (every note the index
lists); there is no way to hide a block or a note yet. Choose the folder."
                .to_owned(),
            Msg::UnknownSubcommand(s) => {
                format!("unknown command, and no folder or Markdown file by that name: {s}")
            }
            Msg::UnknownOption(s) => format!("unknown option: {s}"),
            Msg::BadOptionValue(s) => format!("missing or invalid value for {s}"),
            Msg::ExtraArgument(s) => format!("unexpected argument: {s}"),
            Msg::MissingFolder => "missing the folder".to_owned(),
            Msg::MissingQuery => "missing the search words".to_owned(),
            Msg::MissingNote => "missing the note (path relative to the folder)".to_owned(),
            Msg::NoConfigDir => {
                "no configuration directory: set HOME (LOCALAPPDATA on Windows), XDG_CONFIG_HOME or VERSO_CONFIG_DIR"
                    .to_owned()
            }
            Msg::CannotOpen(e) => format!("could not open: {e}"),
            Msg::Opening { folder, app } => format!("opening {folder} in {app}"),
            Msg::AppNotFound { app, tried } => format!(
                "could not find the {app} application ({tried}). Set VERSO_APP to the executable or install the app."
            ),
            Msg::NoFolderToOpen(folder) => format!("no folder or Markdown file at {folder}"),
            Msg::IndexSummary {
                indexed,
                unchanged,
                removed,
                placeholders,
            } => format!(
                "indexed {indexed}, unchanged {unchanged}, removed {removed}, placeholders present {placeholders}"
            ),
            Msg::Unreadable(p, e) => format!("unreadable: {p}: {e}"),
            Msg::ProblemLoop { path, first_seen } => {
                format!("problem: {path}: symlink loop back to {first_seen}; not entered")
            }
            Msg::ProblemDuplicate { path, first_seen } => {
                format!("problem: {path}: same directory as {first_seen}; walked once")
            }
            Msg::ProblemTooDeep(p) => format!("problem: {p}: nested too deep; not entered"),
            Msg::ProblemIo { path, error } => {
                format!(
                    "problem: {path}: could not be examined ({error}); nothing under it was removed"
                )
            }
            Msg::NoHits => "no note found".to_owned(),
            Msg::UnknownNote(n) => format!("unknown note: {n} (index the folder?)"),
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
            Msg::HitLine { path, snippet } if snippet.is_empty() => path.clone(),
            Msg::HitLine { path, snippet } => format!("{path}: {snippet}"),
            Msg::IndexFailed(e) => format!("indexing failed: {e}"),
            Msg::RefusedNote(note, why) => format!("note refused: {note} — {why}"),
            Msg::McpServing {
                folder,
                indexed,
                unchanged,
            } => format!(
                "verso mcp: serving {folder} (indexed {indexed}, unchanged {unchanged}); waiting for the client"
            ),
            Msg::McpFailed(e) => format!("verso mcp failed: {e}"),
            Msg::McpServingAll => "verso mcp: serving the folders visible to agents; waiting for the client".to_owned(),
            Msg::ServeFailed(e) => format!("verso serve failed: {e}"),
            Msg::Space { total, notes, attachments, files, index } => format!(
                "space: {total} — notes {notes}, attachments {attachments}, {files} files; index {index}"
            ),
            Msg::ResetLink(link) => format!(
                "the account's sessions ended; the link to set a new password (valid 24 hours, once):\n{link}"
            ),
        },
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_note_found_by_its_name_alone_is_its_path_without_a_colon() {
        for lang in [super::Lang::PtBr, super::Lang::En] {
            let line = |snippet: &str| {
                super::text(
                    &super::Msg::HitLine {
                        path: "Mapa do Porto.md".into(),
                        snippet: snippet.into(),
                    },
                    lang,
                )
            };
            assert_eq!(line(""), "Mapa do Porto.md");
            assert_eq!(line("o [mapa]"), "Mapa do Porto.md: o [mapa]");
        }
    }

    use super::*;

    /// One of every variant, so both `match` arms are exercised and a
    /// language that lags the other is caught here as well as by the
    /// compiler. [`covers_every_variant`] keeps this list complete.
    fn every() -> Vec<Msg> {
        vec![
            Msg::Usage,
            Msg::UnknownSubcommand("x".into()),
            Msg::UnknownOption("--x".into()),
            Msg::BadOptionValue("--limit".into()),
            Msg::ExtraArgument("x".into()),
            Msg::MissingFolder,
            Msg::MissingQuery,
            Msg::MissingNote,
            Msg::NoConfigDir,
            Msg::CannotOpen("e".into()),
            Msg::IndexSummary {
                indexed: 1,
                unchanged: 2,
                removed: 3,
                placeholders: 4,
            },
            Msg::Unreadable("p".into(), "e".into()),
            Msg::ProblemLoop {
                path: "a/b".into(),
                first_seen: "a".into(),
            },
            Msg::ProblemDuplicate {
                path: "b".into(),
                first_seen: "a".into(),
            },
            Msg::ProblemTooDeep("p".into()),
            Msg::ProblemIo {
                path: "p".into(),
                error: "e".into(),
            },
            Msg::NoHits,
            Msg::UnknownNote("n".into()),
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
            Msg::RefusedNote("../x".into(), "w".into()),
            Msg::McpServing {
                folder: "/v".into(),
                indexed: 1,
                unchanged: 2,
            },
            Msg::McpFailed("e".into()),
            Msg::McpServingAll,
            Msg::ServeFailed("e".into()),
            Msg::Space {
                total: "1 KB".into(),
                notes: "1 KB".into(),
                attachments: "0 B".into(),
                files: 1,
                index: "4 KB".into(),
            },
            Msg::ResetLink("http://x/reset/y".into()),
            Msg::Opening {
                folder: "/v".into(),
                app: "Verso Beta".into(),
            },
            Msg::AppNotFound {
                app: "Verso Beta".into(),
                tried: "e".into(),
            },
            Msg::NoFolderToOpen("/v".into()),
        ]
    }

    /// Each variant maps to its own number; a variant added to the enum
    /// without a sample in `every()` leaves a hole in the sequence.
    fn ordinal(msg: &Msg) -> usize {
        match msg {
            Msg::Usage => 0,
            Msg::UnknownSubcommand(_) => 1,
            Msg::UnknownOption(_) => 2,
            Msg::BadOptionValue(_) => 3,
            Msg::ExtraArgument(_) => 4,
            Msg::MissingFolder => 5,
            Msg::MissingQuery => 6,
            Msg::MissingNote => 7,
            Msg::NoConfigDir => 8,
            Msg::CannotOpen(_) => 9,
            Msg::IndexSummary { .. } => 10,
            Msg::Unreadable(..) => 11,
            Msg::ProblemLoop { .. } => 12,
            Msg::ProblemDuplicate { .. } => 13,
            Msg::ProblemTooDeep(_) => 14,
            Msg::ProblemIo { .. } => 15,
            Msg::NoHits => 16,
            Msg::UnknownNote(_) => 17,
            Msg::NoBacklinks(_) => 18,
            Msg::NoUnresolved => 19,
            Msg::BacklinkLine { .. } => 20,
            Msg::UnresolvedLine { .. } => 21,
            Msg::HitLine { .. } => 22,
            Msg::IndexFailed(_) => 23,
            Msg::McpServing { .. } => 24,
            Msg::McpFailed(_) => 25,
            Msg::McpServingAll => 30,
            Msg::ServeFailed(_) => 31,
            Msg::ResetLink(_) => 32,
            Msg::Space { .. } => 33,
            Msg::Opening { .. } => 26,
            Msg::AppNotFound { .. } => 27,
            Msg::NoFolderToOpen(_) => 28,
            Msg::RefusedNote(..) => 29,
        }
    }

    #[test]
    fn covers_every_variant() {
        let mut seen: Vec<usize> = every().iter().map(ordinal).collect();
        seen.sort_unstable();
        // `ordinal` is exhaustive, so its highest arm is the variant count
        // minus one; the samples must reach it without a gap.
        let expected: Vec<usize> = (0..=33).collect();
        assert_eq!(seen, expected, "a variant has no sample in every()");
    }

    /// The command line says which app it opens: a test release's, "Verso
    /// Beta", by that name (ADR 0051).
    #[test]
    fn opening_names_the_app() {
        let msg = Msg::Opening {
            folder: "/v".into(),
            app: "Verso Beta".into(),
        };
        assert_eq!(text(&msg, Lang::En), "opening /v in Verso Beta");
        assert_eq!(text(&msg, Lang::PtBr), "abrindo /v no Verso Beta");
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
