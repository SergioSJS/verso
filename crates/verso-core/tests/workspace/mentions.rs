// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note's unlinked mentions as occurrences (ADR 0089 item 1): the name
//! as a phrase, on word boundaries, case ignored and accents kept, each
//! alias a name too; never in code, the frontmatter, a comment, a link,
//! an embed or a tag.

use super::*;

#[cfg(test)]
fn found(ws: &mut Workspace, note: &str) -> Vec<(String, u32, u32, String)> {
    ws.unlinked_mentions(note)
        .unwrap()
        .mentions
        .into_iter()
        .map(|m| (m.path, m.line, m.col, m.text))
        .collect()
}

#[test]
fn mentions_are_the_name_as_a_phrase_on_word_boundaries() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _target = note(
        vault.path(),
        "Porto.md",
        "---\naliases: [Cidade Invicta]\n---\nO Porto fala de si: Porto.\n",
    );
    let _a = note(
        vault.path(),
        "a.md",
        "Fomos ao Porto e ao porto, PORTO!\nO Pôrto não. Portobello não. Porto_x não. `Porto` não. [[Porto]] já. ![[Porto]] também. [o Porto](Porto.md) também.\n#Porto é tag. %%Porto%% some.\nAção Porto.\n",
    );
    let _b = note(
        vault.path(),
        "b.md",
        "---\ntitle: Porto\n---\n```\nPorto\n```\nNada.\n",
    );
    let _c = note(
        vault.path(),
        "c.md",
        "A Cidade Invicta é bela; a cidade invicta também.\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let all = found(&mut ws, "Porto");
    assert_eq!(
        all,
        [
            ("a.md".to_owned(), 1, 10, "Porto".to_owned()),
            ("a.md".to_owned(), 1, 21, "porto".to_owned()),
            ("a.md".to_owned(), 1, 28, "PORTO".to_owned()),
            // Columns count characters, not bytes (spec §4.4).
            ("a.md".to_owned(), 4, 6, "Porto".to_owned()),
            ("c.md".to_owned(), 1, 3, "Cidade Invicta".to_owned()),
            ("c.md".to_owned(), 1, 28, "cidade invicta".to_owned()),
        ],
        "{all:#?}"
    );
    let m = ws.unlinked_mentions("Porto.md").unwrap();
    assert!(!m.more);
    let alias: Vec<bool> = m.mentions.iter().map(|m| m.alias).collect();
    assert_eq!(alias, [false, false, false, false, true, true]);
    // What surrounds the mention on its line, for the panel.
    assert_eq!(m.mentions[0].before, "Fomos ao ");
    assert_eq!(m.mentions[0].after, " e ao porto, PORTO!");
}

#[test]
fn a_table_cell_and_a_secret_block_are_said() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _target = note(vault.path(), "Mesa.md", "# Mesa\n");
    let _a = note(
        vault.path(),
        "a.md",
        "| Mesa | x |\n|---|---|\n| y | z |\n\n> [!SECRET] Só a mestra\n> A mesa esconde.\n\nUma mesa.\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let m = ws.unlinked_mentions("Mesa").unwrap().mentions;
    let said: Vec<(u32, bool, bool)> = m.iter().map(|m| (m.line, m.table, m.secret)).collect();
    assert_eq!(
        said,
        [(1, true, false), (6, false, true), (8, false, false)]
    );
}

#[test]
fn a_note_that_is_not_there_or_outside_is_refused() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _a = note(vault.path(), "a.md", "Nada.\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert!(matches!(
        ws.unlinked_mentions("Sumiu"),
        Err(CoreError::Read(_))
    ));
    assert!(matches!(
        ws.unlinked_mentions("../fora"),
        Err(CoreError::Confined(_))
    ));
}
