// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folders' bins on the server (ADR 0080), against a running server:
//! who sees and does what (item 7), a deletion named and restored beside
//! a taken name (items 2 and 5), the version a device's write replaced
//! (item 12), the console's page (item 4), and the sweep with the quota's
//! guard (items 3 and 8).

use base64::Engine;
use serde_json::json;

use crate::db::Role;
use crate::sync::sha256;
use crate::tests::{
    Socket, block_on, call, connect, folder_id, get, next, post, put, sign_in, start,
};

async fn opened(r: &crate::tests::Running, b: &crate::tests::Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

/// What the folder's `.trash/` holds, through verso-fs (this crate's
/// tests touch no file themselves): path and length.
fn bin(r: &crate::tests::Running) -> Vec<(String, u64)> {
    verso_fs::trashbin::walk(&r.server.config.folders_dir.join("Campanha"))
        .unwrap()
        .into_iter()
        .map(|b| (b.path, b.len))
        .collect()
}

fn in_bin(r: &crate::tests::Running, path: &str) -> bool {
    bin(r).iter().any(|(p, _)| p == path)
}

fn actions(r: &crate::tests::Running, folder: &str) -> Vec<String> {
    r.server
        .db
        .audit_log(Some(folder), 100)
        .unwrap()
        .into_iter()
        .map(|a| a.action)
        .collect()
}

#[test]
fn a_deletion_is_named_listed_and_restored_beside_a_taken_name() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = opened(&r, &b, &id).await;
        let gone = call(&mut ws, 2, "delete_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(gone["ok"]["path"], ".trash/Sessao.md", "{gone}");
        let list = call(&mut ws, 3, "trash_list", json!({})).await;
        let e = &list["ok"]["entries"][0];
        assert_eq!(e["original"], "Sessao.md", "{list}");
        assert_eq!(e["by"], "Admin");
        assert_eq!(e["known"], true);
        assert_eq!(e["replaced"], false);
        assert_eq!(list["ok"]["days"], 30);
        assert_eq!(list["ok"]["can_purge"], true);
        // Another note at the name meanwhile: the restore goes beside it.
        call(
            &mut ws,
            4,
            "create_note",
            json!({ "name": "Sessao", "text": "nova" }),
        )
        .await;
        let back = call(
            &mut ws,
            5,
            "trash_restore",
            json!({ "path": ".trash/Sessao.md", "today": "2026-10-11", "lang": "pt" }),
        )
        .await;
        assert_eq!(
            back["ok"]["path"], "Sessao (restaurado 2026-10-11).md",
            "{back}"
        );
        assert_eq!(back["ok"]["beside"], true);
        for (n, path, text) in [
            (61, "Sessao (restaurado 2026-10-11).md", "# Sessao\n"),
            (62, "Sessao.md", "nova"),
        ] {
            let note = call(&mut ws, n, "read_note", json!({ "path": path })).await;
            assert_eq!(note["ok"]["text"], text, "{note}");
        }
        let list = call(&mut ws, 6, "trash_list", json!({})).await;
        assert_eq!(list["ok"]["entries"], json!([]), "{list}");
        assert!(actions(&r, &id).contains(&"trash_restored".to_owned()));
        // To sync, a file that came back, written by the restorer (item 6).
        let changes = r.server.db.latest_changes(&id, 5).unwrap();
        assert!(
            changes
                .iter()
                .any(|c| c.path == "Sessao (restaurado 2026-10-11).md" && !c.deleted),
            "{changes:?}"
        );
    });
}

#[test]
fn an_editor_restores_only_the_owner_deletes_for_good_a_reader_sees_none() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        for (email, role) in [("ed@casa.lan", Role::Editor), ("le@casa.lan", Role::Reader)] {
            let a = r
                .server
                .db
                .create_account(email, email, "en", Some("senha muito longa"), false)
                .unwrap();
            r.server.db.grant(&id, &a.id, role).unwrap();
        }
        let ed = sign_in(&r, "ed@casa.lan", "senha muito longa").await;
        let mut ws = opened(&r, &ed, &id).await;
        call(&mut ws, 2, "delete_note", json!({ "path": "Sessao.md" })).await;
        let list = call(&mut ws, 3, "trash_list", json!({})).await;
        assert_eq!(list["ok"]["can_purge"], false, "{list}");
        assert_eq!(list["ok"]["can_set"], false);
        for (n, cmd, args) in [
            (4, "trash_delete", json!({ "paths": [".trash/Sessao.md"] })),
            (5, "trash_empty", json!({})),
            (6, "trash_set_days", json!({ "days": 7 })),
        ] {
            let no = call(&mut ws, n, cmd, args).await;
            assert_eq!(no["err"]["kind"], "refused", "{cmd}: {no}");
        }
        assert!(in_bin(&r, ".trash/Sessao.md"));
        let le = sign_in(&r, "le@casa.lan", "senha muito longa").await;
        let mut ws2 = opened(&r, &le, &id).await;
        let no = call(&mut ws2, 2, "trash_list", json!({})).await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        // The editor restores (any writer does, item 7).
        let back = call(
            &mut ws,
            7,
            "trash_restore",
            json!({ "path": ".trash/Sessao.md", "today": "2026-10-11", "lang": "en" }),
        )
        .await;
        assert_eq!(back["ok"]["path"], "Sessao.md", "{back}");
        // The owner shortens the retention, never past the admin's days.
        let mut own = opened(&r, &admin, &id).await;
        let short = call(&mut own, 2, "trash_set_days", json!({ "days": 7 })).await;
        assert_eq!(short["ok"]["days"], 7, "{short}");
        assert_eq!(short["ok"]["most"], 30);
        let long = call(&mut own, 3, "trash_set_days", json!({ "days": 60 })).await;
        assert_eq!(long["err"]["kind"], "refused", "{long}");
        let never = call(&mut own, 4, "trash_set_days", json!({ "days": 0 })).await;
        assert_eq!(never["err"]["kind"], "refused", "{never}");
    });
}

#[test]
fn a_devices_write_keeps_the_version_it_replaced() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = opened(&r, &b, &id).await;
        let old = sha256(b"# Sessao\n");
        let put_bytes = |bytes: &'static [u8], base: String| {
            json!({
                "path": "Sessao.md", "offset": 0, "size": bytes.len(), "hash": sha256(bytes),
                "base": base, "data": base64::engine::general_purpose::STANDARD.encode(bytes),
            })
        };
        let done = call(
            &mut ws,
            2,
            "sync_put",
            put_bytes(b"velha, de outro programa", old),
        )
        .await;
        assert_eq!(done["ok"]["done"], true, "{done}");
        let list = call(&mut ws, 3, "trash_list", json!({})).await;
        let e = &list["ok"]["entries"][0];
        assert_eq!(e["replaced"], true, "{list}");
        assert_eq!(e["by"], "Admin");
        assert_eq!(e["original"], "Sessao.md");
        let kept = e["path"].as_str().unwrap().to_owned();
        // The bytes it replaced: "# Sessao\n".
        assert!(
            bin(&r).iter().any(|(p, len)| *p == kept && *len == 9),
            "{:?}",
            bin(&r)
        );
        // The same bytes again: nothing replaced, nothing kept.
        let same = sha256(b"velha, de outro programa");
        call(
            &mut ws,
            4,
            "sync_put",
            put_bytes(b"velha, de outro programa", same),
        )
        .await;
        let list = call(&mut ws, 5, "trash_list", json!({})).await;
        assert_eq!(list["ok"]["entries"].as_array().unwrap().len(), 1, "{list}");
    });
}

#[test]
fn the_console_shows_sets_and_empties_a_folders_trash() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = opened(&r, &b, &id).await;
        call(&mut ws, 2, "delete_entry", json!({ "path": "mapa.svg" })).await;
        let (_, page) = get(&r, &format!("/api/admin/folders/{id}"), Some(&b)).await;
        assert_eq!(page["trash"]["count"], 1, "{page}");
        assert_eq!(page["trash"]["days"], 30);
        let (status, set) = put(
            &r,
            &format!("/api/admin/folders/{id}/trash"),
            json!({ "days": 0 }),
            &b,
        )
        .await;
        assert_eq!(status, 200, "{set}");
        assert_eq!(set["days"], 0);
        let (_, overview) = get(&r, "/api/admin/overview", Some(&b)).await;
        assert_eq!(overview["trash"]["count"], 1, "{overview}");
        let (status, emptied) = post(
            &r,
            &format!("/api/admin/folders/{id}/trash/empty"),
            json!({}),
            Some(&b),
        )
        .await;
        assert_eq!(status, 200, "{emptied}");
        assert_eq!(emptied["count"], 0);
        assert!(!in_bin(&r, ".trash/mapa.svg"));
        let acts = actions(&r, &id);
        assert!(acts.contains(&"trash_days".to_owned()), "{acts:?}");
        assert!(acts.contains(&"trash_emptied".to_owned()), "{acts:?}");
    });
}

#[test]
fn the_sweep_expires_old_entries_and_keeps_the_bin_under_the_quota() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = opened(&r, &b, &id).await;
        let mut n = 2;
        for (name, len) in [("antiga", 10), ("media", 60), ("nova", 60)] {
            call(
                &mut ws,
                n,
                "create_note",
                json!({ "name": name, "text": "x".repeat(len) }),
            )
            .await;
            call(
                &mut ws,
                n + 1,
                "delete_note",
                json!({ "path": format!("{name}.md") }),
            )
            .await;
            n += 2;
        }
        let day = verso_core::trash::DAY;
        let now = verso_core::trash::now();
        for (name, age) in [("antiga.md", 40), ("media.md", 5), ("nova.md", 1)] {
            r.server
                .db
                .put_trash_record(
                    &id,
                    &verso_core::trash::record(
                        &format!(".trash/{name}"),
                        name,
                        now - age * day,
                        Some("Admin"),
                        false,
                    ),
                )
                .unwrap();
        }
        r.server.db.set_quota(&id, Some(100)).unwrap();
        let s = std::sync::Arc::clone(&r.server);
        let f = id.clone();
        // A sweep after the deletions may have run already (a few seconds
        // after them): the state is what is asserted, not one run's count.
        tokio::task::spawn_blocking(move || crate::trash::sweep(&s, &f))
            .await
            .unwrap()
            .unwrap();
        // Past its 30 days, and the oldest of the rest while the bin alone
        // passes the quota.
        assert!(!in_bin(&r, ".trash/antiga.md"));
        assert!(!in_bin(&r, ".trash/media.md"));
        assert!(in_bin(&r, ".trash/nova.md"));
        let acts = actions(&r, &id);
        assert!(acts.contains(&"trash_expired".to_owned()), "{acts:?}");
        assert!(acts.contains(&"trash_over_quota".to_owned()), "{acts:?}");
    });
}

/// B11 (ADR 0080, decided 2026-10-31): a bin is kept under the server's size
/// cap, the oldest entries out first, and the sweep removes exactly those
/// entries of `.trash/`: a live note of the same name and the other notes
/// stay.
#[test]
fn the_sweep_keeps_the_bin_under_the_size_cap_oldest_first_and_only_the_bin() {
    block_on(async {
        let r = crate::tests::start_with(|c| c.trash_max = Some(100)).await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = opened(&r, &b, &id).await;
        let mut n = 2;
        for (name, len) in [("antiga", 60), ("media", 60), ("nova", 60)] {
            call(
                &mut ws,
                n,
                "create_note",
                json!({ "name": name, "text": "x".repeat(len) }),
            )
            .await;
            call(
                &mut ws,
                n + 1,
                "delete_note",
                json!({ "path": format!("{name}.md") }),
            )
            .await;
            n += 2;
        }
        // A live note with the oldest entry's name, made after its deletion.
        call(
            &mut ws,
            n,
            "create_note",
            json!({ "name": "antiga", "text": "viva" }),
        )
        .await;
        let day = verso_core::trash::DAY;
        let now = verso_core::trash::now();
        for (name, age) in [("antiga.md", 3), ("media.md", 2), ("nova.md", 1)] {
            r.server
                .db
                .put_trash_record(
                    &id,
                    &verso_core::trash::record(
                        &format!(".trash/{name}"),
                        name,
                        now - age * day,
                        Some("Admin"),
                        false,
                    ),
                )
                .unwrap();
        }
        let s = std::sync::Arc::clone(&r.server);
        let f = id.clone();
        tokio::task::spawn_blocking(move || crate::trash::sweep(&s, &f))
            .await
            .unwrap()
            .unwrap();
        // 180 bytes against 100: the two oldest go, none by age (all within
        // 30 days) and none by quota (there is none).
        assert!(!in_bin(&r, ".trash/antiga.md"));
        assert!(!in_bin(&r, ".trash/media.md"));
        assert!(in_bin(&r, ".trash/nova.md"));
        let acts = actions(&r, &id);
        assert_eq!(
            acts.iter().filter(|a| *a == "trash_over_cap").count(),
            2,
            "{acts:?}"
        );
        assert!(!acts.contains(&"trash_expired".to_owned()), "{acts:?}");
        assert!(!acts.contains(&"trash_over_quota".to_owned()), "{acts:?}");
        // Outside the bin nothing moved: the live note and the folder's own.
        for (call_id, path, text) in [(900, "antiga.md", "viva"), (901, "Sessao.md", "# Sessao\n")]
        {
            let note = call(&mut ws, call_id, "read_note", json!({ "path": path })).await;
            assert_eq!(note["ok"]["text"], text, "{note}");
        }
        // Under the cap a second sweep removes nothing more.
        let s = std::sync::Arc::clone(&r.server);
        let f = id.clone();
        let again = tokio::task::spawn_blocking(move || crate::trash::sweep(&s, &f))
            .await
            .unwrap()
            .unwrap();
        assert!(again.removed.is_empty());
        assert!(in_bin(&r, ".trash/nova.md"));
    });
}
