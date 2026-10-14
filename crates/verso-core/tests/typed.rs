// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The typed note end to end over a folder (ADR 0052): a note's `type:`
//! reaching a schema of another note, typed at query time; a type no
//! schema names is plain Markdown; two schemas of one name type nothing;
//! a schema that does not parse says so; a schema edited or removed
//! changes what the note shows and never the note.

use std::io::Write;
use std::path::Path;

use tempfile::{Builder, NamedTempFile};
use verso_core::Workspace;
use verso_core::typed::TypeState;

#[cfg(test)]
mod support {
    use super::*;

    pub fn file(dir: &Path, name: &str, content: &str) -> NamedTempFile {
        let mut f = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempfile_in(dir)
            .unwrap();
        f.write_all(content.as_bytes()).unwrap();
        f.flush().unwrap();
        f
    }

    pub fn on_disk(vault: &Path, relative: &str) -> String {
        let mut root = verso_fs::Root::open(vault, vec![]).unwrap();
        let h = root.handle(Path::new(relative)).unwrap();
        String::from_utf8(root.read(h).unwrap().0).unwrap()
    }
}
use support::*;

const SCHEMA: &str = "# PdM\n\n```verso-schema\ntype: npc\nlabel: { pt-BR: PdM, en: NPC }\nproperties:\n  - key: facção\n    kind: text\n    label: { pt-BR: Facção, en: Faction }\n  - key: nível\n    kind: number\n  - key: aparição\n    kind: date\n```\n";
const BARAO: &str = "---\ntype: NPC\nfacção: Coroa\nnível: alto\n---\n# Barão\n";

#[test]
fn a_note_is_typed_by_the_schema_its_type_names_and_nothing_is_written() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _s = file(vault.path(), "PdM.md", SCHEMA);
    let _b = file(vault.path(), "Barão.md", BARAO);
    let _p = file(vault.path(), "Plano.md", "---\ntype: plano\n---\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let note = ws.read_note("Barão.md").unwrap();
    let t = note.note_type.unwrap();
    assert_eq!(t.written, "NPC");
    let TypeState::Typed(schema) = t.state else {
        panic!("typed: {:?}", t.state);
    };
    assert_eq!(schema.schema, "PdM.md");
    assert_eq!(schema.name, "npc");
    assert_eq!(schema.labels[0], ("pt-BR".to_owned(), "PdM".to_owned()));
    let props: Vec<(&str, &str, bool, bool)> = schema
        .properties
        .iter()
        .map(|p| (p.key.as_str(), p.kind.as_str(), p.present, p.fits))
        .collect();
    assert_eq!(
        props,
        [
            ("facção", "text", true, true),
            ("nível", "number", true, false),
            ("aparição", "date", false, false),
        ]
    );
    // A type no schema names: plain Markdown, nothing reported.
    assert_eq!(ws.read_note("Plano.md").unwrap().note_type, None);
    // Reading typed nothing on disk.
    assert_eq!(on_disk(vault.path(), "Barão.md"), BARAO);
    // `type:` finds the notes of a type, case ignored.
    assert_eq!(ws.notes_of_type("npc").unwrap(), ["Barão.md"]);
}

#[test]
fn two_schemas_of_one_name_type_nothing_and_a_broken_one_says_so() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _s = file(vault.path(), "PdM.md", SCHEMA);
    let _c = file(vault.path(), "PdM cópia.md", SCHEMA);
    let _b = file(vault.path(), "Barão.md", BARAO);
    let _l = file(
        vault.path(),
        "Lugares.md",
        "```verso-schema\ntype: lugar\nproperties:\n  - key: perigo\n    kind: link\n```\n",
    );
    let _t = file(vault.path(), "Taverna.md", "---\ntype: lugar\n---\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(
        ws.read_note("Barão.md").unwrap().note_type.unwrap().state,
        TypeState::Conflict {
            schemas: vec!["PdM cópia.md".to_owned(), "PdM.md".to_owned()]
        }
    );
    assert_eq!(
        ws.read_note("Taverna.md").unwrap().note_type.unwrap().state,
        TypeState::Invalid {
            schema: "Lugares.md".to_owned(),
            error: "unknown_kind".to_owned()
        }
    );
}

#[test]
fn a_nested_block_types_nothing() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _s = file(
        vault.path(),
        "Exemplo.md",
        "- citado:\n\n  ```verso-schema\n  type: npc\n  ```\n",
    );
    let _b = file(vault.path(), "Barão.md", BARAO);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(ws.read_note("Barão.md").unwrap().note_type, None);
}

#[test]
fn a_schema_written_as_an_example_inside_another_code_block_is_not_one() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _s = file(vault.path(), "PdM.md", SCHEMA);
    let _e = file(
        vault.path(),
        "Guia.md",
        "# Guia\n\n````markdown\n```verso-schema\ntype: npc\n```\n````\n",
    );
    let _b = file(vault.path(), "Barão.md", BARAO);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let state = ws.read_note("Barão.md").unwrap().note_type.unwrap().state;
    assert!(matches!(state, TypeState::Typed(_)), "{state:?}");
}

#[test]
fn a_schema_edited_or_removed_changes_what_the_note_shows_and_never_the_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let mut schema = file(vault.path(), "PdM.md", SCHEMA);
    let _b = file(vault.path(), "Barão.md", BARAO);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let keys = |ws: &mut Workspace| -> Vec<String> {
        match ws.read_note("Barão.md").unwrap().note_type.map(|t| t.state) {
            Some(TypeState::Typed(s)) => s.properties.into_iter().map(|p| p.key).collect(),
            other => panic!("typed: {other:?}"),
        }
    };
    assert_eq!(keys(&mut ws), ["facção", "nível", "aparição"]);
    // A property added to the schema: a new empty row, no note changed.
    schema.as_file_mut().set_len(0).unwrap();
    std::io::Seek::rewind(schema.as_file_mut()).unwrap();
    schema
        .write_all(
            SCHEMA
                .replace("```\n", "  - key: guilda\n    kind: text\n```\n")
                .as_bytes(),
        )
        .unwrap();
    schema.flush().unwrap();
    ws.index().unwrap();
    assert_eq!(keys(&mut ws), ["facção", "nível", "aparição", "guilda"]);
    assert_eq!(on_disk(vault.path(), "Barão.md"), BARAO);
    // The schema binned: the note is plain Markdown again, and unchanged.
    drop(schema);
    ws.index().unwrap();
    assert_eq!(ws.read_note("Barão.md").unwrap().note_type, None);
    assert_eq!(on_disk(vault.path(), "Barão.md"), BARAO);
}

#[test]
fn values_are_read_as_yaml_1_2_reads_them_and_an_empty_one_is_not_wrong() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _s = file(
        vault.path(),
        "Tipo.md",
        "```verso-schema\ntype: t\nproperties:\n  - key: dia\n    kind: date\n  - key: ok\n    kind: checkbox\n  - key: vazio\n    kind: number\n```\n",
    );
    let _n = file(
        vault.path(),
        "N.md",
        "---\ntype: t\ndia: 2026-10-07\nok: yes\nvazio:\n---\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let Some(TypeState::Typed(s)) = ws.read_note("N.md").unwrap().note_type.map(|t| t.state) else {
        panic!("typed");
    };
    let fits: Vec<(&str, bool, bool)> = s
        .properties
        .iter()
        .map(|p| (p.key.as_str(), p.present, p.fits))
        .collect();
    // A date is a string `YYYY-MM-DD`; `yes` is not a boolean under YAML
    // 1.2; an empty value is empty, not wrong.
    assert_eq!(
        fits,
        [
            ("dia", true, true),
            ("ok", true, false),
            ("vazio", true, true)
        ]
    );
}

#[test]
fn a_type_is_compared_after_nfc_and_a_broken_copy_still_conflicts() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    // The schema's name composed (`ã` as one character), the note's
    // decomposed (`a` and a combining tilde).
    let _s = file(
        vault.path(),
        "Tipo.md",
        "```verso-schema\ntype: Capitão\nproperties: []\n```\n",
    );
    let _n = file(vault.path(), "N.md", "---\ntype: capita\u{303}o\n---\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert!(matches!(
        ws.read_note("N.md").unwrap().note_type.map(|t| t.state),
        Some(TypeState::Typed(_))
    ));
    // A broken schema of the same name beside the good one: neither
    // applies (ADR 0052 point 5, option α).
    let _b = file(
        vault.path(),
        "Tipo cópia.md",
        "```verso-schema\ntype: capitão\nproperties: x\n```\n",
    );
    ws.index().unwrap();
    assert!(matches!(
        ws.read_note("N.md").unwrap().note_type.map(|t| t.state),
        Some(TypeState::Conflict { .. })
    ));
}

/// What a share sees (ADR 0081 item 11): a note's type by the schemas
/// held under the given folders only — one outside types nothing and
/// makes no conflict with one inside.
#[test]
fn a_type_within_folders_sees_only_the_schemas_under_them() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let mesa = Builder::new()
        .prefix("Mesa")
        .rand_bytes(0)
        .tempdir_in(vault.path())
        .unwrap();
    let _s = file(vault.path(), "PdM.md", SCHEMA);
    let _m = file(mesa.path(), "PdM.md", SCHEMA);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let whole = ws.note_type_within(BARAO, &[]).unwrap().unwrap();
    assert!(
        matches!(whole.state, TypeState::Conflict { .. }),
        "{whole:?}"
    );
    let inside = ws
        .note_type_within(BARAO, &["Mesa".to_owned()])
        .unwrap()
        .unwrap();
    assert!(
        matches!(&inside.state, TypeState::Typed(t) if t.schema == "Mesa/PdM.md"),
        "{inside:?}"
    );
    // A sibling whose name begins as the folder's is not under it.
    assert_eq!(
        ws.note_type_within(BARAO, &["Mes".to_owned()]).unwrap(),
        None
    );
    assert_eq!(
        ws.note_type_within(BARAO, &["Outra".to_owned()]).unwrap(),
        None
    );
}
