// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Full-text search: accents and case folded by the tokenizer (ADR 0046,
//! provisional), and the FTS5 grammar never reached by the user's words
//! (feature 3 guardrail, ADR 0029).

use verso_index::{Index, NoteStamp};

#[cfg(test)]
mod support {
    use super::*;
    pub fn put(index: &mut Index, path: &str, content: &str) {
        let report = verso_dialect::parse(content);
        index
            .upsert(
                path,
                NoteStamp {
                    modified: 1,
                    len: 1,
                    hash: 1,
                },
                content,
                &report,
            )
            .unwrap();
    }
}
use support::*;

#[test]
fn accents_and_case_do_not_matter() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "a.md",
        "O Café São João fica na Ilha da Preguiça.\n",
    );
    put(&mut index, "b.md", "Nada aqui.\n");
    for q in ["cafe", "CAFÉ", "café são", "preguica ilha"] {
        let hits = index.search(q, 10).unwrap();
        assert_eq!(hits.len(), 1, "{q}: {hits:?}");
        assert_eq!(hits[0].path, "a.md");
    }
    assert!(index.search("taverna", 10).unwrap().is_empty());
    assert!(index.search("   ", 10).unwrap().is_empty());
}

#[test]
fn the_fts5_grammar_is_never_reached_by_a_query() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "a.md",
        "texto com aspas \" e NOT e col: e (parenteses) e asterisco*\n",
    );
    put(&mut index, "b.md", "outro texto\n");
    // Operators as words: no syntax error, matched as text.
    for q in [
        "NOT",
        "col:",
        "(parenteses)",
        "asterisco*",
        "\"",
        "a\"b",
        "texto OR",
    ] {
        let r = index.search(q, 10);
        assert!(r.is_ok(), "{q}: {r:?}");
    }
    // `NOT` as a word matches the note that contains the word, not "everything except".
    let hits = index.search("NOT", 10).unwrap();
    assert_eq!(
        hits.iter().map(|h| h.path.as_str()).collect::<Vec<_>>(),
        vec!["a.md"]
    );
    // `texto OR` requires both words: OR is a word here, present in "outro"? no — only a.md has neither...
    let hits = index.search("texto OR", 10).unwrap();
    assert!(hits.is_empty(), "{hits:?}");
    // A snippet marks the match.
    let hits = index.search("aspas", 10).unwrap();
    assert!(hits[0].snippet.contains("[aspas]"), "{hits:?}");
}

#[test]
fn an_index_file_is_private_and_survives_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir
        .path()
        .join("sub")
        .join(Index::file_name_for(std::path::Path::new("/Users/x/Vault")));
    {
        let mut index = Index::open(&file).unwrap();
        put(&mut index, "a.md", "persistente");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            std::fs::metadata(dir.path().join("sub"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
    }
    let index = Index::open(&file).unwrap();
    assert_eq!(index.notes().unwrap(), vec!["a.md"]);
    assert_eq!(index.search("persistente", 10).unwrap().len(), 1);
    assert!(
        file.file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("Vault-")
    );
}
