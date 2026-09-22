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

    pub fn verso(config: &Path, lang: &str, args: &[&str]) -> (i32, String) {
        let out = Command::new(env!("CARGO_BIN_EXE_verso"))
            .args(args)
            .env("VERSO_CONFIG_DIR", config)
            .env("VERSO_LANG", lang)
            .output()
            .unwrap();
        (
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stdout).into_owned(),
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

    let (code, out) = verso(config.path(), "pt_BR", &["index", v]);
    assert_eq!(code, 0, "{out}");
    assert_eq!(
        out.trim(),
        "indexadas 2, sem mudança 0, removidas 0, placeholders presentes 0"
    );

    let (code, out) = verso(config.path(), "en", &["index", v]);
    assert_eq!(code, 0);
    assert_eq!(
        out.trim(),
        "indexed 0, unchanged 2, removed 0, placeholders present 0"
    );

    let (code, out) = verso(config.path(), "en", &["backlinks", v, "Barão Vermelho"]);
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "Taverna.md: 3:3  [[Barão Vermelho]]");

    let (code, out) = verso(config.path(), "pt_BR", &["backlinks", v, "Nada"]);
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "nenhum backlink para Nada");

    let (code, out) = verso(config.path(), "en", &["backlinks", v, "--unresolved"]);
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "Mapa.png  (1)");

    let (code, out) = verso(config.path(), "en", &["search", v, "DISTRITO"]);
    assert_eq!(code, 0);
    assert!(out.starts_with("Barão Vermelho.md: "), "{out}");

    let (code, out) = verso(config.path(), "en", &["search", v, "distrito", "--json"]);
    assert_eq!(code, 0);
    assert!(
        out.trim()
            .starts_with("[{\"path\":\"Barão Vermelho.md\",\"snippet\":"),
        "{out}"
    );

    let (code, out) = verso(
        config.path(),
        "en",
        &["backlinks", v, "Barão Vermelho", "--json"],
    );
    assert_eq!(code, 0);
    assert_eq!(
        out.trim(),
        "[{\"from\":\"Taverna.md\",\"line\":3,\"col\":3,\"target\":\"Barão Vermelho\",\"embed\":false}]"
    );
}

#[test]
fn usage_and_open_errors_have_their_exit_codes() {
    let config = tempfile::tempdir().unwrap();
    let (code, out) = verso(config.path(), "en", &[]);
    assert_eq!(code, 2);
    assert!(out.starts_with("usage: verso"), "{out}");
    let (code, out) = verso(config.path(), "pt_BR", &["frob"]);
    assert_eq!(code, 2);
    assert!(out.starts_with("comando desconhecido: frob"), "{out}");
    let (code, out) = verso(config.path(), "en", &["index", "/nowhere/at/all"]);
    assert_eq!(code, 3);
    assert!(out.starts_with("could not open:"), "{out}");
    // --lang overrides the environment.
    let (code, out) = verso(config.path(), "en", &["index", "--lang", "pt-BR"]);
    assert_eq!(code, 2);
    assert!(out.starts_with("falta a pasta"), "{out}");
}
