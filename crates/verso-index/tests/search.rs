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
        "texto com aspas \" e NOT e col: e (parenteses) e asterisco* e -menos e ^circunflexo e NEAR(x y)\n",
    );
    put(&mut index, "b.md", "outro texto\n");
    let paths = |hits: Vec<verso_index::Hit>| {
        let mut p: Vec<String> = hits.into_iter().map(|h| h.path).collect();
        p.sort();
        p
    };
    // Every operator of the FTS5 grammar (memo §6.3.4), as a word: no
    // error, and it matches the note that contains it as text — or nothing,
    // never "everything except" or a prefix.
    for (q, expected) in [
        ("NOT", vec!["a.md"]),
        ("col:", vec!["a.md"]),
        ("col:texto", vec![]),
        ("(parenteses)", vec!["a.md"]),
        ("(", vec![]),
        ("asterisco*", vec!["a.md"]),
        ("*", vec![]),
        ("aster*", vec![]),
        ("-menos", vec!["a.md"]),
        ("-texto", vec!["a.md", "b.md"]),
        ("^circunflexo", vec!["a.md"]),
        ("^", vec![]),
        ("NEAR(x y)", vec!["a.md"]),
        ("\"", vec![]),
        ("a\"b", vec![]),
        ("texto OR", vec![]),
        ("texto AND outro", vec![]),
        ("ca\u{0}fe", vec![]),
        ("tex\u{0}to", vec!["a.md", "b.md"]),
    ] {
        let r = index.search(q, 10);
        assert!(r.is_ok(), "{q}: {r:?}");
        assert_eq!(paths(r.unwrap()), expected, "{q}");
    }
    // `texto OR` requires both words; `OR` is a word here and no note
    // contains the token `or` (`outro` is one token), so nothing matches.
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
