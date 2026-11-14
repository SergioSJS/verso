// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! R1 (ADR 0117 D1, D2; built 2026-11-05): a table in a **subfolder** of a
//! folder this computer serves in part. The ticked folder is the owner's:
//! the owner's window sits at it and makes a table in any folder inside it
//! (the maintainer ticked *Campanha Fractal* inside his vault and got
//! nothing). A player reaches a subfolder only by the share or the table
//! root they were given: a player at the table in A never reaches B or the
//! rest — by id, by share, in the list, as a file, by a link, by a desktop
//! app's device. The owner's phones keep their parts (`tests_parts`).

use serde_json::{Value, json};

use super::tests::{Lab, Ws, call, next, run};
use super::tests_accounts::accept;
use super::tests_devices::{bearer_get, bearer_ws, device_token};
use super::tests_parts::{NEEDLE, lab_in_part, put};
use super::tests_seat::{ask, seated, server_of};
use crate::db::Role;

/// The vault's id, and the share each table root is reached by.
struct Tables {
    vault: String,
    a: String,
    b: String,
}

/// `Campanha` served with `Projetos` and `Diario` chosen (the phones'); the
/// owner's window makes a table in `Projetos` (A, chosen) and one in
/// `Segredo` (B, not chosen), releases all of each, and invites Ana to A
/// and Bia to B. Their cookies.
async fn two_tables(lab: &mut Lab) -> (Tables, String, String) {
    put(lab, "Segredo/d.md", "# D\nsó da mesa B\n");
    lab.serve();
    let seat = lab
        .local
        .sit(&lab.notes.path().join("Campanha"))
        .expect("the owner's window sits at a folder served in part");
    let mut gm = seated(&seat).await;
    let mut id = 10;
    let mut links = Vec::new();
    for root in ["Projetos", "Segredo"] {
        let made = ask(&mut gm, id, "campaign_make", json!({ "root": root })).await;
        assert!(made.get("ok").is_some(), "{root}: {made}");
        let all = ask(
            &mut gm,
            id + 1,
            "campaign_release_all",
            json!({ "root": root }),
        )
        .await;
        assert!(all.get("ok").is_some(), "{root}: {all}");
        seat.acted("campaign_invite").unwrap();
        let invited = ask(&mut gm, id + 2, "campaign_invite", json!({ "root": root })).await;
        links.push(
            invited["ok"]["link"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
        );
        id += 3;
    }
    let ana = accept(lab, &links[0], "ana@example.org", "Ana").await;
    let bia = accept(lab, &links[1], "bia@example.org", "Bia").await;
    let server = server_of(lab);
    let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap().id;
    let share = |p: &str| server.db.share_at(&vault, p).unwrap().unwrap().id;
    let tables = Tables {
        a: share("Projetos"),
        b: share("Segredo"),
        vault,
    };
    (tables, ana, bia)
}

async fn listed(lab: &Lab, cookie: &str) -> Value {
    lab.get("/api/folders", Some(cookie)).await.1
}

/// What a player reaches through a connection opened at `mine`: every
/// other id refused, every note outside refused, the search and the graph
/// free of what is outside.
async fn reaches_only(
    ws: &mut Ws,
    mine: &str,
    others: &[&str],
    inside: &str,
    outside: &[&str],
    foreign: &[&str],
) {
    for (n, id) in others.iter().enumerate() {
        let opened = call(
            ws,
            100 + n as u64,
            "open_server_folder",
            json!({ "id": id }),
        )
        .await;
        assert!(opened.get("ok").is_none(), "{id} opened: {opened}");
    }
    let opened = call(ws, 1, "open_server_folder", json!({ "id": mine })).await;
    assert!(opened.get("ok").is_some(), "{opened}");
    let notes = call(ws, 2, "list_notes", json!({})).await;
    let said = notes.to_string();
    assert!(said.contains(inside), "{notes}");
    for (n, path) in outside.iter().enumerate() {
        assert!(
            !said.contains(path.trim_start_matches("../")),
            "{path} listed: {notes}"
        );
        let read = call(ws, 10 + n as u64, "read_note", json!({ "path": path })).await;
        assert!(read.get("ok").is_none(), "{path} read: {read}");
    }
    // What only the folders outside say: not read, not found, not linked.
    let mut n = 50;
    for word in foreign {
        for (cmd, args) in [
            ("search", json!({ "words": word, "limit": 50 })),
            ("graph", json!({})),
            ("list_tags", json!({})),
        ] {
            let got = call(ws, n, cmd, args).await;
            n += 1;
            assert!(!got.to_string().contains(word), "{cmd} says {word}: {got}");
        }
    }
}

#[test]
fn a_player_at_a_table_in_a_subfolder_reaches_only_that_subfolder() {
    run(async {
        let mut lab = lab_in_part(&["Projetos", "Diario"]);
        let (t, ana, bia) = two_tables(&mut lab).await;

        // The list: Ana has A alone, Bia B alone; neither the vault nor the
        // phones' other part nor the other table, by id or by name.
        let mine = listed(&lab, &ana).await;
        let ids: Vec<&str> = mine["folders"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["id"].as_str())
            .collect();
        assert_eq!(ids, [t.a.as_str()], "{mine}");
        let text = mine.to_string();
        for not in [t.vault.as_str(), t.b.as_str(), "Diario", "Segredo", NEEDLE] {
            assert!(!text.contains(not), "{not} in Ana's list: {mine}");
        }
        let hers = listed(&lab, &bia).await;
        let ids: Vec<&str> = hers["folders"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["id"].as_str())
            .collect();
        assert_eq!(ids, [t.b.as_str()], "{hers}");

        // The window: A's notes and nothing beside them.
        let mut ws = lab.connect(&ana).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        let diario = server_of(&lab)
            .db
            .share_at(&t.vault, "Diario")
            .unwrap()
            .unwrap()
            .id;
        reaches_only(
            &mut ws,
            &t.a,
            &[&t.vault, &t.b, &diario],
            "a.md",
            &[
                "../Raiz.md",
                "../Segredo/c.md",
                "../Diario/b.md",
                "../Segredo/d.md",
            ],
            &[NEEDLE, "segredo", "diario", "Raiz"],
        )
        .await;
        let mut hers = lab.connect(&bia).await.unwrap();
        assert!(next(&mut hers).await.get("hello").is_some());
        reaches_only(
            &mut hers,
            &t.b,
            &[&t.vault, &t.a, &diario],
            "d.md",
            &["../Raiz.md", "../Projetos/a.md", "../Diario/b.md"],
            &["projeto", "diario", "Raiz", "Marcador"],
        )
        .await;

        // The files: by the vault's id, by the other table's share, by a way
        // out of her own.
        for path in [
            format!("/f/{}/Raiz.md", t.vault),
            format!("/f/{}/Projetos/img.png", t.vault),
            format!("/f/{}/c.md", t.b),
            format!("/f/{}/x.png", t.b),
            format!("/f/{diario}/b.md"),
            format!("/f/{}/%2e%2e/Raiz.md", t.a),
            format!("/f/{}/..%2fSegredo%2fx.png", t.a),
        ] {
            let res = lab
                .client
                .get(lab.url(&path))
                .header("cookie", &ana)
                .send()
                .await
                .unwrap();
            let (status, at) = (res.status().as_u16(), res.url().path().to_owned());
            let body = res.text().await.unwrap();
            assert!(
                !body.contains(NEEDLE) && !body.contains("# Raiz"),
                "{path} → {at}: {body}"
            );
            // A way out the client folds (`%2e%2e` is `..` to a URL) lands on
            // the window's page, never on a file.
            assert!(
                status != 200 || body.contains("<html") || body.contains("<!doctype"),
                "{path} → {at}: {status} {body}"
            );
        }
        // Her own table's notes she reads (all released).
        let read = call(&mut ws, 60, "read_note", json!({ "path": "a.md" })).await;
        assert!(read.to_string().contains("linha de projeto"), "{read}");

        // A link to a note of the other table, opened with her cookie: the
        // folder in it is not hers (the window's `/?folder=<id>&note=`).
        let (status, _) = lab.get(&format!("/f/{}/d.md", t.b), Some(&ana)).await;
        assert_ne!(status, 200);
    });
}

/// The same holds for a player's desktop app (a device): the list, the
/// ids and the files are those of the table they were invited to.
#[test]
fn a_players_desktop_app_reaches_only_the_subfolder_of_their_table() {
    run(async {
        let mut lab = lab_in_part(&["Projetos", "Diario"]);
        let (t, ana, _bia) = two_tables(&mut lab).await;
        let token = device_token(&lab, &ana, "Verso · Mac da Ana").await;
        let (status, mine) = bearer_get(&lab, "/api/folders", &token).await;
        assert_eq!(status, 200);
        let ids: Vec<&str> = mine["folders"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["id"].as_str())
            .collect();
        assert_eq!(ids, [t.a.as_str()], "{mine}");
        for path in [
            format!("/f/{}/Raiz.md", t.vault),
            format!("/f/{}/c.md", t.b),
        ] {
            assert_ne!(bearer_get(&lab, &path, &token).await.0, 200, "{path}");
        }
        let mut ws = bearer_ws(&lab, &token).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        for (n, id) in [&t.vault, &t.b].into_iter().enumerate() {
            let opened = call(
                &mut ws,
                n as u64 + 1,
                "open_server_folder",
                json!({ "id": id }),
            )
            .await;
            assert!(opened.get("ok").is_none(), "{id}: {opened}");
        }
    });
}

/// The owner's window sits at all of a folder served in part; the owner's
/// phones still have their parts alone, never the vault nor a table made
/// outside them; a player given nothing reaches nothing.
#[test]
fn the_owner_sits_at_all_of_it_and_the_phones_keep_their_parts() {
    run(async {
        let mut lab = lab_in_part(&["Projetos", "Diario"]);
        let (t, _ana, _bia) = two_tables(&mut lab).await;
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let theirs = listed(&lab, &phone).await;
        let mut names: Vec<&str> = theirs["folders"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["name"].as_str())
            .collect();
        names.sort_unstable();
        assert_eq!(names, ["Diario", "Projetos"], "{theirs}");
        let text = theirs.to_string();
        assert!(!text.contains(&t.vault) && !text.contains(&t.b), "{theirs}");
        let (status, _) = lab
            .get(&format!("/f/{}/Raiz.md", t.vault), Some(&phone))
            .await;
        assert_eq!(status, 404);
        // An account with no table and no share.
        let made = lab.local.invite_for_tests(None, None).unwrap();
        let caio = accept(&lab, &made.link, "caio@example.org", "Caio").await;
        let nothing = listed(&lab, &caio).await;
        assert_eq!(nothing["folders"], json!([]), "{nothing}");
        assert_eq!(
            lab.get(&format!("/f/{}/Raiz.md", t.vault), Some(&caio))
                .await
                .0,
            404
        );
    });
}
