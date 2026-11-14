// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder no longer served **rests** (ADR 0117 D2, decided 2026-11-13:
//! "the table, its chat and rolls are kept"): its registration, its table,
//! its players and their grants stay in the database, and no one reaches
//! it until it is served again, under the same id. Until 2026-11-13 an
//! untick deleted the registration at the next start, and the database's
//! cascade took the table, the chat, the rolls, the shares, the read links
//! and the bin with it.
//!
//! And a served folder's name is **its own for good**: it was given by the
//! order of the folders ticked (`Campanha`, `Campanha (2)`), so unticking
//! the first handed its name — and the registration under it, players and
//! all — to the second (a visibility leak: Ana, invited to one folder,
//! read the other).

use serde_json::json;

use super::tests::{Lab, call, lab, run};
use super::tests_accounts::accept;
use super::tests_seat::{ask, seated, server_of};

/// The owner's window sits at `folder`, makes the whole of it a table,
/// releases every note and invites one player: the invitation's link.
async fn table_with_invite(lab: &Lab, folder: &std::path::Path) -> String {
    let seat = lab.local.sit(folder).expect("the owner's window sits");
    let mut gm = seated(&seat).await;
    let made = ask(&mut gm, 1, "campaign_make", json!({ "root": "" })).await;
    assert!(made.get("ok").is_some(), "{made}");
    let all = ask(&mut gm, 2, "campaign_release_all", json!({ "root": "" })).await;
    assert!(all.get("ok").is_some(), "{all}");
    seat.acted("campaign_invite").unwrap();
    let invited = ask(&mut gm, 3, "campaign_invite", json!({ "root": "" })).await;
    invited["ok"]["link"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

fn serve_only(lab: &mut Lab, folders: &[&std::path::Path]) {
    lab.local.stop();
    let mut s = lab.local.settings().unwrap();
    s.folders = folders
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    lab.local.set_settings(&s).unwrap();
    lab.serve();
}

/// What `cookie`'s window reads of note `note` in folder `id`: the text,
/// or `None` when the folder or the note is refused.
async fn reads(lab: &Lab, cookie: &str, id: &str, note: &str) -> Option<String> {
    let mut ws = lab.connect(cookie).await.ok()?;
    let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    opened.get("ok")?;
    let read = call(&mut ws, 2, "read_note", json!({ "path": note })).await;
    read.get("ok").map(|r| r.to_string())
}

async fn listed(lab: &Lab, cookie: &str) -> Vec<String> {
    let (_, mine) = lab.get("/api/folders", Some(cookie)).await;
    mine["folders"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|f| f["id"].as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

#[test]
fn a_folder_no_longer_served_keeps_its_table_and_players() {
    run(async {
        let mut lab = lab();
        let campanha = lab.notes.path().join("Campanha");
        let outra = lab.notes.path().join("Outra");
        crate::data::ensure_dir(&outra).unwrap();
        crate::data::write_for_tests(&outra.join("o.md"), "# O\n");
        lab.serve();
        let link = table_with_invite(&lab, &campanha).await;
        let ana = accept(&lab, &link, "ana@example.org", "Ana").await;
        let id = server_of(&lab)
            .db
            .folder_by_dir("Campanha")
            .unwrap()
            .unwrap()
            .id;
        assert!(reads(&lab, &ana, &id, "Sessao.md").await.is_some());

        // Unticked: nothing of it reaches Ana, by the list or by its id.
        serve_only(&mut lab, &[&outra]);
        assert!(!listed(&lab, &ana).await.contains(&id));
        assert!(reads(&lab, &ana, &id, "Sessao.md").await.is_none());
        // …but the registration, the table and Ana's place are kept.
        let server = server_of(&lab);
        assert!(
            server.db.folder(&id).unwrap().is_some(),
            "the folder's row was deleted"
        );
        assert!(
            crate::access::has_table(&server, &id),
            "the table went with the untick"
        );

        // Served again: the same id, the same table, Ana back at it.
        serve_only(&mut lab, &[&campanha, &outra]);
        let again = server_of(&lab)
            .db
            .folder_by_dir("Campanha")
            .unwrap()
            .unwrap()
            .id;
        assert_eq!(again, id, "served again under a new id");
        assert!(listed(&lab, &ana).await.contains(&id));
        assert!(reads(&lab, &ana, &id, "Sessao.md").await.is_some());
    });
}

#[test]
fn a_name_is_never_handed_to_another_folder() {
    run(async {
        let mut lab = lab();
        let first = lab.notes.path().join("Campanha");
        let elsewhere = tempfile::tempdir().unwrap();
        let second = elsewhere.path().join("Campanha");
        crate::data::ensure_dir(&second).unwrap();
        crate::data::write_for_tests(&second.join("Outro.md"), "# Outro\nsó da segunda\n");
        serve_only(&mut lab, &[&first, &second]);
        assert_eq!(
            lab.local.served_name_for_tests(&second).as_deref(),
            Some("Campanha (2)")
        );
        // Ana is a player at the first folder's table only.
        let link = table_with_invite(&lab, &first).await;
        let ana = accept(&lab, &link, "ana@example.org", "Ana").await;

        // The first unticked: the second keeps its own name and its own
        // registration; Ana reaches nothing of it.
        serve_only(&mut lab, &[&second]);
        assert_eq!(
            lab.local.served_name_for_tests(&second).as_deref(),
            Some("Campanha (2)"),
            "the second folder took the first one's name"
        );
        for id in listed(&lab, &ana).await {
            assert!(
                reads(&lab, &ana, &id, "Outro.md").await.is_none(),
                "Ana read the second folder through the first one's table"
            );
        }
        let server = server_of(&lab);
        let first_row = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        assert!(reads(&lab, &ana, &first_row.id, "Outro.md").await.is_none());

        // The first ticked again: its name and its table come back.
        serve_only(&mut lab, &[&first, &second]);
        assert_eq!(
            lab.local.served_name_for_tests(&first).as_deref(),
            Some("Campanha")
        );
        assert!(
            reads(&lab, &ana, &first_row.id, "Sessao.md")
                .await
                .is_some()
        );
    });
}

/// While serving (ADR 0117 R4): a folder unticked rests at once — its
/// player's open window is told the folder is gone, the server keeps
/// serving on the same port — and ticked again it is served at once.
#[test]
fn what_is_served_changes_while_serving() {
    run(async {
        let mut lab = lab();
        let campanha = lab.notes.path().join("Campanha");
        let outra = lab.notes.path().join("Outra");
        crate::data::ensure_dir(&outra).unwrap();
        serve_only(&mut lab, &[&campanha, &outra]);
        let port = lab.port;
        let link = table_with_invite(&lab, &campanha).await;
        let ana = accept(&lab, &link, "ana@example.org", "Ana").await;
        let id = server_of(&lab)
            .db
            .folder_by_dir("Campanha")
            .unwrap()
            .unwrap()
            .id;
        let mut ws = lab.connect(&ana).await.unwrap();
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert!(opened.get("ok").is_some(), "{opened}");

        let before = lab.local.settings().unwrap();
        let mut without = before.clone();
        without.folders.retain(|f| !f.ends_with("Campanha"));
        lab.local.change_served(&before, &without).unwrap();
        let status = lab.local.status().unwrap();
        assert!(status.serving, "serving stopped");
        assert_eq!(status.port, Some(port));
        let mut told = false;
        for _ in 0..20 {
            let m = super::tests::next(&mut ws).await;
            if m["gone"] == "folder" {
                told = true;
                break;
            }
        }
        assert!(told, "the open window was not told");
        assert!(reads(&lab, &ana, &id, "Sessao.md").await.is_none());
        assert!(server_of(&lab).db.folder(&id).unwrap().is_some());

        lab.local.change_served(&without, &before).unwrap();
        assert!(reads(&lab, &ana, &id, "Sessao.md").await.is_some());
    });
}
