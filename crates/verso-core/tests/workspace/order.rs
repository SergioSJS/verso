//! A folder's custom order and its folder note, through renames and moves (ADR
//! 0060).

use super::*;

/// Renaming a note inside a folder rewrites `order:` in the folder note
/// (ADR 0060, D4).
#[test]
fn a_rename_in_verso_rewrites_order_in_folder_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let pasta = subdir(vault.path(), "pasta");
    let _a = note(pasta.path(), "A.md", "# A\n");
    let _b = note(pasta.path(), "B.md", "# B\n");
    let _fn = note(
        pasta.path(),
        "pasta.md",
        "---\norder:\n  - A.md\n  - B.md\npinned:\n  - \"[[A]]\"\n---\n# Pasta\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_note("pasta/A.md", "pasta/C.md").unwrap();
    assert_eq!(renamed.path, "pasta/C.md");
    let rewrite = renamed
        .rewrites
        .iter()
        .find(|rw| rw.path == "pasta/pasta.md")
        .expect("folder note should be rewritten");
    assert!(
        rewrite.after.contains("- C.md"),
        "rewritten text should contain C.md: {}",
        rewrite.after
    );
    assert!(
        !rewrite.after.contains("- A.md"),
        "rewritten text should not contain - A.md: {}",
        rewrite.after
    );

    apply(&mut ws, &renamed);
    let read = ws.read_note("pasta/pasta.md").unwrap();
    assert!(read.text.contains("- C.md"));
    assert!(!read.text.contains("- A.md"));
}

/// Renaming a folder preserves its internal `order:` items (ADR 0060, D4).
#[test]
fn renaming_a_folder_preserves_its_internal_order_list() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let foo = subdir(vault.path(), "foo");
    let _a = note(foo.path(), "A.md", "# A\n");
    let _b = note(foo.path(), "B.md", "# B\n");
    let _sub = subdir(foo.path(), "sub");
    let _sub_note = note(_sub.path(), "sub.md", "# Sub\n");
    let _d2024 = subdir(foo.path(), "2024");
    let _d2024_note = note(_d2024.path(), "2024.md", "# 2024\n");
    let _fn = note(
        foo.path(),
        "foo.md",
        "---\norder:\n  - A.md\n  - B.md\n  - sub\n  - 2024\n---\n# Foo\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("foo", "bar").unwrap();
    assert_eq!(renamed.path, "bar");
    apply(&mut ws, &renamed);

    // The folder note took the folder's new name with it.
    let read = ws.read_note("bar/bar.md").unwrap();
    assert_eq!(
        read.text,
        "---\norder:\n  - A.md\n  - B.md\n  - sub\n  - 2024\n---\n# Foo\n"
    );
}

/// Renaming a subfolder updates its name in the parent folder's `order:` list (ADR 0060, D4).
#[test]
fn renaming_a_subfolder_updates_parent_folder_order() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let parent = subdir(vault.path(), "parent");
    let _sub1 = subdir(parent.path(), "sub1");
    let _sub1_note = note(_sub1.path(), "sub1.md", "# Sub1\n");
    let _note_a = note(parent.path(), "nota.md", "# Nota\n");
    let _d2024 = subdir(parent.path(), "2024");
    let _d2024_note = note(_d2024.path(), "2024.md", "# 2024\n");
    let _fn = note(
        parent.path(),
        "parent.md",
        "---\norder:\n  - sub1\n  - nota.md\n  - 2024\n---\n# Parent\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("parent/sub1", "parent/sub2").unwrap();
    assert_eq!(renamed.path, "parent/sub2");
    let rw = renamed
        .rewrites
        .iter()
        .find(|r| r.path == "parent/parent.md")
        .expect("parent folder note must be rewritten");
    assert!(
        rw.after.contains("- sub2"),
        "must contain sub2: {}",
        rw.after
    );
    assert!(
        !rw.after.contains("- sub1"),
        "must not contain sub1: {}",
        rw.after
    );
    assert!(
        rw.after.contains("2024"),
        "must preserve 2024: {}",
        rw.after
    );
    apply(&mut ws, &renamed);

    // Now rename numeric subfolder 2024 to 2025
    let renamed_num = ws.rename_entry("parent/2024", "parent/2025").unwrap();
    let rw_num = renamed_num
        .rewrites
        .iter()
        .find(|r| r.path == "parent/parent.md")
        .expect("parent folder note must be rewritten for numeric rename");
    assert!(
        rw_num.after.contains("2025"),
        "must contain 2025: {}",
        rw_num.after
    );
    assert!(
        !rw_num.after.contains("2024"),
        "must not contain 2024: {}",
        rw_num.after
    );
}

/// A root note rename must NOT match an item in a subfolder's order list.
#[test]
fn renaming_root_note_does_not_corrupt_subfolder_order() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _root_a = note(vault.path(), "A.md", "# Root A\n");
    let folder = subdir(vault.path(), "pasta");
    let _sub_a = note(folder.path(), "A.md", "# Sub A\n");
    let _sub_b = note(folder.path(), "B.md", "# Sub B\n");
    let _fn = note(
        folder.path(),
        "pasta.md",
        "---\norder:\n  - A.md\n  - B.md\n---\n# Pasta\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("A.md", "X.md").unwrap();
    assert_eq!(renamed.path, "X.md");
    // pasta/pasta.md must NOT have been rewritten
    assert!(
        !renamed.rewrites.iter().any(|r| r.path == "pasta/pasta.md"),
        "subfolder folder note must not be rewritten on root note rename"
    );
    let read_fn = ws.read_note("pasta/pasta").unwrap();
    assert!(read_fn.text.contains("- A.md"));
    assert!(read_fn.text.contains("- B.md"));
}

/// The order list preserves numeric strings with leading zeroes (01) and quotes specials.
#[test]
fn order_preserves_numeric_strings_and_quotes_specials() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let parent = subdir(vault.path(), "parent");
    let _sub = subdir(parent.path(), "sub");
    let _sub_note = note(_sub.path(), "sub.md", "# Sub\n");
    let _fn = note(
        parent.path(),
        "parent.md",
        "---\norder:\n  - \"01\"\n  - \"2024\"\n  - \"[tag]\"\n  - sub\n---\n# Parent\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("parent/sub", "parent/sub2").unwrap();
    let rw = renamed
        .rewrites
        .iter()
        .find(|r| r.path == "parent/parent.md")
        .expect("parent folder note must be rewritten");
    assert!(
        rw.after.contains("\"01\""),
        "must preserve 01 with leading zero: {}",
        rw.after
    );
    assert!(
        !rw.after.contains("- 1\n"),
        "must not be converted to number 1: {}",
        rw.after
    );
    assert!(
        rw.after.contains("\"[tag]\""),
        "must quote [tag]: {}",
        rw.after
    );
    assert!(
        rw.after.contains("sub2"),
        "must contain renamed sub2: {}",
        rw.after
    );
}

/// A rename made outside reaches the index through the watcher.
#[test]
fn a_rename_made_outside_reaches_the_index_through_the_watch() {
    use std::time::{Duration, Instant};
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let pasta = subdir(vault.path(), "pasta");
    let _a = note(pasta.path(), "A.md", "# A\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let (tx, rx) = std::sync::mpsc::channel();
    let _watch = ws
        .watch(move |changes| {
            let _ = tx.send(changes);
        })
        .unwrap();
    while rx.recv_timeout(Duration::from_millis(700)).is_ok() {}

    let from = pasta.path().join("A.md");
    let to = pasta.path().join("B.md");
    std::fs::rename(&from, &to).unwrap();

    let deadline = Instant::now() + Duration::from_secs(10);
    let seen = loop {
        let left = deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(left) {
            Ok(c)
                if c.rescan
                    || c.paths
                        .iter()
                        .any(|p| p.ends_with("B.md") || p.ends_with("A.md")) =>
            {
                break true;
            }
            Ok(_) => {}
            Err(_) => break false,
        }
    };
    assert!(seen, "the watch never reported the renamed note");
    let r = ws.index().unwrap();
    assert!(r.listing_changed);
    assert!(r.changed.contains(&"pasta/B.md".to_string()));
    assert!(r.gone.contains(&"pasta/A.md".to_string()));
}

/// Only the line of the item that moved changes: comments, bare numbers
/// (`01`, `1.10`), trailing comments and the other keys stay as written.
#[test]
fn an_order_rewrite_changes_the_moved_items_line_only() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let text = "---\ntitle: P\norder:\n  # mine\n  - 01\n  - A.md # first\n  - 1.10\n  - B.md\ntags: [x]\n---\n# P\n";
    let _pasta = folder_with_order(vault.path(), text);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta/B.md", "pasta/C.md").unwrap();
    let rw = renamed
        .rewrites
        .iter()
        .find(|r| r.path == "pasta/pasta.md")
        .unwrap();
    assert_eq!(rw.after, text.replace("  - B.md\n", "  - C.md\n"));
    apply(&mut ws, &renamed);
    // Bare `01` and `1.10` are numbers to any YAML reader; the text keeps
    // them as written (above).
    assert_eq!(
        order_of(&mut ws, "pasta/pasta.md"),
        ["1", "A.md", "1.1", "C.md"]
    );
}

/// Windows line endings are kept.
#[test]
fn an_order_rewrite_keeps_crlf() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let text = "---\r\norder:\r\n  - A.md\r\n  - B.md\r\n---\r\n# P\r\n";
    let _pasta = folder_with_order(vault.path(), text);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta/A.md", "pasta/C.md").unwrap();
    let rw = renamed
        .rewrites
        .iter()
        .find(|r| r.path == "pasta/pasta.md")
        .unwrap();
    assert_eq!(rw.after, text.replace("- A.md", "- C.md"));
}

/// A new name YAML would read as something else is quoted, and reads back
/// as written.
#[test]
fn an_order_rewrite_quotes_a_name_yaml_would_misread() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let (pasta, _files) = folder_with_order(
        vault.path(),
        "---\norder:\n  - sub\n  - A.md\n  - B.md\n---\n",
    );
    let sub = subdir(pasta.path(), "sub");
    let _n = note(sub.path(), "n.md", "# n\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta/sub", "pasta/2024").unwrap();
    apply(&mut ws, &renamed);
    let renamed = ws.rename_entry("pasta/B.md", "pasta/[x] - y.md").unwrap();
    let rw = renamed
        .rewrites
        .iter()
        .find(|r| r.path == "pasta/pasta.md")
        .unwrap();
    assert!(rw.after.contains("  - \"2024\"\n"), "{}", rw.after);
    assert!(rw.after.contains("  - \"[x] - y.md\"\n"), "{}", rw.after);
    apply(&mut ws, &renamed);
    assert_eq!(
        order_of(&mut ws, "pasta/pasta.md"),
        ["2024", "A.md", "[x] - y.md"]
    );
}

/// A note and a folder of the same name are two items: renaming the note
/// leaves the folder's.
#[test]
fn an_order_rewrite_tells_a_note_from_a_folder_of_its_name() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let (pasta, _files) = folder_with_order(
        vault.path(),
        "---\norder:\n  - Sketch.md\n  - Sketch\n---\n",
    );
    let _s = note(pasta.path(), "Sketch.md", "# s\n");
    let sketch = subdir(pasta.path(), "Sketch");
    let _n = note(sketch.path(), "n.md", "# n\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws
        .rename_entry("pasta/Sketch.md", "pasta/Draft.md")
        .unwrap();
    apply(&mut ws, &renamed);
    assert_eq!(order_of(&mut ws, "pasta/pasta.md"), ["Draft.md", "Sketch"]);
}

/// An item moved to another folder leaves the order; the others stay.
#[test]
fn an_item_moved_out_of_the_folder_leaves_its_order() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _pasta = folder_with_order(vault.path(), "---\norder:\n  - B.md\n  - A.md\n---\n");
    let outro = subdir(vault.path(), "outro");
    let _o = note(outro.path(), "O.md", "# O\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta/A.md", "outro/A.md").unwrap();
    apply(&mut ws, &renamed);
    assert_eq!(order_of(&mut ws, "pasta/pasta.md"), ["B.md"]);
}

/// With the folder note name setting, that note is the folder's; without
/// it, a `README.md` with an `order:` is an ordinary note.
#[test]
fn the_folder_note_name_setting_names_the_note_whose_order_is_rewritten() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let pasta = subdir(vault.path(), "pasta");
    let _a = note(pasta.path(), "A.md", "# A\n");
    let _readme = note(pasta.path(), "README.md", "---\norder:\n  - A.md\n---\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta/A.md", "pasta/B.md").unwrap();
    assert!(!renamed.rewrites.iter().any(|r| r.path == "pasta/README.md"));
    apply(&mut ws, &renamed);

    ws.set_folder_note_name("README");
    assert_eq!(
        ws.folder_note_of("pasta").unwrap().as_deref(),
        Some("pasta/README.md")
    );
    let read = ws.read_note("pasta/README.md").unwrap();
    ws.write_note(
        "pasta/README.md",
        "---\norder:\n  - B.md\n---\n",
        &read.revision,
    )
    .unwrap();
    ws.index().unwrap();
    let renamed = ws.rename_entry("pasta/B.md", "pasta/C.md").unwrap();
    apply(&mut ws, &renamed);
    assert_eq!(order_of(&mut ws, "pasta/README.md"), ["C.md"]);
}

/// A note that is not a folder note keeps its `order:` key as it is.
#[test]
fn a_note_that_is_not_a_folder_note_keeps_its_order() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let (pasta, _files) = folder_with_order(vault.path(), "# pasta\n");
    let _ideias = note(
        pasta.path(),
        "ideias.md",
        "---\norder:\n  - A.md\n---\n[[A]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta/A.md", "pasta/C.md").unwrap();
    let rw = renamed
        .rewrites
        .iter()
        .find(|r| r.path == "pasta/ideias.md")
        .unwrap();
    assert!(rw.after.contains("  - A.md\n"), "{}", rw.after);
    assert!(rw.after.contains("[[C]]"), "{}", rw.after);
}

/// A folder note beside its folder (`pasta.md`) follows its items, and a
/// rename at the root of a note of the same name leaves it alone.
#[test]
fn a_folder_note_beside_its_folder_is_rewritten_for_its_items_only() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let pasta = subdir(vault.path(), "pasta");
    let _a = note(pasta.path(), "A.md", "# A\n");
    let _root_a = note(vault.path(), "A.md", "# root A\n");
    let _beside = note(vault.path(), "pasta.md", "---\norder:\n  - A.md\n---\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("A.md", "B.md").unwrap();
    assert!(!renamed.rewrites.iter().any(|r| r.path == "pasta.md"));
    apply(&mut ws, &renamed);

    let renamed = ws.rename_entry("pasta/A.md", "pasta/C.md").unwrap();
    apply(&mut ws, &renamed);
    assert_eq!(order_of(&mut ws, "pasta.md"), ["C.md"]);
}

/// A rename keeps `pinned:` pointing at the note, as a link.
#[test]
fn a_rename_keeps_pinned_pointing_at_the_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _pasta = folder_with_order(vault.path(), "---\npinned:\n  - \"[[A]]\"\n---\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta/A.md", "pasta/C.md").unwrap();
    apply(&mut ws, &renamed);
    ws.index().unwrap();
    let pinned = ws
        .labels()
        .unwrap()
        .get("pasta/pasta.md")
        .and_then(|l| l.pinned.clone());
    assert_eq!(pinned.unwrap_or_default(), ["[[C]]"]);
}

/// The folder note is found whatever the case of its name; the root has
/// none.
#[test]
fn the_folder_note_is_found_without_case() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let pasta = subdir(vault.path(), "Pasta");
    let _n = note(pasta.path(), "pasta.md", "# p\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(
        ws.folder_note_of("Pasta").unwrap().as_deref(),
        Some("Pasta/pasta.md")
    );
    assert_eq!(ws.folder_note_of("").unwrap(), None);
}

/// Renaming a folder renames its folder note with it, inside or beside,
/// and links to that note follow (ADR 0060 D3, the maintainer on
/// 2026-10-02).
#[test]
fn renaming_a_folder_renames_its_folder_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let (_pasta, _files) = folder_with_order(
        vault.path(),
        "---\norder:\n  - B.md\n  - A.md\n---\n# Pasta\n",
    );
    let _other = subdir(vault.path(), "outra");
    let _o = note(_other.path(), "O.md", "# O\n");
    let _beside = note(vault.path(), "outra.md", "# beside\n");
    let _link = note(vault.path(), "Links.md", "[[pasta]] e [[outra]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let renamed = ws.rename_entry("pasta", "nova").unwrap();
    assert_eq!(
        renamed.also,
        [("pasta/pasta.md".to_owned(), "nova/nova.md".to_owned())]
    );
    assert!(exists(vault.path(), "nova/nova.md"));
    assert!(!exists(vault.path(), "nova/pasta.md"));
    apply(&mut ws, &renamed);
    assert_eq!(order_of(&mut ws, "nova/nova.md"), ["B.md", "A.md"]);

    let renamed = ws.rename_entry("outra", "segunda").unwrap();
    assert_eq!(
        renamed.also,
        [("outra.md".to_owned(), "segunda.md".to_owned())]
    );
    assert!(exists(vault.path(), "segunda.md"));
    apply(&mut ws, &renamed);
    let links = String::from_utf8(on_disk(vault.path(), "Links.md")).unwrap();
    assert_eq!(links, "[[nova]] e [[segunda]]\n");
}

/// A note named by the setting keeps its name; a note already at the new
/// name is left alone; a folder moved under its own name keeps its note's
/// name, and the note beside it goes along.
#[test]
fn a_folder_note_keeps_its_name_when_it_should() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let docs = subdir(vault.path(), "docs");
    let _readme = note(docs.path(), "README.md", "# r\n");
    let busy = subdir(vault.path(), "busy");
    let _own = note(busy.path(), "busy.md", "# own\n");
    let _taken = note(busy.path(), "livre.md", "# taken\n");
    let solo = subdir(vault.path(), "solo");
    let _s = note(solo.path(), "S.md", "# s\n");
    let _beside = note(vault.path(), "solo.md", "# beside\n");
    let dest = subdir(vault.path(), "dest");
    let _d = note(dest.path(), "D.md", "# d\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.set_folder_note_name("README");
    ws.index().unwrap();

    let renamed = ws.rename_entry("docs", "manual").unwrap();
    assert!(renamed.also.is_empty());
    assert!(exists(vault.path(), "manual/README.md"));

    let renamed = ws.rename_entry("busy", "livre").unwrap();
    assert!(renamed.also.is_empty());
    assert!(exists(vault.path(), "livre/busy.md"));
    assert!(exists(vault.path(), "livre/livre.md"));

    let renamed = ws.rename_entry("solo", "dest/solo").unwrap();
    assert_eq!(
        renamed.also,
        [("solo.md".to_owned(), "dest/solo.md".to_owned())]
    );
    assert!(exists(vault.path(), "dest/solo/S.md"));
    assert!(exists(vault.path(), "dest/solo.md"));
}

/// The root's items can be ordered (the maintainer, 2026-10-02): the root's
/// note is the one named after the open folder, and a rename at the root
/// rewrites its `order:`.
#[test]
fn the_root_note_orders_the_roots_items() {
    let vault = Builder::new().prefix("raiz").tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let root_name = vault
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let _a = note(vault.path(), "A.md", "# A\n");
    let _b = note(vault.path(), "B.md", "# B\n");
    let _root = note(
        vault.path(),
        &format!("{root_name}.md"),
        "---\norder:\n  - B.md\n  - A.md\n---\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(
        ws.folder_note_of("").unwrap(),
        Some(format!("{root_name}.md"))
    );

    let renamed = ws.rename_entry("A.md", "C.md").unwrap();
    apply(&mut ws, &renamed);
    assert_eq!(
        order_of(&mut ws, &format!("{root_name}.md")),
        ["B.md", "C.md"]
    );
}
