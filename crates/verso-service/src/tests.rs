// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;

#[test]
fn every_command_of_the_folder_is_dispatched_by_name() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    for (name, _) in ops::FOLDER_COMMANDS {
        // Every name is known to dispatch: bad arguments are refused, an
        // unknown command is `None`.
        assert!(
            service
                .dispatch("a", name, serde_json::json!({"x": 1}))
                .is_some(),
            "{name}"
        );
    }
    assert!(
        service
            .dispatch("a", "pick_folder", serde_json::Value::Null)
            .is_none()
    );
    let notes = service
        .dispatch("a", "list_notes", serde_json::Value::Null)
        .unwrap()
        .unwrap();
    assert_eq!(notes, serde_json::json!([]));
    let made = service
        .dispatch(
            "a",
            "create_note",
            serde_json::json!({"name": "Nota", "text": "# Nota\n"}),
        )
        .unwrap()
        .unwrap();
    assert_eq!(made["path"], "Nota.md");
    let read = service
        .dispatch("a", "read_note", serde_json::json!({"path": "Nota.md"}))
        .unwrap()
        .unwrap();
    assert_eq!(read["text"], "# Nota\n");
    // A client that shows no folder is told so.
    let none = service
        .dispatch("b", "list_notes", serde_json::Value::Null)
        .unwrap();
    assert_eq!(none.unwrap_err().kind, ErrorKind::NoFolder);
}

#[test]
fn a_folder_closes_with_its_last_client() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    let (info, _) = service.attach("a", opened);
    assert!(service.join("b", &info.key));
    service.release("a");
    assert!(service.current_folder("b").is_some());
    service.release("b");
    assert!(!service.join("c", &info.key));
}

/// A panic while holding the lock of the table or of a folder poisons it,
/// and it still answers: a panic in one command must not make every later
/// one fail until restart.
#[test]
fn a_poisoned_lock_still_answers() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    let boom = service.with("a", |_| -> Result<(), OpError> {
        panic!("boom in the core")
    });
    assert_eq!(boom.unwrap_err().kind, ErrorKind::Failed);
    let poisoned = std::thread::scope(|s| {
        s.spawn(|| {
            let _guard = service.sessions.lock().unwrap();
            panic!("poison");
        })
        .join()
    });
    assert!(poisoned.is_err());
    assert!(service.sessions.is_poisoned());
    assert!(
        service
            .dispatch("a", "list_notes", serde_json::Value::Null)
            .unwrap()
            .is_ok()
    );
}

/// The bin of a folder of this computer, its records in the folder's index
/// (ADR 0080 items 2, 4, 5 and 7): listed with who and when, restored,
/// deleted for good, emptied.
#[test]
fn the_bin_of_a_local_folder_is_listed_restored_and_emptied() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    service
        .with("a", |ws| {
            for name in ["Uma", "Duas", "Tres"] {
                ws.create_note(name, "texto")?;
                let gone = ws.delete_note(name)?;
                trash::deleted(ws, None, &gone, None)?;
            }
            let policy = trash::Policy::local(ws);
            assert_eq!(policy.days, verso_core::trash::DEFAULT_DAYS);
            let list = trash::list(ws, None, policy)?;
            assert_eq!(list.entries.len(), 3);
            assert!(list.entries.iter().all(|e| e.known && e.by.is_none()));
            assert!(list.can_purge && list.can_set && list.quota.is_none());
            let first = list.entries[0].expires.unwrap() - list.entries[0].deleted;
            assert!((first - 30.0 * 86_400.0).abs() < 1.0);
            let (back, _) = trash::restore(ws, None, ".trash/Uma.md", "2026-10-11", "en")?;
            assert_eq!(back.path, "Uma.md");
            assert!(!back.beside);
            assert!(ws.notes()?.contains(&"Uma.md".to_owned()));
            let gone = trash::delete(ws, None, &[".trash/Duas.md".to_owned()])?;
            assert_eq!(gone.len(), 1);
            ws.set_trash_days(0)?;
            let list = trash::list(ws, None, trash::Policy::local(ws))?;
            assert_eq!(list.entries.len(), 1);
            assert_eq!(list.days, 0);
            assert!(list.entries[0].expires.is_none());
            trash::empty(ws, None)?;
            assert!(
                trash::list(ws, None, trash::Policy::local(ws))?
                    .entries
                    .is_empty()
            );
            // Nothing in the bin at a path: not found.
            let missing = trash::restore(ws, None, ".trash/Uma.md", "2026-10-11", "en");
            assert!(missing.is_err());
            Ok(())
        })
        .unwrap();
}

/// A new name beside an entry that differs from it only in case crosses
/// the contract as its own kind (spec Q8, decided 2026-10-12), which the
/// window and sync match — never its English text; any other refusal of
/// a name stays `refused`.
#[test]
fn a_case_twin_crosses_as_its_own_kind() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    let create = |name: &str| {
        service
            .dispatch(
                "a",
                "create_note",
                serde_json::json!({"name": name, "text": "x"}),
            )
            .unwrap()
    };
    create("Nota").unwrap();
    assert_eq!(create("nota").unwrap_err().kind, ErrorKind::CaseTwin);
    assert_eq!(create("../fora").unwrap_err().kind, ErrorKind::Refused);
    let folder = service
        .dispatch("a", "create_folder", serde_json::json!({"path": "Pasta"}))
        .unwrap();
    assert!(folder.is_ok(), "{folder:?}");
    let twin = service
        .dispatch("a", "create_folder", serde_json::json!({"path": "pasta"}))
        .unwrap();
    assert_eq!(twin.unwrap_err().kind, ErrorKind::CaseTwin);
    create("Outra").unwrap();
    let renamed = service
        .dispatch(
            "a",
            "rename_note",
            serde_json::json!({"from": "Outra.md", "to": "NOTA.md"}),
        )
        .unwrap();
    assert_eq!(renamed.unwrap_err().kind, ErrorKind::CaseTwin);
}
