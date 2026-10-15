// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder as a reader of a UniVerso sees it (ADR 0087): every answer
//! the core gives a reader comes from the notes' projections. No word of a
//! secret block — nor a link, tag, heading or `^id` inside one, nor a
//! count of them — reaches it; a reader's lines are the projection's; a
//! change only inside a secret block changes nothing a reader is told;
//! and reading never writes (invariant 7).

use super::*;

/// Words only the secret blocks hold.
const SECRETS: &[&str] = &[
    "zumbificado",
    "Cripta",
    "Vampiro",
    "Mapa",
    "morto",
    "cripta-id",
    "Abismo",
    "afogado",
];

const TAVERNA: &str = "---\ntags: [lugar]\n---\n# Taverna\n\nO Barão governa. [[Barão]] #publico\n\n> [!secret] Segredo\n> # Cripta\n> Ele está morto: [[Vampiro]] ![[Mapa]] #morto zumbificado. O Barão sabe.\n> ^cripta-id\n\n> [!note] Rumores\n> Dizem coisas.\n>\n> > [!Secret]-\n> > O Barão caiu no [[Abismo]] e está afogado.\n>\n> Fim dos rumores.\n\nFim: [[Porto]] ^fim\n";

#[cfg(test)]
fn folder() -> (TempDir, TempDir, Vec<Kept>, Workspace) {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let mut kept = vec![note(vault.path(), "Taverna.md", TAVERNA)];
    for name in ["Barão", "Vampiro", "Mapa", "Porto", "Abismo"] {
        kept.push(note(
            vault.path(),
            &format!("{name}.md"),
            &format!("# {name}\n"),
        ));
    }
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    (vault, config, kept, ws)
}

/// No secret word in `what`, an answer's whole debug text.
#[cfg(test)]
fn clean(what: &str, answer: &str) {
    for s in SECRETS {
        assert!(
            !answer.contains(s),
            "{what}: {s:?} reached a reader in {answer}"
        );
    }
}

#[test]
fn a_reader_reads_the_projection_and_its_own_positions() {
    let (_v, _c, _k, mut ws) = folder();
    let whole = ws.read_note("Taverna").unwrap();
    assert!(whole.text.contains("zumbificado"));
    let n = ws.reader_read_note("Taverna").unwrap();
    assert_eq!(n.text, verso_dialect::project(TAVERNA));
    clean("read_note", &format!("{n:?}"));
    // `# Taverna` on line 4 both ways; `^fim` after the eight hidden
    // lines, on line 21 - 6 = 15.
    let headings: Vec<(String, u32)> = n
        .headings
        .iter()
        .map(|h| (h.text.clone(), h.line))
        .collect();
    assert_eq!(headings, [("Taverna".to_owned(), 4)]);
    let ids: Vec<(String, u32)> = n.blocks.iter().map(|b| (b.id.clone(), b.line)).collect();
    assert_eq!(ids, [("fim".to_owned(), n.lines.len() as u32)]);
    assert_eq!(
        n.lines[usize::try_from(ids[0].1).unwrap() - 1],
        "Fim: [[Porto]] ^fim"
    );
    let t = ws.reader_read_text("Taverna.md").unwrap();
    assert_eq!(t.text, n.text);
    let f = ws.reader_read_file("Taverna.md").unwrap();
    assert_eq!(f, n.text.as_bytes());
    // A note with no secret block is read whole, the same either way.
    assert_eq!(
        ws.reader_read_note("Porto").unwrap(),
        ws.read_note("Porto").unwrap()
    );
}

#[test]
fn every_answer_derived_from_the_notes_leaves_the_secret_out() {
    let (_v, _c, _k, mut ws) = folder();
    for word in ["zumbificado", "afogado", "cripta"] {
        assert!(!ws.search(word, 10).unwrap().is_empty(), "{word}");
        assert!(ws.reader_search(word, 10).unwrap().is_empty(), "{word}");
    }
    let hits = ws.reader_search("barão", 10).unwrap();
    assert!(!hits.is_empty());
    clean("search", &format!("{hits:?}"));
    let links = ws.reader_links("Taverna").unwrap().unwrap();
    clean("links", &format!("{links:?}"));
    let porto: Vec<u32> = links
        .iter()
        .filter(|l| l.target == "Porto")
        .map(|l| l.line)
        .collect();
    let shown = ws.reader_read_note("Taverna").unwrap();
    assert_eq!(porto, [shown.lines.len() as u32]);
    for hidden in ["Vampiro", "Mapa", "Abismo"] {
        assert_eq!(ws.backlinks(hidden).unwrap().unwrap().len(), 1, "{hidden}");
        assert!(
            ws.reader_backlinks(hidden).unwrap().unwrap().is_empty(),
            "{hidden}"
        );
    }
    let graph = ws.reader_graph().unwrap();
    clean("graph", &format!("{graph:?}"));
    let tags = ws.reader_tags().unwrap();
    clean("tags", &format!("{tags:?}"));
    assert!(tags.iter().any(|(t, _)| t == "publico"));
    let mentions = ws.reader_unlinked_mentions("Barão").unwrap();
    clean("unlinked_mentions", &format!("{mentions:?}"));
    // Two in the secret blocks for a writer, marked; none for a reader.
    let all = ws.unlinked_mentions("Barão").unwrap().mentions;
    assert_eq!(all.iter().filter(|m| m.secret).count(), 2);
    assert!(mentions.mentions.iter().all(|m| !m.secret));
    assert_eq!(mentions.mentions.len(), all.len() - 2);
    let base = "views:\n  - type: table\n    name: T\n    order: [file.name, file.tags, file.links, file.size]\n";
    let reader = ws
        .query_base(&verso_core::bases::BaseQuery {
            text: Some(base.to_owned()),
            reader: true,
            ..Default::default()
        })
        .unwrap();
    // Every file is a row, so the notes the secret links name are listed
    // by their own names: what may not show is what the blocks say.
    let rows = format!("{reader:?}");
    for s in [
        "zumbificado",
        "Cripta",
        "morto",
        "cripta-id",
        "afogado",
        "Vampiro\"",
        "Mapa\"",
        "Abismo\"",
    ] {
        assert!(
            !rows.contains(s),
            "query_base: {s:?} reached a reader in {rows}"
        );
    }
    let writer = ws
        .query_base(&verso_core::bases::BaseQuery {
            text: Some(base.to_owned()),
            ..Default::default()
        })
        .unwrap();
    assert!(format!("{writer:?}").contains("morto"));
    let entry = ws
        .reader_entries()
        .unwrap()
        .into_iter()
        .find(|e| e.path == "Taverna.md")
        .unwrap();
    assert_eq!(entry.len, shown.text.len() as u64);
}

#[test]
fn a_change_only_inside_a_secret_block_is_none_for_a_reader_and_reading_writes_nothing() {
    let (vault, _c, _k, mut ws) = folder();
    let before = ws.reader_read_note("Taverna").unwrap();
    let bytes = on_disk(vault.path(), "Taverna.md");
    let revision = ws.read_note("Taverna").unwrap().revision;
    // Every reader's read, twice: the file is the same, byte for byte and
    // by its stamp (invariant 7).
    for _ in 0..2 {
        ws.reader_read_note("Taverna").unwrap();
        ws.reader_read_text("Taverna.md").unwrap();
        ws.reader_read_file("Taverna.md").unwrap();
        ws.reader_unlinked_mentions("Barão").unwrap();
        ws.reader_links("Taverna").unwrap();
    }
    assert_eq!(on_disk(vault.path(), "Taverna.md"), bytes);
    assert_eq!(ws.read_note("Taverna").unwrap().revision, revision);
    // A writer changes a secret block only.
    let changed = TAVERNA.replace("zumbificado", "embalsamado");
    ws.write_note("Taverna", &changed, &revision).unwrap();
    let after = ws.reader_read_note("Taverna").unwrap();
    assert_eq!(after.text, before.text);
    assert_eq!(
        after.revision, before.revision,
        "a reader saw a new revision"
    );
    // A change a reader can see is one.
    let w = ws.read_note("Taverna").unwrap();
    ws.write_note(
        "Taverna",
        &changed.replace("Fim:", "Fim, enfim:"),
        &w.revision,
    )
    .unwrap();
    assert_ne!(
        ws.reader_read_note("Taverna").unwrap().revision,
        before.revision
    );
}
