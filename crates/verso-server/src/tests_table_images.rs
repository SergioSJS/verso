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
    Running, Socket, block_on, call, connect, event_named, folder_id, next, sign_in, start,
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
        "campaign_permission",
        json!({ "root": root, "accounts": [account], "images": on }),
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
        assert_eq!(join(&mut c.bia, 3).await["images"], true);
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
                .campaign_images_has(&c.folder, "", &c.ana_id)
                .unwrap()
        );
        // Only a player of the table can be given it.
        let no = grant(&mut c.owner, 5, "", &c.bia_id, true).await;
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
        assert_eq!(told, json!({ "table": "", "images": true }));
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
        assert!(err_of(&no).contains("PNG, JPEG, WebP or GIF"), "{no}");
        // Taken back: told at once, refused again.
        let taken = grant(&mut c.owner, 8, "", &c.ana_id, false).await;
        assert_eq!(
            taken["ok"]["tables"][0]["image_players"],
            json!([]),
            "{taken}"
        );
        let told = event_named(&mut ana, "table-images").await;
        assert_eq!(told, json!({ "table": "", "images": false }));
        let no = call(&mut ana, 9, "table_send_image", json!({ "base64": png() })).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        assert_eq!(r.server.db.table_count(&c.folder, "").unwrap(), 1);
        // An audit row for each change.
        let rows = r.server.db.audit_log(Some(&c.folder), 50).unwrap();
        let n = rows
            .iter()
            .filter(|a| a.action == "campaign_permission")
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
        assert_eq!(told, json!({ "table": "", "images": true }));
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
            json!({ "table": "", "images": false })
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
                .campaign_images_has(&c.folder, "Cripta", &c.ana_id)
                .unwrap()
        );
    });
}
