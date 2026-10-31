// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A rename made on the server reaches this computer as a rename (ADR 0079,
//! decided 2026-10-31, B12): never as a deletion of the old name, to the
//! folder's bin, and a new file — the log's `renamedFrom` is followed even
//! when the bytes changed too, and the window's tab follows the file. The
//! fallbacks lose nothing: an edit here goes with the file to its new name,
//! a name taken here keeps both.

use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::SyncLogEntry;

use super::lock;
use super::remote;
use super::tests_sync::{
    Device, Running, changed, copy_of, device, files, kept, on, serve, sync, text, write,
};

/// A window of the server's folder: the browser, or a desktop app online.
struct Window {
    remote: Arc<remote::Remote>,
    _heard: tokio::sync::mpsc::UnboundedReceiver<remote::Heard>,
}

fn window(r: &Running) -> Window {
    let login = verso_core::servers::ServerLogin {
        url: r.url.clone(),
        token: r.owner.clone(),
        email: "ana@casa.lan".into(),
        name: "Ana".into(),
    };
    tauri::async_runtime::block_on(async {
        let (remote, heard) = remote::dial(&login, r.folder.clone()).await.unwrap();
        remote
            .call("open_server_folder", json!({ "id": r.folder }))
            .await
            .unwrap();
        Window {
            remote,
            _heard: heard,
        }
    })
}

impl Window {
    fn call(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        tauri::async_runtime::block_on(self.remote.call(cmd, args))
    }

    /// The note's text written over what the window read, as its editor
    /// saves.
    fn edit(&self, path: &str, text: &str) {
        let read = self.call("read_note", json!({ "path": path })).unwrap();
        self.call(
            "write_note",
            json!({ "path": path, "text": text, "revision": read["revision"] }),
        )
        .unwrap();
    }

    /// Renamed as the window's tree and title do it: a note's new name
    /// without its `.md` (`files.ts`, `renameNote`).
    fn rename(&self, from: &str, to: &str) -> Value {
        self.call("rename_entry", json!({ "from": from, "to": to }))
            .unwrap()
    }
}

/// What the device's recent activity says, newest first.
fn said(d: &Device) -> Vec<SyncLogEntry> {
    lock(&d.shown)
        .last()
        .map(|s| s.log.clone())
        .unwrap_or_default()
}

fn none_deleted_here(d: &Device) {
    let log = said(d);
    assert!(
        !log.iter().any(|e| e.what == "deleted_here"),
        "a rename there went to the bin here: {log:?}"
    );
}

fn renamed_here(d: &Device, from: &str, to: &str) -> bool {
    said(d)
        .iter()
        .any(|e| e.what == "renamed_here" && e.path == to && e.other.as_deref() == Some(from))
}

/// The night of 2026-10-30, on the Mac: a note made in the server's
/// window, written there and renamed before this computer's next pass —
/// the pass found the old name gone and the new one with other bytes, and
/// sent the old file to the bin and fetched a new one.
#[test]
fn an_edit_then_a_rename_in_the_servers_window_arrive_as_a_rename() {
    let r = serve(&[("alvo.md", "# Alvo\n")]);
    let a = device(&r, &r.owner, &[]);
    let mut la = kept(&a);
    on(&a, &mut la);
    assert_eq!(text(&a, "alvo.md").as_deref(), Some("# Alvo\n"));
    let w = window(&r);
    w.edit("alvo.md", "# Alvo\n\nescrito na janela\n");
    let moved = w.rename("alvo.md", "alvo-renomeado");
    assert_eq!(moved["path"], "alvo-renomeado.md");
    on(&a, &mut la);
    assert_eq!(text(&a, "alvo.md"), None);
    assert_eq!(
        text(&a, "alvo-renomeado.md").as_deref(),
        Some("# Alvo\n\nescrito na janela\n")
    );
    assert!(
        renamed_here(&a, "alvo.md", "alvo-renomeado.md"),
        "{:?}",
        said(&a)
    );
    none_deleted_here(&a);
}

/// A rename there and an edit of the same file here: the file is renamed
/// here, and the edit sent to the new name, over the server's file as the
/// base left it (invariant 11) — never the old name back beside it.
#[test]
fn a_rename_there_and_an_edit_here_rename_here_and_send_the_edit() {
    let r = serve(&[("Sessao.md", "# Sessao\n")]);
    let a = device(&r, &r.owner, &[]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let w = window(&r);
    w.rename("Sessao.md", "Sessao 1");
    write(&a, "Sessao.md", b"# Sessao\n\neditada aqui\n");
    on(&a, &mut la);
    assert_eq!(text(&a, "Sessao.md"), None);
    assert_eq!(
        text(&a, "Sessao 1.md").as_deref(),
        Some("# Sessao\n\neditada aqui\n")
    );
    none_deleted_here(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    changed(&b, &[]);
    assert_eq!(files(&b), vec!["Sessao 1.md".to_owned()]);
    assert_eq!(
        text(&b, "Sessao 1.md").as_deref(),
        Some("# Sessao\n\neditada aqui\n")
    );
}

/// Renamed and edited there, edited here too: renamed here, and the two
/// edits are a conflict under the new name — the server's keeps it, this
/// computer's is the copy beside it (item 8).
#[test]
fn a_rename_and_an_edit_there_against_an_edit_here_is_a_conflict_under_the_new_name() {
    let r = serve(&[("Mapa.md", "# Mapa\n")]);
    let a = device(&r, &r.owner, &[]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let w = window(&r);
    w.edit("Mapa.md", "# Mapa\n\nda janela\n");
    w.rename("Mapa.md", "Mapa do mundo");
    write(&a, "Mapa.md", b"# Mapa daqui\n");
    on(&a, &mut la);
    assert_eq!(text(&a, "Mapa.md"), None);
    assert_eq!(
        text(&a, "Mapa do mundo.md").as_deref(),
        Some("# Mapa\n\nda janela\n")
    );
    let copy = copy_of(&a, "Mapa do mundo.md");
    assert_eq!(text(&a, &copy).as_deref(), Some("# Mapa daqui\n"));
    none_deleted_here(&a);
}

/// The new name taken here by a file of this computer's own: nothing is
/// renamed over it, and nothing is lost — the server's file takes the
/// name, this computer's is kept beside it as a copy, and the old name's
/// file, unchanged, goes as the server says (to the bin, restorable).
#[test]
fn a_rename_there_onto_a_name_taken_here_loses_nothing() {
    let r = serve(&[("Velha.md", "# Velha\n")]);
    let a = device(&r, &r.owner, &[]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let w = window(&r);
    w.edit("Velha.md", "# Velha\n\nmudou\n");
    w.rename("Velha.md", "Nova");
    write(&a, "Nova.md", b"# Nova daqui\n");
    on(&a, &mut la);
    assert_eq!(text(&a, "Nova.md").as_deref(), Some("# Velha\n\nmudou\n"));
    let copy = copy_of(&a, "Nova.md");
    assert_eq!(text(&a, &copy).as_deref(), Some("# Nova daqui\n"));
    assert_eq!(text(&a, "Velha.md"), None);
}

/// A folder renamed in the window, one of its notes edited first: every
/// file moves here as a rename, the edited one fetched after its move.
#[test]
fn a_folder_renamed_in_the_window_arrives_as_renames() {
    let r = serve(&[]);
    let a = device(
        &r,
        &r.owner,
        &[
            ("Pasta/Uma.md", "# Uma\n"),
            ("Pasta/Duas.md", "# Duas\n"),
            ("Pasta/Sub/Tres.md", "# Tres\n"),
        ],
    );
    let mut la = kept(&a);
    on(&a, &mut la);
    let w = window(&r);
    w.edit("Pasta/Uma.md", "# Uma\n\nantes de mudar\n");
    let moved = w.rename("Pasta", "Outra");
    assert_eq!(moved["path"], "Outra");
    on(&a, &mut la);
    assert_eq!(
        files(&a),
        vec![
            "Outra/Duas.md".to_owned(),
            "Outra/Sub/Tres.md".to_owned(),
            "Outra/Uma.md".to_owned()
        ]
    );
    assert_eq!(
        text(&a, "Outra/Uma.md").as_deref(),
        Some("# Uma\n\nantes de mudar\n")
    );
    for f in ["Uma.md", "Duas.md", "Sub/Tres.md"] {
        assert!(
            renamed_here(&a, &format!("Pasta/{f}"), &format!("Outra/{f}")),
            "{f}: {:?}",
            said(&a)
        );
    }
    none_deleted_here(&a);
}

/// Several moved into a folder at once in the window (the tree's
/// selection), one edited first.
#[test]
fn entries_moved_in_the_window_arrive_as_renames() {
    let r = serve(&[("Uma.md", "# Uma\n"), ("Duas.md", "# Duas\n")]);
    let a = device(&r, &r.owner, &[]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let w = window(&r);
    w.edit("Duas.md", "# Duas\n\neditada\n");
    w.call(
        "move_entries",
        json!({ "paths": ["Uma.md", "Duas.md"], "folder": "Arquivo" }),
    )
    .unwrap();
    on(&a, &mut la);
    assert_eq!(
        files(&a),
        vec!["Arquivo/Duas.md".to_owned(), "Arquivo/Uma.md".to_owned()]
    );
    assert_eq!(
        text(&a, "Arquivo/Duas.md").as_deref(),
        Some("# Duas\n\neditada\n")
    );
    none_deleted_here(&a);
}

/// The window here that shows the note hears where it went, as after a
/// rename made here: its tab follows it (`changes.ts`, `moved`).
#[test]
fn the_windows_here_hear_the_rename_so_a_tab_follows_its_note() {
    let r = serve(&[("Diario.md", "# Diario\n")]);
    let a = device(&r, &r.owner, &[]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let w = window(&r);
    w.edit("Diario.md", "# Diario\n\nhoje\n");
    w.rename("Diario.md", "Diario de bordo");
    let before = lock(&a.told).len();
    on(&a, &mut la);
    let told = lock(&a.told);
    let moved: Vec<&Value> = told[before..]
        .iter()
        .filter(|(_, event, _)| event == "folder-changed")
        .map(|(_, _, p)| p)
        .collect();
    assert!(
        moved.iter().any(|p| p["moved"]
            == json!([{ "from": "Diario.md", "to": "Diario de bordo.md" }])
            && p["key"] == a.key.as_str()),
        "{told:?}"
    );
}

/// Two renames in a row there before this computer's pass — a chain — and
/// a rename back to the name it had: one rename here, or none.
#[test]
fn a_chain_of_renames_there_is_one_rename_here() {
    let r = serve(&[("A.md", "# A\n"), ("Volta.md", "# Volta\n")]);
    let a = device(&r, &r.owner, &[]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let w = window(&r);
    w.edit("A.md", "# A\n\num\n");
    w.rename("A.md", "B");
    w.edit("B.md", "# A\n\num\ndois\n");
    w.rename("B.md", "C");
    w.rename("Volta.md", "Ida");
    w.rename("Ida.md", "Volta");
    w.edit("Volta.md", "# Volta\n\nde novo\n");
    on(&a, &mut la);
    assert_eq!(files(&a), vec!["C.md".to_owned(), "Volta.md".to_owned()]);
    assert_eq!(text(&a, "C.md").as_deref(), Some("# A\n\num\ndois\n"));
    assert_eq!(
        text(&a, "Volta.md").as_deref(),
        Some("# Volta\n\nde novo\n")
    );
    assert!(renamed_here(&a, "A.md", "C.md"), "{:?}", said(&a));
    none_deleted_here(&a);
}

/// A small deterministic generator, as the night's stress tests use.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n.max(1) as u64)).unwrap_or(0)
    }
}

/// Seeded: the server's window edits and renames (into folders too, to
/// fresh names) while this computer edits the same notes and passes at
/// random moments. The window never deletes, so a deletion here is a
/// rename that arrived as one — never allowed; every edit made here is on
/// the server at the end, in its file or in a conflict copy; and a second
/// device that syncs afterwards holds what this one holds.
#[test]
fn renames_there_and_edits_here_in_random_orders_never_delete_and_lose_nothing() {
    for seed in 1..=6_u64 {
        let mut rng = Rng(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1);
        let names: Vec<String> = (0..4).map(|i| format!("N{i}.md")).collect();
        let start: Vec<(String, String)> = names
            .iter()
            .map(|n| (n.clone(), format!("# {n}\n")))
            .collect();
        let start_ref: Vec<(&str, &str)> = start
            .iter()
            .map(|(p, t)| (p.as_str(), t.as_str()))
            .collect();
        let r = serve(&start_ref);
        let a = device(&r, &r.owner, &[]);
        let mut la = kept(&a);
        on(&a, &mut la);
        let w = window(&r);
        // Where each note is on the server now, as the window renamed it.
        let mut there: Vec<String> = names.clone();
        let mut fresh = 0_u32;
        let mut mine: Vec<String> = Vec::new();
        for k in 0..18 {
            let i = rng.below(there.len());
            match rng.below(6) {
                0 | 1 => {
                    let p = there[i].clone();
                    let now = w.call("read_note", json!({ "path": p })).unwrap();
                    let t = format!("{}w{seed}-{k}\n", now["text"].as_str().unwrap());
                    w.edit(&p, &t);
                }
                2 | 3 => {
                    fresh += 1;
                    let dir = if rng.below(3) == 0 { "Pasta/" } else { "" };
                    let to = format!("{dir}R{fresh}");
                    let done = w.rename(&there[i], &to);
                    there[i] = done["path"].as_str().unwrap().to_owned();
                }
                4 => {
                    // An edit here, to the note as this computer names it.
                    let here = files(&a);
                    if let Some(p) = here
                        .iter()
                        .filter(|p| !p.contains("conflit"))
                        .nth(rng.below(here.len()))
                    {
                        let tag = format!("aqui{seed}-{k}");
                        let t = format!("{}{tag}\n", text(&a, p).unwrap_or_default());
                        write(&a, p, t.as_bytes());
                        mine.push(tag);
                    }
                }
                _ => {
                    changed(&a, &[]);
                    on(&a, &mut la);
                }
            }
        }
        // Quiet: passes until nothing is left to do.
        for _ in 0..6 {
            changed(&a, &[]);
            if on(&a, &mut la).actions == 0 {
                break;
            }
        }
        none_deleted_here(&a);
        let b = device(&r, &r.owner, &[]);
        sync(&b);
        changed(&a, &[]);
        changed(&b, &[]);
        assert_eq!(files(&a), files(&b), "seed {seed}");
        for p in files(&a) {
            assert_eq!(text(&a, &p), text(&b, &p), "seed {seed}: {p}");
        }
        let all: String = files(&b)
            .iter()
            .filter_map(|p| text(&b, p))
            .collect::<Vec<_>>()
            .join("\n");
        for tag in &mine {
            assert!(all.contains(tag.as_str()), "seed {seed}: {tag} lost");
        }
    }
}
