// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The `^id` blocks of the whole folder in one query (ADR 0102 item 3,
//! R.2 = B): kind, a short label, the last of a repeated id, a reader
//! without the secret blocks, a bound.

use verso_index::{BLOCKS_MOST, BlockKind, Index, NoteStamp};

#[cfg(test)]
fn put(index: &mut Index, path: &str, content: &str) {
    index
        .upsert(
            path,
            NoteStamp {
                modified: 1,
                len: 1,
                hash: 1,
            },
            content,
            &verso_dialect::parse(content),
        )
        .unwrap();
}

const MESA: &str = "# Mesa\n\n## Reviravoltas\n\n- um\n- dois\n- tres\n^reviravolta\n\n## Clima\n\n| d6 | Clima |\n|---|---|\n| 1 | chuva |\n| 2 | sol |\n^clima\n\nUm paragrafo longo que descreve a taverna. ^taverna\n\n> citacao ^cita\n";

#[test]
fn every_block_id_of_the_folder_comes_with_its_kind_and_a_label() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "Mesa.md", MESA);
    put(&mut index, "Outra.md", "- a\n- b ^lista\n");
    put(&mut index, "Sem.md", "nada aqui\n");
    let all = index.folder_blocks(&[]).unwrap();
    assert!(!all.truncated);
    let row = |path: &str, id: &str| {
        all.blocks
            .iter()
            .find(|b| b.path == path && b.id == id)
            .unwrap_or_else(|| panic!("{path} ^{id} in {all:?}"))
    };
    assert_eq!(row("Mesa.md", "reviravolta").kind, BlockKind::List);
    assert_eq!(row("Mesa.md", "reviravolta").label, "Reviravoltas");
    assert!(row("Mesa.md", "reviravolta").under_heading);
    assert_eq!(row("Mesa.md", "clima").kind, BlockKind::Table);
    assert_eq!(row("Mesa.md", "clima").label, "Clima");
    assert_eq!(row("Mesa.md", "cita").kind, BlockKind::Quote);
    // No heading above: the first line, without its marker or its id.
    assert_eq!(row("Outra.md", "lista").kind, BlockKind::List);
    assert_eq!(row("Outra.md", "lista").label, "b");
    assert!(!row("Outra.md", "lista").under_heading);
    // By path, then by position.
    let paths: Vec<&str> = all.blocks.iter().map(|b| b.path.as_str()).collect();
    assert!(paths.windows(2).all(|w| w[0] <= w[1]), "{paths:?}");
    // A filter on the kind.
    let tables = index
        .folder_blocks(&[BlockKind::Table, BlockKind::List])
        .unwrap();
    assert!(
        tables
            .blocks
            .iter()
            .all(|b| matches!(b.kind, BlockKind::Table | BlockKind::List))
    );
    assert!(tables.blocks.iter().any(|b| b.id == "clima"));
    assert!(!tables.blocks.iter().any(|b| b.id == "taverna"));
}

#[test]
fn a_table_without_outer_pipes_is_a_table_and_a_long_first_line_is_cut() {
    let mut index = Index::in_memory().unwrap();
    let long = "palavra ".repeat(40);
    put(
        &mut index,
        "A.md",
        &format!("a | b\n--|--\n1 | 2\n^sem\n\n{long}^longo\n"),
    );
    let all = index.folder_blocks(&[]).unwrap();
    let get = |id: &str| all.blocks.iter().find(|b| b.id == id).unwrap();
    assert_eq!(get("sem").kind, BlockKind::Table);
    assert_eq!(get("longo").kind, BlockKind::Paragraph);
    assert!(
        get("longo").label.chars().count() <= 80,
        "{}",
        get("longo").label
    );
    assert!(get("longo").label.ends_with('…'));
}

#[test]
fn a_repeated_id_lists_the_last_one() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "A.md", "- x ^t\n\n| a |\n|---|\n| 1 |\n^t\n");
    let all = index.folder_blocks(&[]).unwrap();
    let t: Vec<_> = all.blocks.iter().filter(|b| b.id == "t").collect();
    assert_eq!(t.len(), 1, "{all:?}");
    assert_eq!(t[0].kind, BlockKind::Table);
}

#[test]
fn a_reader_is_told_of_no_secret_block_nor_a_secret_heading() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "T.md",
        "# T\n\n> [!secret] Segredo\n> ## Cripta\n> - morto\n> - vivo\n> ^cripta\n\n- publico ^aberta\n",
    );
    let owner = index.folder_blocks(&[]).unwrap();
    assert!(owner.blocks.iter().any(|b| b.id == "cripta"));
    let reader = index.reader_folder_blocks(&[]).unwrap();
    assert!(
        !reader.blocks.iter().any(|b| b.id == "cripta"),
        "{reader:?}"
    );
    let open = reader.blocks.iter().find(|b| b.id == "aberta").unwrap();
    assert!(!open.label.contains("Cripta"), "{open:?}");
    assert_eq!(open.label, "T");
    let all = format!("{reader:?}");
    assert!(!all.contains("morto") && !all.contains("Cripta"), "{all}");
}

#[test]
fn the_list_is_bounded() {
    let mut index = Index::in_memory().unwrap();
    for n in 0..60 {
        let body: String = (0..100).map(|i| format!("- x ^b{n}-{i}\n\n")).collect();
        put(&mut index, &format!("n{n:02}.md"), &body);
    }
    let all = index.folder_blocks(&[]).unwrap();
    assert_eq!(all.blocks.len(), BLOCKS_MOST);
    assert!(all.truncated);
}

#[test]
fn only_a_bounded_number_of_rows_is_read_and_a_bound_reached_says_so() {
    let mut index = Index::in_memory().unwrap();
    for n in 0..60 {
        let body: String = (0..100).map(|i| format!("- x ^b{n}-{i}\n\n")).collect();
        put(&mut index, &format!("n{n:02}.md"), &body);
    }
    // None of the 6000 is a table. Reading every row would answer "none,
    // nothing left out"; reading a bounded number says that more were not
    // looked at.
    let tables = index.folder_blocks(&[BlockKind::Table]).unwrap();
    assert!(tables.blocks.is_empty());
    assert!(tables.truncated);
}

#[test]
fn a_block_says_how_many_rows_it_has_and_whether_it_is_a_task_list() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "A.md",
        "| d6 | x |\n|---|---|\n| 1 | a |\n| 2 | b |\n\n^dois\n\n| d6 | x |\n|---|---|\n| 1 | a |\n\n^um\n\n- [ ] fazer\n- [x] feito\n\n^tarefas\n\n- a\n  - fundo\n- b\n- c\n\n^itens\n",
    );
    let all = index.folder_blocks(&[]).unwrap();
    let get = |id: &str| all.blocks.iter().find(|b| b.id == id).unwrap();
    assert_eq!(get("dois").rows, 2, "{all:?}");
    assert_eq!(get("um").rows, 1);
    assert_eq!((get("tarefas").rows, get("tarefas").tasks), (2, true));
    // A nested item belongs to its parent.
    assert_eq!((get("itens").rows, get("itens").tasks), (3, false));
}
