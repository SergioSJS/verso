// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use verso_index::{EntryLabel, Index, NoteStamp};

fn stamp(hash: u64) -> NoteStamp {
    NoteStamp {
        modified: 100,
        len: 100,
        hash,
    }
}

#[test]
fn labels_indexed_and_queried() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    let mut index = Index::open(&file).unwrap();

    let content = "---\nsticker: emoji//1f3b2\ncolor: '#e06c75'\naliases:\n  - Primeiro Alias\n  - Segundo Alias\nbanner: assets/cover.png\nbanner_y: 0.35\n---\n# Nota com label\n";
    index
        .upsert("Nota.md", stamp(1), content, &verso_dialect::parse(content))
        .unwrap();

    let labels = index.labels().unwrap();
    assert_eq!(
        labels.get("Nota.md"),
        Some(&EntryLabel {
            sticker: Some("emoji//1f3b2".to_string()),
            color: Some("#e06c75".to_string()),
            alias: Some("Primeiro Alias".to_string()),
            aliases: vec!["Primeiro Alias".to_string(), "Segundo Alias".to_string()],
            order: None,
            pinned: None,
        })
    );

    let single = index.label_of("Nota.md").unwrap();
    assert_eq!(
        single,
        Some(EntryLabel {
            sticker: Some("emoji//1f3b2".to_string()),
            color: Some("#e06c75".to_string()),
            alias: Some("Primeiro Alias".to_string()),
            aliases: vec!["Primeiro Alias".to_string(), "Segundo Alias".to_string()],
            order: None,
            pinned: None,
        })
    );

    let banner = index.banner_of("Nota.md").unwrap();
    assert_eq!(banner, Some(("assets/cover.png".to_string(), Some(0.35))));

    // Note with order and pinned
    let ordered = "---\norder:\n  - a.md\n  - b.md\npinned:\n  - \"[[a]]\"\n---\n# Folder Note\n";
    index
        .upsert(
            "Folder/Folder.md",
            stamp(3),
            ordered,
            &verso_dialect::parse(ordered),
        )
        .unwrap();
    assert_eq!(
        index.label_of("Folder/Folder.md").unwrap(),
        Some(EntryLabel {
            sticker: None,
            color: None,
            alias: None,
            aliases: vec![],
            order: Some(vec!["a.md".to_string(), "b.md".to_string()]),
            pinned: Some(vec!["[[a]]".to_string()]),
        })
    );

    // Note without label has None
    let plain = "# Sem label\n";
    index
        .upsert("Plain.md", stamp(2), plain, &verso_dialect::parse(plain))
        .unwrap();
    assert_eq!(index.label_of("Plain.md").unwrap(), None);

    // Rekey preserves label
    index.rekey("Nota.md", "Pasta/Nota.md").unwrap();
    assert_eq!(
        index.label_of("Pasta/Nota.md").unwrap(),
        Some(EntryLabel {
            sticker: Some("emoji//1f3b2".to_string()),
            color: Some("#e06c75".to_string()),
            alias: Some("Primeiro Alias".to_string()),
            aliases: vec!["Primeiro Alias".to_string(), "Segundo Alias".to_string()],
            order: None,
            pinned: None,
        })
    );
    assert_eq!(index.label_of("Nota.md").unwrap(), None);
}
