// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The permission to send images to the table's chat (ADR 0107 item 3 as
//! amended 2026-10-24): off for a player by default, given or taken by the
//! game master per player, the server writing the file on the player's
//! behalf, a member and a player on a share alike, told to the player's
//! window at once.

use base64::Engine;
use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{
    Running, Socket, block_on, call, connect, event_named, folder_id, get, next, sign_in, start,
};

fn png() -> String {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend_from_slice(&[0, 0, 0, 13, b'I', b'H', b'D', b'R', 0, 0, 0, 1, 0, 0, 0, 1]);
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

async fn open(r: &Running, email: &str, password: &str, folder: &str) -> Socket {
    let b = sign_in(r, email, password).await;
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": folder })).await;
    assert!(opened.get("ok").is_some(), "{opened}");
    ws
}

fn err_of(answer: &Value) -> String {
    answer["err"]["message"].as_str().unwrap_or("").to_owned()
}

/// A table at `root`, the owner, an editor (Bia) and a player (Ana) with
/// the account ids.
struct Seat {
    folder: String,
    owner: Socket,
    bia: Socket,
    bia_id: String,
    ana_id: String,
}

async fn seat(r: &Running, root: &str) -> Seat {
    let admin = sign_in(r, "admin@casa.lan", "senha muito longa").await;
    let folder = folder_id(r, &admin).await;
    let mut ids = Vec::new();
    for (email, name, password, role) in [
        ("bia@casa.lan", "Bia", "a senha da bia", Role::Editor),
        ("ana@casa.lan", "Ana", "a senha da ana", Role::Reader),
    ] {
        let a = r
            .server
            .db
            .create_account(email, name, "pt", Some(password), false)
            .unwrap();
        if root.is_empty() || role == Role::Editor {
            r.server.db.grant(&folder, &a.id, role).unwrap();
        }
        ids.push(a.id);
    }
    r.server.db.campaign_make(&folder, root).unwrap();
    crate::campaign::forget(&r.server, &folder);
    Seat {
        owner: open(r, "admin@casa.lan", "senha muito longa", &folder).await,
        bia: open(r, "bia@casa.lan", "a senha da bia", &folder).await,
        bia_id: ids[0].clone(),
        ana_id: ids[1].clone(),
        folder,
    }
}

async fn join(ws: &mut Socket, id: u64) -> Value {
    let joined = call(
        ws,
        id,
        "table_join",
        json!({ "color": "#3b82f6", "styles": null }),
    )
    .await;
    assert!(joined.get("ok").is_some(), "{joined}");
    joined["ok"].clone()
}

async fn grant(owner: &mut Socket, id: u64, root: &str, account: &str, on: bool) -> Value {
    call(
        owner,
        id,
        "table_rights_set",
        json!({ "root": root, "accounts": [account], "right": "images", "on": on }),
    )
    .await
}

/// A player at a table of the folder itself: refused by default, given by
/// the game master and told at once, the file written by the server into
/// the attachments place and seen by the others, taken back and refused
/// again; no one but the game master gives it.
#[test]
fn a_member_player_sends_images_only_when_the_game_master_lets_it() {
    block_on(async {
        let r = start().await;
        let mut c = seat(&r, "").await;
        let mut ana = open(&r, "ana@casa.lan", "a senha da ana", &c.folder).await;
        let joined = join(&mut ana, 2).await;
        assert_eq!(joined["images"], false, "{joined}");
        join(&mut c.owner, 2).await;
        join(&mut c.bia, 2).await;
        // An editor of the folder is a player at its table (ADR 0113 item 3):
        // like any player, no files until the game master lets it (K.4).
        assert_eq!(join(&mut c.bia, 3).await["images"], false);
        // The default is off.
        let no = call(&mut ana, 3, "table_send_image", json!({ "base64": png() })).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        assert!(err_of(&no).contains("only read"), "{no}");
        // Not the player's to give, nor an editor's.
        for ws in [&mut ana, &mut c.bia] {
            let no = grant(ws, 4, "", &c.ana_id, true).await;
            assert_eq!(no["err"]["kind"], "refused", "{no}");
        }
        assert!(
            !r.server
                .db
                .campaign_right_has(&c.folder, "", &c.ana_id, crate::access::Right::Images)
                .unwrap()
        );
        // Only a player of the table can be given it.
        let no = grant(&mut c.owner, 5, "", "nobody", true).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        let no = grant(&mut c.owner, 5, "Outra", &c.ana_id, true).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        // Given: told at once, and the status says it to both sides.
        let given = grant(&mut c.owner, 6, "", &c.ana_id, true).await;
        assert_eq!(
            given["ok"]["tables"][0]["image_players"],
            json!([c.ana_id]),
            "{given}"
        );
        let told = event_named(&mut ana, "table-images").await;
        assert_eq!(told, json!({ "table": "", "images": true, "files": false }));
        let mine = call(&mut ana, 6, "campaign_status", json!({})).await;
        assert_eq!(mine["ok"]["tables"][0]["images"], true, "{mine}");
        let sent = call(&mut ana, 7, "table_send_image", json!({ "base64": png() })).await;
        assert_eq!(sent["ok"]["kind"], "image", "{sent}");
        let path = sent["ok"]["image"].as_str().unwrap().to_owned();
        assert!(
            path.starts_with("attachments/mesa-") && path.ends_with(".png"),
            "{path}"
        );
        let listed = call(&mut c.owner, 7, "list_files", json!({})).await;
        assert!(listed.to_string().contains(&path), "{listed}");
        let mut heard = event_named(&mut c.bia, "table-entry").await;
        while heard["kind"] != "image" {
            heard = event_named(&mut c.bia, "table-entry").await;
        }
        assert_eq!(heard["image"], path);
        assert_eq!(heard["by"], "Ana");
        // The same bytes pass the same checks: never an SVG, by the bytes.
        let svg = base64::engine::general_purpose::STANDARD.encode(b"<svg xmlns='x'/>");
        let no = call(&mut ana, 8, "table_send_image", json!({ "base64": svg })).await;
        assert!(
            err_of(&no).contains("an image, a PDF or an audio file"),
            "{no}"
        );
        // Taken back: told at once, refused again.
        let taken = grant(&mut c.owner, 8, "", &c.ana_id, false).await;
        assert_eq!(
            taken["ok"]["tables"][0]["image_players"],
            json!([]),
            "{taken}"
        );
        let told = event_named(&mut ana, "table-images").await;
        assert_eq!(
            told,
            json!({ "table": "", "images": false, "files": false })
        );
        let no = call(&mut ana, 9, "table_send_image", json!({ "base64": png() })).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
        // An audit row for each change.
        let rows = r.server.db.audit_log(Some(&c.folder), 50).unwrap();
        let n = rows
            .iter()
            .filter(|a| a.action == "table_rights_set")
            .count();
        assert_eq!(n, 2, "{rows:?}");
    });
}

/// A player on a share at a table of a subfolder behaves as a member: the
/// file is kept inside the table's folder, the event names the table as the
/// share's own root.
#[test]
fn a_player_on_a_share_sends_images_as_a_member_does() {
    block_on(async {
        let r = start().await;
        let mut c = seat(&r, "Cripta").await;
        let share = r.server.db.make_share(&c.folder, "Cripta").unwrap();
        r.server
            .db
            .grant_share(&share.id, &c.ana_id, Role::Reader)
            .unwrap();
        let mut ana = open(&r, "ana@casa.lan", "a senha da ana", &share.id).await;
        join(&mut c.owner, 2).await;
        let mine = call(
            &mut ana,
            2,
            "table_join",
            json!({ "color": null, "styles": null }),
        )
        .await;
        assert_eq!(mine["ok"]["images"], false, "{mine}");
        let no = call(&mut ana, 3, "table_send_image", json!({ "base64": png() })).await;
        assert!(err_of(&no).contains("only read"), "{no}");
        let given = grant(&mut c.owner, 3, "Cripta", &c.ana_id, true).await;
        assert!(given.get("ok").is_some(), "{given}");
        let told = event_named(&mut ana, "table-images").await;
        assert_eq!(told, json!({ "table": "", "images": true, "files": false }));
        let sent = call(&mut ana, 4, "table_send_image", json!({ "base64": png() })).await;
        assert_eq!(sent["ok"]["kind"], "image", "{sent}");
        let path = sent["ok"]["image"].as_str().unwrap().to_owned();
        assert!(path.starts_with("attachments/mesa-"), "{path}");
        let mut told = event_named(&mut c.owner, "table-entry").await;
        while told["kind"] != "image" {
            told = event_named(&mut c.owner, "table-entry").await;
        }
        assert_eq!(told["image"], format!("Cripta/{path}"), "{told}");
        let listed = call(&mut c.owner, 5, "list_files", json!({})).await;
        assert!(
            listed.to_string().contains(&format!("Cripta/{path}")),
            "{listed}"
        );
        let taken = grant(&mut c.owner, 6, "Cripta", &c.ana_id, false).await;
        assert!(taken.get("ok").is_some(), "{taken}");
        assert_eq!(
            event_named(&mut ana, "table-images").await,
            json!({ "table": "", "images": false, "files": false })
        );
        let no = call(&mut ana, 5, "table_send_image", json!({ "base64": png() })).await;
        assert!(err_of(&no).contains("only read"), "{no}");
        // Leaving the folder takes the permission along.
        grant(&mut c.owner, 7, "Cripta", &c.ana_id, true).await;
        r.server.db.revoke_share(&share.id, &c.ana_id).unwrap();
        r.server
            .db
            .campaign_account_left(&c.folder, &c.ana_id)
            .unwrap();
        assert!(
            !r.server
                .db
                .campaign_right_has(&c.folder, "Cripta", &c.ana_id, crate::access::Right::Images)
                .unwrap()
        );
    });
}

/// A PNG of about `kib` KiB: past the size under which a message is never
/// judged before it is parsed.
fn big_png(kib: usize) -> String {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend_from_slice(&[0, 0, 0, 13, b'I', b'H', b'D', b'R', 0, 0, 0, 1, 0, 0, 0, 1]);
    bytes.resize(kib * 1024, 0);
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

async fn join_at(ws: &mut Socket, id: u64, table: &str) -> Value {
    let joined = call(
        ws,
        id,
        "table_join",
        json!({ "color": "#3b82f6", "styles": null, "table": table }),
    )
    .await;
    assert!(joined.get("ok").is_some(), "{joined}");
    joined["ok"].clone()
}

fn client_of(r: &Running, account: &str) -> String {
    verso_service::lock(&r.server.clients)
        .iter()
        .find(|(_, c)| c.account == account)
        .map(|(id, _)| id.clone())
        .expect("a window of the account")
}

/// A table that is a subfolder keeps every image inside its own folder, whoever
/// sends it — the game master, a member player, a player on a share — so that
/// the share's players see the thumbnail, and nobody outside the table, or at
/// a closed table, fetches it.
#[test]
fn an_image_at_a_subfolder_table_is_kept_inside_the_table_for_every_sender() {
    block_on(async {
        let r = start().await;
        let mut c = seat(&r, "Cripta").await;
        let caio = r
            .server
            .db
            .create_account(
                "caio@casa.lan",
                "Caio",
                "pt",
                Some("a senha do caio"),
                false,
            )
            .unwrap();
        r.server
            .db
            .grant(&c.folder, &caio.id, Role::Reader)
            .unwrap();
        let share = r.server.db.make_share(&c.folder, "Cripta").unwrap();
        r.server
            .db
            .grant_share(&share.id, &c.ana_id, Role::Reader)
            .unwrap();
        let mut ana = open(&r, "ana@casa.lan", "a senha da ana", &share.id).await;
        let mut caio_ws = open(&r, "caio@casa.lan", "a senha do caio", &c.folder).await;
        for who in [&c.ana_id, &caio.id] {
            let g = grant(&mut c.owner, 3, "Cripta", who, true).await;
            assert!(g.get("ok").is_some(), "{g}");
        }
        join_at(&mut c.owner, 4, "Cripta").await;
        join_at(&mut caio_ws, 4, "Cripta").await;
        join(&mut ana, 4).await;
        // The game master and a member player send; the share's player hears both.
        let by_gm = call(
            &mut c.owner,
            5,
            "table_send_image",
            json!({ "base64": png(), "table": "Cripta" }),
        )
        .await;
        let by_caio = call(
            &mut caio_ws,
            5,
            "table_send_image",
            json!({ "base64": png(), "table": "Cripta" }),
        )
        .await;
        let mut heard = Vec::new();
        while heard.len() < 2 {
            let e = event_named(&mut ana, "table-entry").await;
            if e["kind"] == "image" {
                heard.push(e);
            }
        }
        for (sent, told) in [(&by_gm, &heard[0]), (&by_caio, &heard[1])] {
            let full = sent["ok"]["image"].as_str().unwrap();
            assert!(full.starts_with("Cripta/attachments/mesa-"), "{sent}");
            // The share's player is told it from its own root, never dropped.
            let own = told["image"].as_str().expect("an image the share can show");
            assert_eq!(format!("Cripta/{own}"), full, "{told}");
        }
        let share_player = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let own = heard[0]["image"].as_str().unwrap();
        let (status, _) = get(&r, &format!("/f/{}/{own}", share.id), Some(&share_player)).await;
        assert_eq!(status, 200, "{own}");
        let member = sign_in(&r, "caio@casa.lan", "a senha do caio").await;
        let full = by_gm["ok"]["image"].as_str().unwrap();
        let (status, _) = get(&r, &format!("/f/{}/{full}", c.folder), Some(&member)).await;
        assert_eq!(status, 200, "{full}");
        // Nothing at the folder's root outside the table.
        let listed = call(&mut c.owner, 6, "list_files", json!({}))
            .await
            .to_string();
        assert!(!listed.contains("\"attachments/mesa-"), "{listed}");
        // The table closed keeps the member out of the file as it keeps it out of the notes.
        let closed = call(
            &mut c.owner,
            7,
            "campaign_settings",
            json!({ "root": "Cripta", "open": false }),
        )
        .await;
        assert!(closed.get("ok").is_some(), "{closed}");
        let (status, _) = get(&r, &format!("/f/{}/{full}", c.folder), Some(&member)).await;
        assert_ne!(status, 200, "a closed table's image is not served");
    });
}

/// The size check before a message is parsed asks about the account at any
/// table of the folder; the command then judges the table named.
#[test]
fn a_large_image_is_admitted_before_the_parse_only_for_a_player_let_in() {
    block_on(async {
        let r = start().await;
        let mut c = seat(&r, "").await;
        r.server.db.campaign_make(&c.folder, "Sala").unwrap();
        crate::campaign::forget(&r.server, &c.folder);
        let caio = r
            .server
            .db
            .create_account(
                "caio@casa.lan",
                "Caio",
                "pt",
                Some("a senha do caio"),
                false,
            )
            .unwrap();
        r.server
            .db
            .grant(&c.folder, &caio.id, Role::Reader)
            .unwrap();
        let mut ana = open(&r, "ana@casa.lan", "a senha da ana", &c.folder).await;
        let mut caio_ws = open(&r, "caio@casa.lan", "a senha do caio", &c.folder).await;
        let (ana_c, caio_c) = (client_of(&r, &c.ana_id), client_of(&r, &caio.id));
        let len = big_png(64).len();
        assert!(len > crate::table::SAY_MESSAGE);
        let admit = |client: &str| {
            crate::inflight::admit(&r.server, client, Some(1), "table_send_image", len)
        };
        // Nobody was let: both refused before the parse.
        assert!(admit(&ana_c).is_err() && admit(&caio_c).is_err());
        // Ana is let at the table "" only.
        let g = grant(&mut c.owner, 3, "", &c.ana_id, true).await;
        assert!(g.get("ok").is_some(), "{g}");
        assert!(
            admit(&ana_c).is_ok(),
            "a permitted reader is admitted: {:?}",
            admit(&ana_c).err().map(|e| e.error.message)
        );
        assert!(admit(&caio_c).is_err(), "the other still is not");
        for (ws, id) in [(&mut ana, 4), (&mut caio_ws, 4)] {
            for table in ["", "Sala"] {
                join_at(ws, id, table).await;
            }
        }
        // Parsed, a body at the table she is let at passes, and at the other it does not.
        let ok = call(
            &mut ana,
            5,
            "table_send_image",
            json!({ "base64": big_png(64), "table": "" }),
        )
        .await;
        assert_eq!(ok["ok"]["kind"], "image", "{ok}");
        let no = call(
            &mut ana,
            6,
            "table_send_image",
            json!({ "base64": big_png(64), "table": "Sala" }),
        )
        .await;
        assert!(err_of(&no).contains("only read"), "{no}");
        // The one who was not let is refused at once, over the wire.
        let no = call(
            &mut caio_ws,
            5,
            "table_send_image",
            json!({ "base64": big_png(64), "table": "" }),
        )
        .await;
        assert!(err_of(&no).contains("only read"), "{no}");
        // Taken back, it is refused before the parse again.
        let g = grant(&mut c.owner, 7, "", &c.ana_id, false).await;
        assert!(g.get("ok").is_some(), "{g}");
        assert!(admit(&ana_c).is_err());
    });
}

/// A permission is a player's at one table: it goes when the account stops
/// being a player of THAT table though it still reads the folder by another
/// way, so that being seated again never grants it silently.
#[test]
fn the_permission_goes_with_the_seat_at_that_table_and_not_another_tables() {
    block_on(async {
        let r = start().await;
        let mut c = seat(&r, "Cripta").await;
        r.server.db.campaign_make(&c.folder, "Sala").unwrap();
        crate::campaign::forget(&r.server, &c.folder);
        let cripta = r.server.db.make_share(&c.folder, "Cripta").unwrap();
        let sala = r.server.db.make_share(&c.folder, "Sala").unwrap();
        for s in [&cripta, &sala] {
            r.server
                .db
                .grant_share(&s.id, &c.ana_id, Role::Reader)
                .unwrap();
        }
        let g = grant(&mut c.owner, 3, "Cripta", &c.ana_id, true).await;
        assert!(g.get("ok").is_some(), "{g}");
        assert!(
            r.server
                .db
                .campaign_right_has(&c.folder, "Cripta", &c.ana_id, crate::access::Right::Images)
                .unwrap()
        );
        // Someone else stays on the share, so that it outlives her seat.
        r.server
            .db
            .grant_share(&cripta.id, &c.bia_id, Role::Reader)
            .unwrap();
        // Out of Cripta's share, still in Sala's: the permission at Cripta is gone.
        r.server.db.revoke_share(&cripta.id, &c.ana_id).unwrap();
        assert!(
            !r.server
                .db
                .campaign_right_has(&c.folder, "Cripta", &c.ana_id, crate::access::Right::Images)
                .unwrap()
        );
        assert!(!r.server.db.image_granted(&c.folder, &c.ana_id));
        // Seated again: off, as at the first seat.
        r.server
            .db
            .grant_share(&cripta.id, &c.ana_id, Role::Reader)
            .unwrap();
        assert!(
            !r.server
                .db
                .campaign_right_has(&c.folder, "Cripta", &c.ana_id, crate::access::Right::Images)
                .unwrap()
        );
    });
}

/// The set the size check before a parse reads follows every writer of the
/// permission — an unmade table, a deleted folder inside it, a revoked
/// account, a deleted account, a deleted folder — so that nobody who lost the
/// right is admitted until a restart.
#[test]
fn the_admission_set_follows_every_way_a_permission_goes() {
    block_on(async {
        let r = start().await;
        let c = seat(&r, "").await;
        for root in ["A", "B"] {
            r.server.db.campaign_make(&c.folder, root).unwrap();
        }
        crate::campaign::forget(&r.server, &c.folder);
        let mut people = Vec::new();
        for (email, name) in [
            ("ana2@casa.lan", "Ana2"),
            ("caio@casa.lan", "Caio"),
            ("dora@casa.lan", "Dora"),
            ("eva@casa.lan", "Eva"),
        ] {
            let a = r
                .server
                .db
                .create_account(email, name, "pt", Some("uma senha longa"), false)
                .unwrap();
            r.server.db.grant(&c.folder, &a.id, Role::Reader).unwrap();
            people.push((email, a.id));
        }
        let roots = ["A", "B", "", ""];
        let mut windows = Vec::new();
        for ((email, id), root) in people.iter().zip(roots) {
            r.server
                .db
                .campaign_right_set(
                    &c.folder,
                    root,
                    std::slice::from_ref(id),
                    crate::access::Right::Images,
                    true,
                )
                .unwrap();
            windows.push(open(&r, email, "uma senha longa", &c.folder).await);
        }
        let len = big_png(64).len();
        let admit = |id: &str| {
            crate::inflight::admit(
                &r.server,
                &client_of(&r, id),
                Some(1),
                "table_send_image",
                len,
            )
        };
        for (_, id) in &people {
            assert!(r.server.db.image_granted(&c.folder, id));
            assert!(admit(id).is_ok());
        }
        // An unmade table, and a folder deleted that held one.
        r.server.db.campaign_drop(&c.folder, "A").unwrap();
        assert!(!r.server.db.image_granted(&c.folder, &people[0].1));
        assert!(admit(&people[0].1).is_err());
        r.server.db.campaign_deleted(&c.folder, "B").unwrap();
        assert!(!r.server.db.image_granted(&c.folder, &people[1].1));
        assert!(admit(&people[1].1).is_err());
        // An account that stops reading the folder.
        r.server.db.revoke(&c.folder, &people[2].1).unwrap();
        assert!(!r.server.db.image_granted(&c.folder, &people[2].1));
        // An account deleted.
        r.server.db.delete_account(&people[3].1).unwrap();
        assert!(!r.server.db.image_granted(&c.folder, &people[3].1));
        // The folder deleted: nothing is left.
        r.server
            .db
            .campaign_right_set(
                &c.folder,
                "",
                std::slice::from_ref(&c.ana_id),
                crate::access::Right::Images,
                true,
            )
            .unwrap();
        assert!(r.server.db.image_granted(&c.folder, &c.ana_id));
        r.server.db.forget_folder(&c.folder).unwrap();
        assert!(!r.server.db.image_granted(&c.folder, &c.ana_id));
        drop(windows);
    });
}
