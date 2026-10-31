//! Creating, renaming, moving and binning: the plan of link edits, and what a
//! rename that happened reports.

use super::*;

#[test]
fn notes_are_created_renamed_with_a_link_plan_and_trashed() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _src = note(
        vault.path(),
        "Origem.md",
        "Ver [[Alvo]], [[alvo.md|apelido]], [[Alvo#Sec]] e `[[Alvo]]` e [[Outra]].\n",
    );
    let _far = subdir(vault.path(), "pasta");
    let _src2 = note(
        &vault.path().join("pasta"),
        "Longe.md",
        "[[../Alvo]] [[Alvo]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    // Create, in a folder that does not exist yet; twice is refused.
    let created = ws.create_note("nova/Alvo", "# Alvo\n").unwrap();
    assert_eq!(created.path, "nova/Alvo.md");
    assert!(!created.stale);
    // The folder it made is listed at once, with no walk in between.
    assert!(ws.folders().contains(&"nova".to_owned()));
    assert!(matches!(
        ws.create_note("nova/Alvo.md", "x"),
        Err(CoreError::Write(verso_core::WriteError::Exists))
    ));
    assert_eq!(ws.backlinks("nova/Alvo").unwrap().unwrap().len(), 4);

    // Rename: the file moves, the index follows, the plan names the two
    // linking notes with their links pointed at the new name — bare names
    // stay bare, the extension stays when it was written, the alias and
    // the fragment are kept; the code span is text, not a link, and the
    // unrelated link is untouched.
    let renamed = ws.rename_note("nova/Alvo", "nova/Meta.md").unwrap();
    assert_eq!(renamed.path, "nova/Meta.md");
    assert!(
        renamed.skipped.is_empty() && renamed.warnings.is_empty(),
        "{renamed:?}"
    );
    assert!(ws.read_note("nova/Meta").is_ok());
    assert!(ws.read_note("nova/Alvo").is_err());
    assert_eq!(
        plan_of(&renamed),
        [
            (
                "Origem.md",
                "Ver [[Meta]], [[Meta.md|apelido]], [[Meta#Sec]] e `[[Alvo]]` e [[Outra]].\n"
            ),
            ("pasta/Longe.md", "[[../Alvo]] [[Meta]]\n"),
        ]
    );
    // Nothing but the renamed file was written: the plan is applied by
    // the caller, one atomic write per note, with the revision it carries.
    assert_eq!(
        ws.read_note("Origem").unwrap().text,
        "Ver [[Alvo]], [[alvo.md|apelido]], [[Alvo#Sec]] e `[[Alvo]]` e [[Outra]].\n"
    );
    apply(&mut ws, &renamed);
    assert_eq!(ws.backlinks("nova/Meta").unwrap().unwrap().len(), 4);

    // Delete: into .trash/, keeping the relative path; gone from the index.
    let gone = ws.delete_note("nova/Meta").unwrap();
    assert_eq!(gone.path, ".trash/nova/Meta.md");
    assert!(gone.warnings.is_empty(), "{gone:?}");
    assert!(ws.read_note("nova/Meta").is_err());
    assert!(ws.notes().unwrap().iter().all(|p| p != "nova/Meta.md"));
    assert_eq!(ws.index().unwrap().removed, 0);
}

/// A move can change what a link that never named the moved note
/// reaches: a note renamed to `B` at the root comes before `x/B` for
/// every bare `[[B]]` (a path from the root is tried first). Those links
/// get a plan too, pointing them back at what they reached.
#[test]
fn a_note_moved_into_a_bare_links_way_gets_that_link_a_plan() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let x = subdir(vault.path(), "x");
    let _b = note(x.path(), "B.md", "# x/B\n");
    let _c = note(vault.path(), "C.md", "# C\n");
    let _r = note(vault.path(), "R.md", "[[B]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(resolved(&mut ws, "R"), vec![Some("x/B.md".into())]);
    let r = ws.rename_note("C", "B").unwrap();
    assert_eq!(plan_of(&r), [("R.md", "[[x/B]]\n")]);
    apply(&mut ws, &r);
    assert_eq!(resolved(&mut ws, "R"), vec![Some("x/B.md".into())]);
}

/// A new name the parser would read as something else — a `|` starts an
/// alias, a `#` a heading, `]]` ends the link — cannot be written into a
/// link: the plan leaves such a link alone and says so, rather than point
/// it at another note.
#[test]
fn a_new_name_a_link_cannot_hold_is_not_written_into_links() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _alvo = note(vault.path(), "Alvo.md", "# Alvo\n");
    let _a = note(vault.path(), "A.md", "# A\n");
    let _x = note(vault.path(), "X.md", "[[Alvo]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    for to in ["A|B", "A#B", "x]]y"] {
        // Windows cannot keep a `|` in a name, so no OS makes one: refused
        // before any plan is made (ADR 0070).
        if to.contains('|') {
            let got = ws.rename_note("Alvo", to);
            // Refused by the core's confinement on Windows, by the new-name
            // check of the rename elsewhere: the same reason either way.
            assert!(
                matches!(
                    got,
                    Err(CoreError::Confined(
                        verso_core::ConfinementError::UnportableName
                    )) | Err(CoreError::Write(verso_core::WriteError::Confined(
                        verso_core::ConfinementError::UnportableName
                    )))
                ),
                "{to}: {got:?}"
            );
            continue;
        }
        let r = ws.rename_note("Alvo", to).unwrap();
        assert!(r.rewrites.is_empty(), "{to}: {:?}", r.rewrites);
        assert!(
            r.warnings
                .iter()
                .any(|w| w.contains("could not be pointed at")),
            "{to}: {:?}",
            r.warnings
        );
        // Nothing was written, so X still says `[[Alvo]]`, which now
        // reaches nothing — and never `A.md` or X itself.
        assert_eq!(resolved(&mut ws, "X"), vec![None], "{to}");
        // Back, for the next name: the link reaches it again as written.
        let back = ws.rename_note(to, "Alvo").unwrap();
        assert!(back.rewrites.is_empty(), "{to}: {:?}", back.rewrites);
    }
}

/// The plan follows what each link resolved to (spec Q12), not its text:
/// a link whose text matches but that reached another note is left
/// alone; a bare name that a move would send elsewhere becomes a path.
#[test]
fn the_plan_rewrites_only_the_links_that_reached_the_moved_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let a = subdir(vault.path(), "a");
    let b = subdir(vault.path(), "b");
    let z = subdir(vault.path(), "z");
    let _alvo_a = note(a.path(), "Alvo.md", "# A\n");
    let _alvo_b = note(b.path(), "Alvo.md", "# B\n");
    let _x = note(b.path(), "X.md", "[[a/Alvo]] [[Alvo]]\n");
    let _y = note(a.path(), "Y.md", "[[Alvo]] [[Alvo.MD|x]]\n");
    let _q = note(z.path(), "Q.md", "[[Alvo]]\n");
    let _doc = note(
        vault.path(),
        "Doc.md",
        "[[a/Alvo]]\n\n```markdown\n[[a/Alvo]]\n```\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(
        resolved(&mut ws, "b/X"),
        vec![Some("a/Alvo.md".into()), Some("b/Alvo.md".into())]
    );
    assert_eq!(resolved(&mut ws, "z/Q"), vec![Some("a/Alvo.md".into())]);

    // A rename in place: the bare link of `b/X` reached `b/Alvo` and stays;
    // the fenced block is text; `z/Q`'s bare name still reaches by name.
    let r = ws.rename_note("a/Alvo", "a/Meta").unwrap();
    assert_eq!(
        plan_of(&r),
        [
            ("Doc.md", "[[a/Meta]]\n\n```markdown\n[[a/Alvo]]\n```\n"),
            ("a/Y.md", "[[Meta]] [[Meta.MD|x]]\n"),
            ("b/X.md", "[[a/Meta]] [[Alvo]]\n"),
            ("z/Q.md", "[[Meta]]\n"),
        ]
    );
    apply(&mut ws, &r);
    assert_eq!(
        resolved(&mut ws, "b/X"),
        vec![Some("a/Meta.md".into()), Some("b/Alvo.md".into())]
    );

    // A new name taken at the root: a bare `[[Meta]]` would reach the root
    // note (a path from the root comes first), so the plan writes a path.
    let _root_meta = note(vault.path(), "Alvo.md", "# root\n");
    ws.index().unwrap();
    let r = ws.rename_note("a/Meta", "a/Alvo").unwrap();
    assert_eq!(
        plan_of(&r),
        [
            ("Doc.md", "[[a/Alvo]]\n\n```markdown\n[[a/Alvo]]\n```\n"),
            ("a/Y.md", "[[a/Alvo]] [[a/Alvo.MD|x]]\n"),
            ("b/X.md", "[[a/Alvo]] [[Alvo]]\n"),
            ("z/Q.md", "[[a/Alvo]]\n"),
        ]
    );
    apply(&mut ws, &r);
    assert_eq!(resolved(&mut ws, "z/Q"), vec![Some("a/Alvo.md".into())]);
    assert_eq!(resolved(&mut ws, "a/Y"), vec![Some("a/Alvo.md".into()); 2]);
}

/// Moving a note out of its folder can send a bare link of a sibling to
/// another note of the same name (ADR 0048, requirement of 2026-09-22):
/// the plan says so with a path instead of letting it happen in silence.
#[test]
fn a_move_that_would_retarget_a_bare_link_gets_a_plan_not_silence() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let a = subdir(vault.path(), "a");
    let b = subdir(vault.path(), "b");
    let _alvo_a = note(a.path(), "Alvo.md", "# A\n\n[[../b/Alvo|irmão]]\n");
    let _alvo_b = note(b.path(), "Alvo.md", "# B\n");
    let _x = note(a.path(), "X.md", "[[Alvo]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(resolved(&mut ws, "a/X"), vec![Some("a/Alvo.md".into())]);
    let r = ws.rename_note("a/Alvo", "c/d/Alvo").unwrap();
    // The sibling's bare name would now reach `b/Alvo`; the moved note's
    // own relative link would reach nothing from `c/d/`. Both get a path.
    assert_eq!(
        plan_of(&r),
        [
            ("a/X.md", "[[c/d/Alvo]]\n"),
            ("c/d/Alvo.md", "# A\n\n[[b/Alvo|irmão]]\n"),
        ]
    );
    apply(&mut ws, &r);
    assert_eq!(resolved(&mut ws, "a/X"), vec![Some("c/d/Alvo.md".into())]);
    assert_eq!(
        resolved(&mut ws, "c/d/Alvo"),
        vec![Some("b/Alvo.md".into())]
    );
}

/// A rename that happened is reported as such: a linker that cannot be
/// read is skipped and named, and a sidecar that cannot be written is a
/// warning — never a failure that hides the move (ADR 0048).
#[test]
fn a_rename_that_happened_reports_what_it_could_not_plan_or_confirm() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _alvo = note(vault.path(), "Alvo.md", "# Alvo\n");
    let x = note(vault.path(), "X.md", "[[Alvo]]\n");
    let _y = note(vault.path(), "Y.md", "[[Alvo]]\n");
    let _mapa = note(vault.path(), "mapa.png", "png");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    // X is evicted by iCloud (older form) after it was indexed.
    drop(x);
    let _evicted = note(vault.path(), ".X.md.icloud", "<plist/>");
    ws.index().unwrap();
    let r = ws.rename_note("Alvo", "Meta").unwrap();
    assert_eq!(r.path, "Meta.md");
    assert_eq!(plan_of(&r), vec![("Y.md", "[[Meta]]\n")]);
    assert_eq!(
        r.skipped
            .iter()
            .map(|s| (s.path.as_str(), s.reason))
            .collect::<Vec<_>>(),
        vec![("X.md", SkipReason::Unavailable)]
    );
    assert!(exists(vault.path(), "Meta.md") && !exists(vault.path(), "Alvo.md"));
    // The evicted note kept its last known version, whose link now points
    // at the old name like the one the plan could not touch.
    apply(&mut ws, &r);
    assert_eq!(ws.backlinks("Meta").unwrap().unwrap().len(), 1);
    assert_eq!(ws.is_unverified("X").unwrap(), Some(true));
    let unresolved = ws.unresolved().unwrap();
    assert_eq!(
        (unresolved[0].target.as_str(), unresolved[0].count),
        ("Alvo", 1)
    );
    // A retry is what it is: the source is gone.
    assert!(matches!(
        ws.rename_note("Alvo", "Meta"),
        Err(CoreError::Write(_))
    ));

    // The index directory cannot take the sidecar: the move is answered,
    // with the sidecar failure as a warning.
    let index_dir = ws.index_path().parent().unwrap().to_path_buf();
    crate::shell::unwritable(&index_dir, true);
    let r = ws.rename_entry("mapa.png", "mapa2.png");
    crate::shell::unwritable(&index_dir, false);
    let r = r.unwrap();
    assert_eq!(r.path, "mapa2.png");
    assert!(
        r.warnings.iter().any(|w| w.contains("sidecar")),
        "{:?}",
        r.warnings
    );
    assert!(exists(vault.path(), "mapa2.png"));
}

#[test]
fn any_entry_is_listed_with_size_and_date_renamed_with_a_plan_and_trashed() {
    use verso_core::FileKind;
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _origem = note(
        vault.path(),
        "Origem.md",
        "[[pasta/Alvo]] [[Alvo]] ![[mapa.png]] ![[pasta/planta.png]]\n",
    );
    let _mapa = note(vault.path(), "mapa.png", "png");
    let _pasta = subdir(vault.path(), "pasta");
    let _planta = note(&vault.path().join("pasta"), "planta.png", "png");
    let _alvo = note(&vault.path().join("pasta"), "Alvo.md", "# Alvo\n");
    let _irmao = note(
        &vault.path().join("pasta"),
        "Irmão.md",
        "[[Alvo]] [[pasta/Alvo]] ![[planta.png]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    // The listing: every kind, with the length and a date the walk read.
    let entries = ws.entries();
    let of = |p: &str| entries.iter().find(|e| e.path == p).unwrap();
    assert_eq!(of("pasta").kind, FileKind::Folder);
    assert_eq!(
        (of("mapa.png").kind, of("mapa.png").len),
        (FileKind::File, 3)
    );
    assert_eq!(of("Origem.md").kind, FileKind::Note);
    assert!(of("Origem.md").len > 0 && of("Origem.md").modified > 0);

    // A folder moves with everything under it; the notes that linked by
    // path to a note or an attachment inside get a plan, read at their
    // new paths; a bare name that still reaches its target is left alone.
    let renamed = ws.rename_entry("pasta", "nova").unwrap();
    assert_eq!(renamed.path, "nova");
    assert!(
        renamed.skipped.is_empty() && renamed.warnings.is_empty(),
        "{renamed:?}"
    );
    assert!(ws.read_note("nova/Alvo").is_ok());
    assert!(ws.read_note("pasta/Alvo").is_err());
    assert_eq!(
        plan_of(&renamed),
        [
            (
                "Origem.md",
                "[[nova/Alvo]] [[Alvo]] ![[mapa.png]] ![[nova/planta.png]]\n"
            ),
            ("nova/Irmão.md", "[[Alvo]] [[nova/Alvo]] ![[planta.png]]\n"),
        ]
    );
    assert!(ws.folders().contains(&"nova".to_owned()));
    assert!(!ws.folders().contains(&"pasta".to_owned()));
    apply(&mut ws, &renamed);

    // An attachment: the embeds that reached it are rewritten; a bare
    // name stays bare when the file still resolves by name.
    let renamed = ws.rename_entry("mapa.png", "img/mapa2.png").unwrap();
    assert_eq!(renamed.path, "img/mapa2.png");
    assert_eq!(
        plan_of(&renamed),
        [(
            "Origem.md",
            "[[nova/Alvo]] [[Alvo]] ![[mapa2.png]] ![[nova/planta.png]]\n"
        )]
    );
    assert_eq!(
        ws.resolve_file("Origem.md", "mapa2.png").as_deref(),
        Some("img/mapa2.png")
    );
    assert!(ws.resolve_file("Origem.md", "mapa.png").is_none());

    // A note by the same door goes through `rename_note`.
    let renamed = ws.rename_entry("nova/Irmão.md", "nova/Irmã.md").unwrap();
    assert_eq!(renamed.path, "nova/Irmã.md");

    // The bin takes a folder whole, and a file; the index forgets them.
    let gone = ws.delete_entry("nova").unwrap();
    assert_eq!(gone.path, ".trash/nova");
    assert!(gone.warnings.is_empty(), "{gone:?}");
    assert!(ws.notes().unwrap().iter().all(|p| !p.starts_with("nova/")));
    assert!(!ws.folders().contains(&"nova".to_owned()));
    assert_eq!(
        ws.delete_entry("img/mapa2.png").unwrap().path,
        ".trash/img/mapa2.png"
    );
    assert!(ws.files().is_empty());
    assert_eq!(ws.index().unwrap().removed, 0);
}

/// A file beside a note of the same stem is its own entry: a file
/// operation on `README` never reaches `README.md`.
#[test]
fn a_file_beside_a_note_of_the_same_stem_is_its_own_entry() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _readme = note(vault.path(), "README", "plain file\n");
    let _readme_md = note(vault.path(), "README.md", "# the note\n");
    let _todo = note(vault.path(), "TODO", "plain\n");
    let _todo_md = note(vault.path(), "TODO.md", "# todo note\n");
    let _dados = note(vault.path(), "dados", "d\n");
    let _dados_md = note(vault.path(), "dados.md", "# dados\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(ws.delete_entry("README").unwrap().path, ".trash/README");
    assert!(exists(vault.path(), "README.md") && !exists(vault.path(), "README"));
    assert_eq!(ws.rename_entry("TODO", "FEITO").unwrap().path, "FEITO");
    assert!(exists(vault.path(), "TODO.md") && exists(vault.path(), "FEITO"));
    let plain = ws.read_text("dados").unwrap();
    assert_eq!(plain.text, "d\n");
    let written = ws.write_text("dados", "e\n", &plain.revision).unwrap();
    assert_eq!(written.path, "dados");
    assert_eq!(on_disk(vault.path(), "dados.md"), b"# dados\n");
    assert_eq!(
        ws.notes().unwrap(),
        vec!["README.md", "TODO.md", "dados.md"]
    );
}

/// A folder move keeps what the index knew of an evicted note (ADR 0043
/// decision 2), and an evicted attachment is present, not absent.
#[test]
fn a_folder_move_keeps_the_last_known_version_of_an_evicted_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let pasta = subdir(vault.path(), "pasta");
    let img = subdir(vault.path(), "img");
    let x = note(pasta.path(), "X.md", "palavraunica [[Alvo]]\n");
    let _alvo = note(vault.path(), "Alvo.md", "# Alvo\n");
    let _n = note(vault.path(), "N.md", "![[mapa.png]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    drop(x);
    let _evicted = note(pasta.path(), ".X.md.icloud", "<plist/>");
    let _evicted_png = note(img.path(), ".mapa.png.icloud", "<plist/>");
    let r = ws.index().unwrap();
    assert_eq!((r.placeholders, r.removed), (2, 0), "{r:?}");
    assert_eq!(ws.search("palavraunica", 10).unwrap().len(), 1);

    let r = ws.rename_entry("pasta", "nova").unwrap();
    assert_eq!(r.path, "nova");
    assert_eq!(ws.notes().unwrap(), vec!["Alvo.md", "N.md", "nova/X.md"]);
    assert_eq!(ws.search("palavraunica", 10).unwrap()[0].path, "nova/X.md");
    assert_eq!(ws.is_unverified("nova/X").unwrap(), Some(true));
    assert_eq!(ws.backlinks("Alvo").unwrap().unwrap()[0].from, "nova/X.md");
    // The moved placeholder could not be read for the plan, and says so.
    assert_eq!(
        r.skipped
            .iter()
            .map(|s| (s.path.as_str(), s.reason))
            .collect::<Vec<_>>(),
        vec![("nova/X.md", SkipReason::Unavailable)]
    );

    // The evicted attachment resolves, and reading it says unavailable.
    assert_eq!(
        ws.resolve_file("N.md", "mapa.png").as_deref(),
        Some("img/mapa.png")
    );
    assert!(matches!(
        ws.read_file("img/mapa.png"),
        Err(CoreError::Read(verso_fs::ReadError::Unavailable))
    ));
}

/// Several entries moved at once (ADR 0048, revised 2026-10-07): one
/// examination before any moves, one plan over where everything ended. A
/// note linking to two moved folders gets one rewrite; a moved note
/// linking to a moved folder is planned at its new path; an entry inside
/// a moved folder goes with it; a name taken in the destination is
/// refused and the others move.
#[test]
fn several_entries_move_into_a_folder_with_one_plan() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _dest = subdir(vault.path(), "dest");
    let _taken = note(&vault.path().join("dest"), "B.md", "outra B\n");
    let _p = subdir(vault.path(), "pasta");
    let _c = note(&vault.path().join("pasta"), "C.md", "c\n");
    let _o = subdir(vault.path(), "outra");
    let _d = note(&vault.path().join("outra"), "D.md", "d\n");
    let _a = note(vault.path(), "A.md", "ver [[pasta/C]]\n");
    let _b = note(vault.path(), "B.md", "b\n");
    let _i = note(vault.path(), "Indice.md", "[[pasta/C]] e [[outra/D]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let paths: Vec<String> = ["A.md", "B.md", "pasta", "pasta/C.md", "outra"]
        .map(String::from)
        .to_vec();
    let done = ws.move_entries(&paths, "dest").unwrap();

    let moved: Vec<(&str, &str)> = done
        .moved
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    assert_eq!(
        moved,
        [
            ("A.md", "dest/A.md"),
            ("pasta", "dest/pasta"),
            ("outra", "dest/outra")
        ]
    );
    assert_eq!(done.refused.len(), 1, "{done:?}");
    assert_eq!(done.refused[0].0, "B.md");
    assert!(
        matches!(
            done.refused[0].1,
            CoreError::Write(verso_core::WriteError::Exists)
        ),
        "{done:?}"
    );
    assert!(exists(vault.path(), "B.md") && exists(vault.path(), "dest/pasta/C.md"));

    // One rewrite per note: Indice, for both folders at once. A moved
    // beside the folder it links into: `pasta/C` from `dest/A.md` reaches
    // `dest/pasta/C.md` as it is, so A needs none. Nothing written yet:
    // the caller applies the plan.
    let plan: Vec<(&str, &str)> = done
        .rewrites
        .iter()
        .map(|w| (w.path.as_str(), w.after.as_str()))
        .collect();
    assert_eq!(
        plan,
        [("Indice.md", "[[dest/pasta/C]] e [[dest/outra/D]]\n")]
    );
    assert_eq!(
        resolved(&mut ws, "dest/A"),
        [Some("dest/pasta/C.md".to_owned())]
    );
    assert_eq!(
        on_disk(vault.path(), "Indice.md"),
        b"[[pasta/C]] e [[outra/D]]\n"
    );

    // Nothing left to move: an empty answer.
    let again = ws.move_entries(&["dest/A.md".to_owned()], "dest").unwrap();
    assert!(again.moved.is_empty() && again.refused.is_empty() && again.rewrites.is_empty());
}

/// The demo vault, renamed in, writes the same bytes on every OS (ADR 0069,
/// ADR 0070): a folder synced between macOS, Windows and Linux must come
/// back as it would from any of them. A note moved by name rewrites the
/// links that reached it with `/`, never `\`, and every other file stays
/// byte for byte. The vault is copied through `verso-fs` (this crate's
/// tests may not call `std::fs`).
#[test]
fn a_rename_in_the_demo_vault_writes_the_same_bytes_on_every_os() {
    use std::collections::BTreeMap;
    let demo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../demo-vault");
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let snapshot = |dir: &Path| -> BTreeMap<String, Vec<u8>> {
        let mut root = verso_fs::Root::open(dir, vec![]).unwrap();
        let walk = root.walk();
        walk.entries
            .iter()
            .filter(|e| e.kind != verso_fs::EntryKind::Directory)
            .map(|e| {
                let rel = e.relative.to_string_lossy().into_owned();
                (rel, root.read(e.handle).unwrap().0)
            })
            .collect()
    };
    let source = snapshot(&demo);
    assert!(source.len() > 30, "{}", source.len());
    let mut target = verso_fs::Root::open(vault.path(), vec![]).unwrap();
    for (rel, bytes) in &source {
        let _ = target.create(Path::new(rel), bytes).unwrap();
    }
    let before = snapshot(vault.path());
    assert_eq!(before, source, "the copy is the demo vault, byte for byte");

    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let old = "Personagens/Capitão Ruy";
    let new = "Personagens/Capitão Rui";
    let reached = ws.backlinks(old).unwrap().unwrap().len();
    assert!(reached > 0);
    let r = ws.rename_note(old, new).unwrap();
    assert!(!r.rewrites.is_empty());
    let slashes = |s: &str| s.matches('\\').count();
    for w in &r.rewrites {
        assert_eq!(
            slashes(&w.after),
            slashes(&w.before),
            "a `\\` appeared in {}",
            w.path
        );
        // A link written with its folder keeps it; one written by name
        // alone (note 24's table) stays by name.
        let kept = if w.before.contains("Personagens/Capitão Ruy") {
            "Personagens/Capitão Rui"
        } else {
            "Capitão Rui"
        };
        assert!(w.after.contains(kept), "{}: {}", w.path, w.after);
        let _ = ws.write_note(&w.path, &w.after, &w.revision).unwrap();
    }
    ws.index().unwrap();
    assert_eq!(ws.backlinks(new).unwrap().unwrap().len(), reached);
    assert!(
        !ws.unresolved()
            .unwrap()
            .iter()
            .any(|u| format!("{u:?}").contains("Capitão Ruy")),
        "a link still points at the old name"
    );

    let after = snapshot(vault.path());
    let rewritten: Vec<&str> = r.rewrites.iter().map(|w| w.path.as_str()).collect();
    assert_eq!(
        after.get("Personagens/Capitão Rui.md"),
        before.get("Personagens/Capitão Ruy.md")
    );
    for (rel, bytes) in &before {
        if rel == "Personagens/Capitão Ruy.md" {
            assert!(!after.contains_key(rel));
        } else if rewritten
            .iter()
            .any(|p| p.trim_end_matches(".md") == rel.trim_end_matches(".md"))
        {
            assert_ne!(
                after.get(rel),
                Some(bytes),
                "{rel} was planned and not written"
            );
        } else {
            assert_eq!(
                after.get(rel),
                Some(bytes),
                "{rel} changed though no plan named it"
            );
        }
    }
}

/// Two names that differ only in case are two files on Linux and on the
/// server, one on a Mac or Windows: a name Verso makes is refused beside
/// its case twin, with the reason, on every system (spec Q8, decided
/// 2026-10-12; ADR 0070 item 3) — a note, a folder, a rename. A file
/// renamed to its own name in another case is no twin of itself.
#[test]
fn a_name_differing_only_in_case_from_another_entry_is_refused() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    ws.create_note("Nota", "# Nota\n").unwrap();
    ws.create_note("Outra", "# Outra\n").unwrap();
    ws.create_folder("Pasta").unwrap();
    let twin = |got: Result<(), CoreError>, what: &str| match got {
        Err(
            e @ CoreError::Write(verso_core::WriteError::Confined(
                verso_core::ConfinementError::CaseTwin,
            )),
        ) => assert!(
            e.to_string().contains("differs only in case"),
            "{what}: {e}"
        ),
        other => panic!("{what}: {other:?}"),
    };
    twin(ws.create_note("nota", "x").map(|_| ()), "create nota.md");
    twin(
        ws.create_file("NOTA.md", b"x").map(|_| ()),
        "create NOTA.md",
    );
    twin(ws.create_folder("pasta").map(|_| ()), "create pasta");
    twin(
        ws.rename_note("Outra", "nota.md").map(|_| ()),
        "rename Outra.md to nota.md",
    );
    twin(
        ws.rename_entry("Outra.md", "NOTA.md").map(|_| ()),
        "rename Outra.md to NOTA.md",
    );
    let mut listed: Vec<String> = std::fs::read_dir(vault.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    listed.sort();
    assert_eq!(listed, ["Nota.md", "Outra.md", "Pasta"]);
    // Its own case variant: allowed, the file under the new spelling only.
    let renamed = ws.rename_note("Nota", "nota.md").unwrap();
    assert_eq!(renamed.path, "nota.md");
    ws.rename_entry("Pasta", "pasta").unwrap();
    let mut listed: Vec<String> = std::fs::read_dir(vault.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    listed.sort();
    assert_eq!(listed, ["Outra.md", "nota.md", "pasta"]);
    // A name with no twin is made as before, in the folder as it is listed.
    ws.create_note("pasta/Nova", "x").unwrap();
    ws.rename_note("Outra", "Outra2.md").unwrap();
}
