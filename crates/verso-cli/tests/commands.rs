// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The binary end to end: a vault built with `tempfile`, the three
//! subcommands, both languages, JSON, exit codes. The configuration
//! directory is a temporary one through `VERSO_CONFIG_DIR`.

use std::io::Write;
use std::path::Path;
use std::process::Command;

use tempfile::{Builder, NamedTempFile};

#[cfg(test)]
mod support {
    use super::*;

    pub fn note(dir: &Path, name: &str, content: &str) -> NamedTempFile {
        let mut file = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempfile_in(dir)
            .unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();
        file
    }

    /// Exit code, stdout, stderr.
    pub fn verso(config: &Path, lang: &str, args: &[&str]) -> (i32, String, String) {
        verso_in(None, config, lang, args)
    }

    /// A program that starts, takes an argument and quits, standing in for
    /// the app: `true` on Unix, `whoami` on Windows (ADR 0069).
    pub fn stand_in_app() -> std::ffi::OsString {
        #[cfg(unix)]
        return "/usr/bin/true".into();
        #[cfg(windows)]
        return std::path::Path::new(&std::env::var_os("SystemRoot").unwrap())
            .join("System32")
            .join("whoami.exe")
            .into_os_string();
    }

    /// The same, run from `cwd` when given. `VERSO_APP` names a stand-in
    /// that quits at once, so that a test which reaches `verso <folder>`
    /// starts nothing on the developer's machine: what is checked is what
    /// the CLI says.
    pub fn verso_in(
        cwd: Option<&Path>,
        config: &Path,
        lang: &str,
        args: &[&str],
    ) -> (i32, String, String) {
        let mut command = Command::new(env!("CARGO_BIN_EXE_verso"));
        if let Some(dir) = cwd {
            command.current_dir(dir);
        }
        let out = command
            .args(args)
            .env("VERSO_CONFIG_DIR", config)
            .env("VERSO_LANG", lang)
            .env("VERSO_APP", stand_in_app())
            .output()
            .unwrap();
        (
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stdout).into_owned(),
            String::from_utf8_lossy(&out.stderr).into_owned(),
        )
    }
}
use support::*;

#[test]
fn index_search_and_backlinks_in_both_languages() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _a = note(
        vault.path(),
        "Taverna.md",
        "# Taverna\n\nO [[Barão Vermelho]] bebe aqui. ![[Mapa.png]]\n",
    );
    let _b = note(
        vault.path(),
        "Barão Vermelho.md",
        "Governa o distrito norte.\n",
    );
    let v = vault.path().to_str().unwrap();

    let (code, out, err) = verso(config.path(), "pt_BR", &["index", v]);
    assert_eq!(code, 0, "{out}{err}");
    let mut lines = out.trim().lines();
    assert_eq!(
        lines.next(),
        Some("indexadas 2, sem mudança 0, removidas 0, placeholders presentes 0")
    );
    // The space the folder takes (ADR 0075 item 4).
    let space = lines.next().unwrap_or_default();
    assert!(
        space.starts_with("espaço: 84 B — notas 84 B, anexos 0 B, 2 arquivos; índice "),
        "{space}"
    );
    assert!(err.is_empty(), "{err}");

    let (code, out, _) = verso(config.path(), "en", &["index", v]);
    assert_eq!(code, 0);
    assert_eq!(
        out.trim().lines().next(),
        Some("indexed 0, unchanged 2, removed 0, placeholders present 0")
    );
    assert!(out.contains("space: 84 B — notes 84 B"), "{out}");

    let (code, out, _) = verso(config.path(), "en", &["backlinks", v, "Barão Vermelho"]);
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "Taverna.md: 3:3  [[Barão Vermelho]]");

    // A note the index does not know is said so, on stderr.
    let (code, out, err) = verso(config.path(), "pt_BR", &["backlinks", v, "Nada"]);
    assert_eq!(code, 0);
    assert!(out.is_empty(), "{out}");
    assert_eq!(err.trim(), "nota desconhecida: Nada (indexe a pasta?)");

    // A note path that leaves the folder is refused as such, not as a
    // failed index (exit 2, usage).
    let (code, _, err) = verso(config.path(), "en", &["backlinks", v, "../fora"]);
    assert_eq!(code, 2, "{err}");
    assert!(err.contains("note refused: ../fora"), "{err}");
    let (code, out, _) = verso(config.path(), "en", &["backlinks", v, "--unresolved"]);
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "Mapa.png  (1)");

    let (code, out, _) = verso(config.path(), "en", &["search", v, "DISTRITO"]);
    assert_eq!(code, 0);
    assert!(out.starts_with("Barão Vermelho.md: "), "{out}");

    // One JSON object per run (memo §6.3).
    let (code, out, _) = verso(config.path(), "en", &["search", v, "distrito", "--json"]);
    assert_eq!(code, 0);
    assert!(
        out.trim()
            .starts_with("{\"hits\":[{\"path\":\"Barão Vermelho.md\",\"snippet\":"),
        "{out}"
    );

    let (code, out, _) = verso(
        config.path(),
        "en",
        &["backlinks", v, "Barão Vermelho", "--json"],
    );
    assert_eq!(code, 0);
    assert_eq!(
        out.trim(),
        "{\"backlinks\":[{\"from\":\"Taverna.md\",\"line\":3,\"col\":3,\"target\":\"Barão Vermelho\",\"embed\":false}]}"
    );
    let (code, out, _) = verso(
        config.path(),
        "en",
        &["backlinks", v, "--unresolved", "--json"],
    );
    assert_eq!(code, 0);
    assert_eq!(
        out.trim(),
        "{\"unresolved\":[{\"target\":\"Mapa.png\",\"count\":1}]}"
    );
}

#[test]
fn usage_and_open_errors_have_their_exit_codes_and_go_to_stderr() {
    let config = tempfile::tempdir().unwrap();
    let (code, out, err) = verso(config.path(), "en", &[]);
    assert_eq!(code, 2);
    assert!(out.is_empty(), "{out}");
    assert!(err.starts_with("usage: verso"), "{err}");
    // Asking for help is not an error.
    let (code, out, err) = verso(config.path(), "en", &["help"]);
    assert_eq!(code, 0);
    assert!(out.starts_with("usage: verso"), "{out}");
    assert!(err.is_empty(), "{err}");
    // Nor is asking for the version: the workspace's, and a commit.
    for form in ["--version", "-V"] {
        let (code, out, err) = verso(config.path(), "pt_BR", &[form]);
        assert_eq!(code, 0, "{form}");
        let expected = format!("verso {} (", env!("CARGO_PKG_VERSION"));
        assert!(
            out.starts_with(&expected) && out.trim_end().ends_with(')'),
            "{out}"
        );
        assert!(err.is_empty(), "{err}");
    }
    let (code, _, err) = verso(config.path(), "pt_BR", &["frob"]);
    assert_eq!(code, 2);
    assert!(
        err.starts_with(
            "comando desconhecido, e nenhuma pasta, arquivo Markdown ou arquivo de dados com esse nome: frob"
        ),
        "{err}"
    );
    let (code, _, err) = verso(config.path(), "en", &["index", "/nowhere/at/all"]);
    assert_eq!(code, 3);
    assert!(err.starts_with("could not open:"), "{err}");
    // --lang overrides the environment.
    let (code, _, err) = verso(config.path(), "en", &["index", "--lang", "pt-BR"]);
    assert_eq!(code, 2);
    assert!(err.starts_with("falta a pasta"), "{err}");
    // A bad option value never changes the answer silently.
    let (code, out, err) = verso(
        config.path(),
        "en",
        &["search", "/v", "dragoes", "--limit", "castelos", "--json"],
    );
    assert_eq!(code, 2);
    assert!(out.is_empty(), "{out}");
    assert!(
        err.starts_with("missing or invalid value for --limit"),
        "{err}"
    );
    // No configuration directory at all: an error, not a relative path.
    let vault = tempfile::tempdir().unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_verso"))
        .arg("index")
        .arg(vault.path())
        .env_remove("VERSO_CONFIG_DIR")
        .env_remove("XDG_CONFIG_HOME")
        .env_remove("HOME")
        .env_remove("LOCALAPPDATA")
        .env("VERSO_LANG", "en")
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(3));
    assert!(
        String::from_utf8_lossy(&out.stderr).starts_with("no configuration directory"),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn a_first_argument_that_names_a_directory_opens_it_and_open_needs_its_folder() {
    let config = tempfile::tempdir().unwrap();
    let cwd = tempfile::tempdir().unwrap();
    // Two directories in the working directory: `notas`, and `index`,
    // named like a subcommand.
    let _notas = Builder::new()
        .prefix("notas")
        .rand_bytes(0)
        .tempdir_in(cwd.path())
        .unwrap();
    let _index = Builder::new()
        .prefix("index")
        .rand_bytes(0)
        .tempdir_in(cwd.path())
        .unwrap();
    let here = Some(cwd.path());

    // An existing directory — by name, as `.`, by its absolute path — is
    // opened; the CLI says so on stderr, stdout stays empty.
    let (code, out, err) = verso_in(here, config.path(), "en", &["notas"]);
    assert_eq!(code, 0, "{err}");
    assert!(out.is_empty(), "{out}");
    assert!(
        err.starts_with("opening ") && err.contains("notas"),
        "{err}"
    );
    let (code, _, err) = verso_in(here, config.path(), "en", &["."]);
    assert_eq!(code, 0, "{err}");
    assert!(err.starts_with("opening "), "{err}");
    let (code, _, err) = verso(config.path(), "en", &[cwd.path().to_str().unwrap()]);
    assert_eq!(code, 0, "{err}");
    assert!(err.starts_with("opening "), "{err}");
    // A directory that is not there is neither a command nor a folder: a
    // usage error naming the set, also when the argument looks like a path.
    for missing in ["nao-existe", "./nao-existe"] {
        let (code, out, err) = verso_in(here, config.path(), "en", &[missing]);
        assert_eq!(code, 2, "{missing}: {err}");
        assert!(out.is_empty(), "{out}");
        assert!(
            err.starts_with(&format!(
                "unknown command, and no folder, Markdown file or data file by that name: {missing}"
            )),
            "{err}"
        );
        assert!(err.contains("usage: verso"), "{err}");
    }
    // A folder named like a subcommand: the subcommand wins; `open` is the
    // way to the folder.
    let (code, _, err) = verso_in(here, config.path(), "en", &["index"]);
    assert_eq!(code, 2, "{err}");
    assert!(err.starts_with("missing the folder"), "{err}");
    let (code, _, err) = verso_in(here, config.path(), "en", &["open", "index"]);
    assert_eq!(code, 0, "{err}");
    assert!(
        err.starts_with("opening ") && err.contains("index"),
        "{err}"
    );
    // `open` alone: there is no default folder.
    let (code, _, err) = verso_in(here, config.path(), "pt_BR", &["open"]);
    assert_eq!(code, 2, "{err}");
    assert!(err.starts_with("falta a pasta"), "{err}");
}
