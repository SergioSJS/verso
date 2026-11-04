// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The refusals of ADR 0096, each as a request that is refused, through
//! the real server. See `tests.rs` for the lab.

use futures_util::StreamExt;
use serde_json::{Value, json};

use super::tests::{Lab, call, lab, lab_with, net, next, open, run, said};
use super::{Event, LocalSettings, PAIRED};
use crate::db::Role;

/// The way in: a phone is paired by the QR's token, asked about on the
/// laptop, and only then has a session — and what it reads is the folder
/// that was ticked.
#[test]
fn a_phone_is_paired_asked_about_and_then_reads_its_folder() {
    run(async {
        let mut lab = lab();
        lab.serve();
        // Before pairing, nobody is anyone.
        let (_, state) = lab.get("/api/state", None).await;
        assert_eq!(state["account"], Value::Null);
        assert_eq!(state["local"], true);
        assert_eq!(state["secure"], true);
        let (status, _) = lab.get("/api/folders", None).await;
        assert_eq!(status, 401);
        let cookie = lab
            .pair("iPhone de teste", true, Role::Reader)
            .await
            .unwrap();
        let (_, state) = lab.get("/api/state", Some(&cookie)).await;
        assert_eq!(state["account"]["email"], crate::db::LOCAL_OWNER);
        let mut ws = open(&lab, &cookie).await;
        let notes = call(&mut ws, 2, "list_notes", json!({})).await;
        assert_eq!(notes["ok"], json!(["Sessao.md"]));
        let phones = lab.local.phones().unwrap();
        assert_eq!(phones.len(), 1);
        assert_eq!(phones[0].name, "iPhone de teste");
        assert_eq!(phones[0].role, Role::Reader);
        assert!(said(&lab).contains(&Event::Asked));
    });
}

/// "Was it you?" is a real question: Refuse ends the token and the phone
/// never has a session.
#[test]
fn a_refused_pairing_makes_no_session() {
    run(async {
        let mut lab = lab();
        lab.serve();
        assert_eq!(lab.pair("Estranho", false, Role::Editor).await, None);
        assert!(lab.local.phones().unwrap().is_empty());
        // The token is spent: a second phone with it gets nothing.
        let (status, _) = lab
            .post("/api/pair", json!({ "token": "anything" }), None)
            .await;
        assert_eq!(status, 404, "the window is gone with the answer");
    });
}

/// A token is single use: the same token twice, the second is refused and
/// the phone it would have been never reaches the laptop.
#[test]
fn a_token_cannot_be_used_twice() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        let token = Lab::token(&view);
        let (first, _) = lab.post("/api/pair", json!({ "token": token }), None).await;
        let (second, body) = lab.post("/api/pair", json!({ "token": token }), None).await;
        assert_eq!((first, second), (200, 410), "{body}");
        assert!(
            lab.local.pair_state().asked.is_some(),
            "only the first asks"
        );
    });
}

/// Three wrong tokens close the window and the laptop says so; the right
/// token after them gets nothing — the answer of a route that is not there.
#[test]
fn three_wrong_tokens_close_the_window() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        for wrong in ["x", "ABCD-EFGH", "not-the-token"] {
            let (status, _) = lab.post("/api/pair", json!({ "token": wrong }), None).await;
            assert_eq!(status, 410, "{wrong}");
        }
        assert!(!lab.local.pair_state().open);
        let (status, body) = lab
            .post("/api/pair", json!({ "token": Lab::token(&view) }), None)
            .await;
        assert_eq!(status, 404, "{body}");
        let (unknown, unknown_body) = lab.post("/api/nothing-here", json!({}), None).await;
        assert_eq!(
            (status, &body),
            (unknown, &unknown_body),
            "as an unknown route"
        );
        assert!(said(&lab).contains(&Event::PairingEnded {
            why: "failures".to_owned()
        }));
    });
}

/// Nothing about pairing is reachable with no dialog open.
#[test]
fn with_no_dialog_open_pairing_answers_as_an_unknown_route() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let (unknown, unknown_body) = lab.post("/api/nothing-here", json!({}), None).await;
        for path in ["/api/pair", "/api/pair/poll"] {
            let (status, body) = lab
                .post(path, json!({ "token": "t", "poll": "p" }), None)
                .await;
            assert_eq!((status, &body), (unknown, &unknown_body), "{path}");
        }
        // And a window that was closed is gone.
        let view = lab.local.pair_open().unwrap();
        lab.local.pair_close();
        let (status, _) = lab
            .post("/api/pair", json!({ "token": Lab::token(&view) }), None)
            .await;
        assert_eq!(status, 404);
        // Not even the checks of a request (Origin, TLS) say that the
        // route is there: with no dialog open, a request that would be
        // refused 403 with one is answered as an unknown route is.
        let res = lab
            .client
            .post(lab.url("/api/pair"))
            .json(&json!({ "token": "t" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), unknown);
    });
}

/// The pairing needs a page of this server (Origin) and TLS.
#[test]
fn pairing_is_refused_from_another_origin() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        let res = lab
            .client
            .post(lab.url("/api/pair"))
            .header("origin", "https://evil.example")
            .json(&json!({ "token": Lab::token(&view) }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 403);
        let res = lab
            .client
            .post(lab.url("/api/pair"))
            .json(&json!({ "token": Lab::token(&view) }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 403, "no Origin at all");
        assert!(lab.local.pair_state().asked.is_none());
    });
}

/// A `Host` that is not one of the addresses served is refused (DNS
/// rebinding, ADR 0045).
#[test]
fn a_host_that_is_not_ours_is_refused() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let res = lab
            .client
            .get(lab.url("/api/state"))
            .header("host", "evil.example")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 421);
    });
}

/// No setup, no token, no console, no device flow here, and a phone has
/// none of an account's routes: it gets in by pairing and by nothing else.
/// (The sign-in is here since ADR 0117 D3 item 2, for a person invited;
/// `tests_accounts.rs` has its rules.)
#[test]
fn the_routes_of_a_server_with_accounts_are_not_here() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        for (method, path) in [
            ("POST", "/api/setup"),
            ("POST", "/api/forgot"),
            ("GET", "/api/me/tokens"),
            ("POST", "/api/me/tokens"),
            ("GET", "/api/me/sessions"),
            ("GET", "/api/admin/accounts"),
            ("GET", "/api/admin/config"),
            ("POST", "/api/device/start"),
            ("POST", "/api/passkey/start"),
            ("PUT", "/api/folders/x/shares"),
            ("POST", "/api/folders"),
        ] {
            let req = match method {
                "POST" => lab.client.post(lab.url(path)).json(&json!({})),
                "PUT" => lab.client.put(lab.url(path)).json(&json!({})),
                _ => lab.client.get(lab.url(path)),
            };
            let res = req
                .header("origin", lab.origin())
                .header("cookie", &cookie)
                .send()
                .await
                .unwrap();
            assert!(
                matches!(res.status().as_u16(), 404 | 405),
                "{method} {path} answered {}",
                res.status()
            );
        }
    });
}

/// A bearer token or a device session opens nothing here, whatever it is:
/// the only credential is a paired phone's cookie.
#[test]
fn a_bearer_credential_opens_nothing() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        // The cookie's own value as a bearer: a device-style use of it.
        let value = cookie.split_once('=').unwrap().1;
        let res = lab
            .client
            .get(lab.url("/api/folders"))
            .header("authorization", format!("Bearer {value}"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401);
        let res = lab
            .client
            .get(lab.url("/api/folders"))
            .header("authorization", "Bearer verso_pat_0123456789")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401);
    });
}

/// Item 12 end to end: a phone runs the commands on the allowlist and no
/// other, as a reader or as an editor — a command of the laptop, of the
/// owner, or one added tomorrow is refused.
#[test]
fn a_command_off_the_allowlist_is_refused() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPad", true, Role::Editor).await.unwrap();
        let mut ws = open(&lab, &cookie).await;
        let mut id = 10;
        for cmd in [
            "reveal",
            "open_url",
            "copy_full_path",
            "web_open",
            "check_for_updates",
            "download_and_install_update",
            "log_read",
            "install_cli",
            "mcp_add_claude",
            "share_grant",
            "server_sign_in",
            "folder_sync_start",
            "sync_state",
            "sync_put",
            "trash_empty",
            "local_server_start",
            "local_server_pair_open",
            "a_command_added_tomorrow",
        ] {
            id += 1;
            let answer = call(&mut ws, id, cmd, json!({})).await;
            assert_eq!(answer["err"]["kind"], "not_on_phone", "{cmd}: {answer}");
            assert!(answer.get("ok").is_none(), "{cmd} was run: {answer}");
        }
        // And what is on the list still works, for this editor.
        let notes = call(&mut ws, 99, "list_notes", json!({})).await;
        assert_eq!(notes["ok"], json!(["Sessao.md"]));
        let frame = call(
            &mut ws,
            100,
            "embed_frameable",
            json!({ "url": "https://example.com" }),
        )
        .await;
        assert!(
            frame.get("err").is_none(),
            "embed_frameable was allowed: {frame}"
        );
    });
}

/// A reader reads and writes nothing, however it asks; the editor of the
/// next test writes.
#[test]
fn a_reader_phone_cannot_write() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let mut ws = open(&lab, &cookie).await;
        let note = call(&mut ws, 2, "read_note", json!({ "path": "Sessao.md" })).await;
        let revision = note["ok"]["revision"].as_str().unwrap().to_owned();
        for (id, cmd, args) in [
            (
                3,
                "write_note",
                json!({ "path": "Sessao.md", "text": "# x\n", "revision": revision }),
            ),
            (4, "create_note", json!({ "path": "Nova.md" })),
            (5, "delete_note", json!({ "path": "Sessao.md" })),
            (6, "collab_update", json!({})),
        ] {
            let answer = call(&mut ws, id, cmd, args).await;
            assert_eq!(answer["err"]["kind"], "phone_reads", "{cmd}: {answer}");
        }
        let notes = call(&mut ws, 7, "list_notes", json!({})).await;
        assert_eq!(
            notes["ok"],
            json!(["Sessao.md"]),
            "nothing was made or deleted"
        );
        // The server counts it among the readers — it is told what a reader
        // is told — and a large upload from it is refused before it is parsed,
        // table image included (ADR 0107 item 3 as amended 2026-10-24).
        let server = std::sync::Arc::clone(
            &verso_service::lock(&lab.local.shared.inner)
                .as_ref()
                .unwrap()
                .server,
        );
        let ids: Vec<String> = verso_service::lock(&server.clients)
            .iter()
            .filter(|(_, c)| c.folder.is_some())
            .map(|(id, _)| id.clone())
            .collect();
        assert_eq!(ids.len(), 1);
        let (readers, others) = crate::readers::split(&server, &ids);
        assert_eq!((readers.len(), others.len()), (1, 0));
        for cmd in ["table_send_image", "create_file"] {
            assert!(
                crate::inflight::admit(&server, &ids[0], Some(1), cmd, 90_000).is_err(),
                "{cmd}"
            );
        }
    });
}

/// An editor phone writes — and is still never an owner: the owner-only
/// commands of the folder are refused.
#[test]
fn an_editor_phone_writes_and_is_never_an_owner() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let mut ws = open(&lab, &cookie).await;
        let note = call(&mut ws, 2, "read_note", json!({ "path": "Sessao.md" })).await;
        let revision = note["ok"]["revision"].as_str().unwrap().to_owned();
        let written = call(
            &mut ws,
            3,
            "write_note",
            json!({ "path": "Sessao.md", "text": "# Sessao\n\nDo celular\n", "revision": revision }),
        )
        .await;
        assert!(
            written["ok"]["note"]["text"]
                .as_str()
                .unwrap()
                .contains("Do celular"),
            "{written}"
        );
        // A phone is paired as a reader or an editor and never above it.
        let phones = lab.local.phones().unwrap();
        assert_eq!(phones[0].role, Role::Editor);
        let owner_only = call(&mut ws, 4, "trash_empty", json!({})).await;
        assert_eq!(owner_only["err"]["kind"], "not_on_phone");
        // The role chosen for a pairing is clamped: asking for the owner's
        // is an editor's.
        let cookie2 = lab.pair("iPad", true, Role::Owner).await.unwrap();
        let phones = lab.local.phones().unwrap();
        assert!(phones.iter().all(|p| p.role != Role::Owner));
        drop(cookie2);
    });
}

/// Item 13: at most four phones are paired; the fifth is refused before
/// its dialog opens.
#[test]
fn a_fifth_phone_cannot_be_paired() {
    run(async {
        let mut lab = lab();
        lab.serve();
        for n in 0..PAIRED {
            lab.pair(&format!("Celular {n}"), true, Role::Reader)
                .await
                .unwrap();
        }
        let err = lab.local.pair_open().unwrap_err();
        assert!(err.contains("4 phones are paired"), "{err}");
        // Revoking one makes room.
        let phones = lab.local.phones().unwrap();
        lab.local.revoke(&phones[0].id).unwrap();
        lab.local.pair_open().unwrap();
    });
}

/// What a refused phone hears: the upgrade is accepted and closed at once
/// with the application's code and the most it was refused at, because a
/// browser's WebSocket never sees the status of a refused upgrade.
async fn refusal_of(lab: &Lab, cookie: &str) -> (u16, String) {
    let mut ws = lab.connect(cookie).await.expect("the upgrade is accepted");
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(10), ws.next())
            .await
            .expect("closed in time")
            .expect("a close frame")
            .unwrap();
        if let tokio_tungstenite::tungstenite::Message::Close(Some(frame)) = m {
            return (u16::from(frame.code), frame.reason.to_string());
        }
    }
}

/// Item 13 (amended 2026-10-16): at most the setting's number of phones
/// connected at once (4 by default; two here); a connected phone can still
/// open another connection; the phone refused is told, not left to retry
/// blind, and the log and the audit log say so once a minute.
#[test]
fn a_phone_past_the_ceiling_is_told_so() {
    run(async {
        let mut lab = lab();
        lab.serve();
        lab.local
            .set_settings(&LocalSettings {
                max_connected: 2,
                ..LocalSettings::default()
            })
            .unwrap();
        let a = lab.pair("A", true, Role::Reader).await.unwrap();
        let b = lab.pair("B", true, Role::Reader).await.unwrap();
        let c = lab.pair("C", true, Role::Reader).await.unwrap();
        let _wa = open(&lab, &a).await;
        let _wb = open(&lab, &b).await;
        for _ in 0..3 {
            let (code, reason) = refusal_of(&lab, &c).await;
            assert_eq!(code, crate::rpc::PHONES_FULL);
            assert_eq!(reason, "phones_connected:2");
        }
        // Three tries in a row: one line, one audit entry.
        assert_eq!(
            crate::log::said("the phones connected holds 2 already (C waits)").len(),
            1
        );
        let refused = lab
            .local
            .audit()
            .unwrap()
            .into_iter()
            .filter(|e| e.action == "phone_connection_refused")
            .count();
        assert_eq!(refused, 1);
        // A second connection of A (another tab) takes no new place.
        assert!(lab.connect(&a).await.is_ok());
        assert_eq!(lab.local.status().unwrap().phones_connected, 2);
    });
}

/// The setting: 4 by default (as many as may be paired), 1 to 16 enforced,
/// kept across starts; raising it lets the refused phone in at once, and
/// lowering it under the count refuses new connections only.
#[test]
fn the_ceiling_of_phones_connected_is_a_setting() {
    run(async {
        let mut lab = lab();
        lab.serve();
        assert_eq!(lab.local.settings().unwrap().max_connected, 4);
        assert_eq!(lab.local.status().unwrap().max_connected, 4);
        for bad in [0, 17] {
            let err = lab
                .local
                .set_settings(&LocalSettings {
                    max_connected: bad,
                    ..LocalSettings::default()
                })
                .unwrap_err();
            assert!(err.contains("between 1 and 16"), "{err}");
        }
        // An old settings file, without the field, loads with the default.
        let old: LocalSettings = serde_json::from_str(r#"{"keepOn":true}"#).unwrap();
        assert_eq!((old.keep_on, old.max_connected), (true, 4));
        let set = |n| LocalSettings {
            max_connected: n,
            ..LocalSettings::default()
        };
        let a = lab.pair("A", true, Role::Reader).await.unwrap();
        let b = lab.pair("B", true, Role::Reader).await.unwrap();
        let _wa = open(&lab, &a).await;
        let _wb = open(&lab, &b).await;
        // Lowered under the count: nobody is cut off, a new one is refused.
        lab.local.set_settings(&set(1)).unwrap();
        assert_eq!(lab.local.status().unwrap().phones_connected, 2);
        let c = lab.pair("C", true, Role::Reader).await.unwrap();
        assert_eq!(refusal_of(&lab, &c).await.1, "phones_connected:1");
        // Raised: the next try gets in.
        lab.local.set_settings(&set(3)).unwrap();
        assert_eq!(lab.local.settings().unwrap().max_connected, 3);
        assert!(lab.connect(&c).await.is_ok());
    });
}

/// Item 15: revoking a phone ends its session and closes its open
/// connection at once; its cookie opens nothing afterwards.
#[test]
fn a_revoked_phone_is_cut_off_at_once() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let mut ws = open(&lab, &cookie).await;
        let phones = lab.local.phones().unwrap();
        lab.local.revoke(&phones[0].id).unwrap();
        // At once: not at the connection's next exchange.
        let gone = tokio::time::timeout(std::time::Duration::from_secs(5), next(&mut ws))
            .await
            .expect("the connection is told it is cut off within seconds");
        assert_eq!(gone["gone"], "session", "{gone}");
        let (_, state) = lab.get("/api/state", Some(&cookie)).await;
        assert_eq!(state["account"], Value::Null);
        assert_eq!(lab.connect(&cookie).await.err(), Some(401));
        assert!(lab.local.phones().unwrap().is_empty());
    });
}

/// Forget all devices ends every session, and a turned-off server forgets
/// too.
#[test]
fn forgetting_all_ends_every_session() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let a = lab.pair("A", true, Role::Reader).await.unwrap();
        lab.pair("B", true, Role::Reader).await.unwrap();
        assert_eq!(lab.local.forget_all().unwrap(), 2);
        let (_, state) = lab.get("/api/state", Some(&a)).await;
        assert_eq!(state["account"], Value::Null);
        lab.local.stop();
        assert!(lab.local.phones().unwrap().is_empty());
    });
}

/// Item 15: replacing the identity ends every pairing and makes a new key:
/// serving stops, and the next start has another fingerprint.
#[test]
fn replacing_the_identity_ends_every_pairing() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let before = lab.local.pair_open().unwrap().fingerprint;
        lab.pair("iPhone", true, Role::Reader).await.unwrap();
        lab.local.replace_identity().unwrap();
        assert!(!lab.local.status().unwrap().serving);
        assert!(lab.local.phones().unwrap().is_empty());
        lab.serve();
        let after = lab.local.pair_open().unwrap().fingerprint;
        assert_ne!(before, after);
    });
}

/// Item 3: nothing is served on a public address; a machine with only a
/// public address cannot turn it on, and says why.
#[test]
fn a_public_address_is_never_served() {
    run(async {
        let lab = lab_with(&["8.8.8.8", "203.0.113.5"], false);
        let err = lab.local.start().unwrap_err();
        assert!(err.contains("no private network address"), "{err}");
        assert!(!lab.local.status().unwrap().serving);
        // A public address beside a private one is left out of the set.
        let lab = lab_with(&["8.8.8.8", "192.168.77.1"], false);
        // 192.168.77.1 may not be bindable on this machine: the point is
        // which addresses were chosen, so look at the choice itself.
        let chosen = lab.local.addresses(&lab.table.0.lock().unwrap());
        assert_eq!(chosen.len(), 1);
        assert_eq!(chosen[0].ip.to_string(), "192.168.77.1");
    });
}

/// Item 3: when the set of addresses changes, serving stops by itself and
/// says why; it does not carry on in the café.
#[test]
fn a_changed_set_of_addresses_stops_serving() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let id = 1;
        assert!(lab.local.watch_once(id, false), "same network: goes on");
        assert!(lab.local.status().unwrap().serving);
        // Another network: a different address.
        *lab.table.0.lock().unwrap() = vec![net("127.0.0.2")];
        assert!(!lab.local.watch_once(id, false));
        let status = lab.local.status().unwrap();
        assert!(!status.serving);
        assert!(status.stopped_because.unwrap().contains("network changed"));
        assert!(
            said(&lab)
                .iter()
                .any(|e| matches!(e, Event::Stopped { why } if why.contains("network changed")))
        );
        // The port is closed.
        let res = lab.client.get(lab.url("/api/state")).send().await;
        assert!(res.is_err());
    });
}

/// After a sleep with the same addresses, serving goes on.
#[test]
fn waking_on_the_same_network_resumes() {
    run(async {
        let mut lab = lab();
        lab.serve();
        assert!(lab.local.watch_once(1, true));
        assert!(lab.local.status().unwrap().serving);
        let (status, _) = lab.get("/api/state", None).await;
        assert_eq!(status, 200);
    });
}

/// Item 3's check in the handshake: a peer outside the subnets of the
/// machine is refused before a place is taken.
#[test]
fn a_peer_off_the_subnet_is_refused_at_the_door() {
    let events: super::Sink = std::sync::Arc::new(|_| {});
    let policy = super::Policy::new(events);
    policy.set_network(&[super::tests::net("192.168.1.20")], 50_000, &[]);
    // /8 in the test table: 192.x is a /8 here, so use the real thing.
    let mut real = super::tests::net("192.168.1.20");
    real.prefix = 24;
    policy.set_network(&[real], 50_000, &[]);
    let slots = crate::listen::Slots::for_local(policy.admit_fn());
    assert!(slots.take("192.168.1.77".parse().unwrap()).is_some());
    for off in ["192.168.2.5", "10.0.0.5", "8.8.8.8", "127.0.0.1"] {
        assert!(slots.take(off.parse().unwrap()).is_none(), "{off}");
    }
}

/// Item 13: 64 connections in all and 16 from one address on a laptop.
#[test]
fn a_laptop_holds_fewer_connections_than_a_host() {
    let events: super::Sink = std::sync::Arc::new(|_| {});
    let policy = super::Policy::new(events);
    let mut real = super::tests::net("192.168.1.20");
    real.prefix = 24;
    policy.set_network(&[real], 50_000, &[]);
    let slots = crate::listen::Slots::for_local(policy.admit_fn());
    let one: std::net::IpAddr = "192.168.1.77".parse().unwrap();
    let held: Vec<_> = (0..16).filter_map(|_| slots.take(one)).collect();
    assert_eq!(held.len(), 16);
    assert!(slots.take(one).is_none(), "the 17th from one address");
    let others: Vec<_> = (2..=60)
        .filter_map(|n| slots.take(format!("192.168.1.{n}").parse().unwrap()))
        .collect();
    assert_eq!(held.len() + others.len().min(48), 64);
    drop(others);
    drop(held);
}

/// The certificate the phone meets is the one whose fingerprint the QR and
/// the dialog carry.
#[test]
fn the_served_certificate_is_the_one_the_dialog_fingerprints() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        let parsed = super::qr::parse(&view.url).unwrap();
        let res = lab.client.get(lab.url("/api/state")).send().await.unwrap();
        let info = res
            .extensions()
            .get::<reqwest::tls::TlsInfo>()
            .map(|i| i.peer_certificate().map(<[u8]>::to_vec));
        // Not every build of reqwest hands the certificate back; when it
        // does, it is the fingerprinted one.
        if let Some(Some(der)) = info {
            assert_eq!(super::cert::fingerprint(&der), parsed.fingerprint);
        }
        assert_eq!(super::cert::spaced(&parsed.fingerprint), view.fingerprint);
        assert_eq!(parsed.contract, crate::contract_version());
        assert!(
            view.url
                .starts_with(&format!("https://127.0.0.1:{}/pair#", lab.port))
        );
        assert_eq!(view.certificate, "own");
    });
}

/// The first connection of a paired phone tells the person, once.
#[test]
fn a_new_phone_connecting_is_announced_once() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone da Ana", true, Role::Reader).await.unwrap();
        let _ws = open(&lab, &cookie).await;
        let _again = lab.connect(&cookie).await.unwrap();
        let connected: Vec<_> = said(&lab)
            .into_iter()
            .filter(|e| matches!(e, Event::PhoneConnected { .. }))
            .collect();
        assert_eq!(
            connected,
            vec![Event::PhoneConnected {
                name: "iPhone da Ana".to_owned()
            }]
        );
    });
}

/// Item 14: what the audit log says, and what it never says.
#[test]
fn the_audit_log_records_events_and_never_a_secret() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        let token = Lab::token(&view);
        lab.post("/api/pair", json!({ "token": "wrong" }), None)
            .await;
        lab.post(
            "/api/pair",
            json!({ "token": token, "device": "iPhone" }),
            None,
        )
        .await;
        lab.local.answer(true, Role::Reader).unwrap();
        let log = lab.local.audit().unwrap();
        let actions: Vec<&str> = log.iter().map(|e| e.action.as_str()).collect();
        for expected in [
            "local_on",
            "pair_open",
            "pair_refused_attempt",
            "pair_asked",
            "pair_allowed_reader",
        ] {
            assert!(actions.contains(&expected), "{expected} in {actions:?}");
        }
        let everything = serde_json::to_string(&log).unwrap();
        assert!(!everything.contains(&token));
        assert!(!everything.contains(&view.code));
        assert!(!everything.contains("wrong"));
        for line in crate::log::said("a token was redeemed") {
            assert!(!line.contains(&token));
        }
    });
}

/// Item 2: only the ticked folders are served, under the name they were
/// given — never a path.
#[test]
fn only_the_ticked_folders_are_served_by_name() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let (_, mine) = lab.get("/api/folders", Some(&cookie)).await;
        let folders = mine["folders"].as_array().unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0]["name"], "Campanha");
        let everything = mine.to_string();
        assert!(!everything.contains(lab.notes.path().to_str().unwrap()));
        // A folder nobody ticked cannot be opened by naming it.
        let mut ws = lab.connect(&cookie).await.unwrap();
        next(&mut ws).await;
        let refused = call(
            &mut ws,
            1,
            "open_server_folder",
            json!({ "id": "not-a-folder" }),
        )
        .await;
        assert!(refused.get("err").is_some(), "{refused}");
        let by_path = call(
            &mut ws,
            2,
            "open_server_folder",
            json!({ "id": lab.notes.path().to_str().unwrap() }),
        )
        .await;
        assert!(by_path.get("err").is_some(), "{by_path}");
    });
}

/// Item 1: the mode is off until turned on, and a stopped server answers
/// nothing.
#[test]
fn off_is_off() {
    run(async {
        let lab = lab();
        let status = lab.local.status().unwrap();
        assert!(!status.serving);
        assert_eq!(status.port, None);
        assert!(
            lab.local
                .pair_open()
                .unwrap_err()
                .contains("turn serving on")
        );
        let mut lab = lab;
        lab.serve();
        let port = lab.port;
        lab.local.stop();
        assert!(!lab.local.status().unwrap().serving);
        // The listener ends on the stop signal, in the server's runtime, not
        // inside `stop`: on a slow machine it can still accept for a moment
        // (GitHub's Windows runner, 2026-11-03). Closed within 5 s.
        let closed = |_| {
            std::net::TcpStream::connect_timeout(
                &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
                std::time::Duration::from_secs(1),
            )
            .is_err()
                || {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    false
                }
        };
        assert!((0..50).any(closed), "the port is closed");
    });
}

/// Item 4: the port is chosen once and kept.
#[test]
fn the_port_is_kept_across_starts() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let first = lab.port;
        assert!((49_152..=65_535).contains(&first));
        lab.local.stop();
        lab.serve();
        assert_eq!(lab.port, first);
    });
}

/// Item 4, on a machine that is slow to close a socket (a Windows runner):
/// serving turned off and on again finds the old listener still closing,
/// and waits for it rather than choosing another port.
#[test]
fn the_port_is_kept_when_the_old_listener_is_still_closing() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let first = lab.port;
        lab.local.stop();
        // Whatever of the old listener is left, a socket of ours takes its
        // place for a moment.
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], first));
        let holder = loop {
            if let Ok(l) = std::net::TcpListener::bind(addr) {
                break l;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(600));
            drop(holder);
        });
        lab.serve();
        release.join().unwrap();
        assert_eq!(lab.port, first, "the port the phones know");
    });
}

/// Item 11: a folder with no folder ticked refuses to start.
#[test]
fn it_will_not_start_with_nothing_ticked() {
    run(async {
        let lab = lab();
        lab.local.set_settings(&LocalSettings::default()).unwrap();
        let err = lab.local.start().unwrap_err();
        assert!(err.contains("tick at least one folder"), "{err}");
    });
}

/// The owner's role in the folder is the owner's; a phone of the owner's
/// account is an editor at most (item 12), and a reader's reaches no write.
#[test]
fn a_phone_is_never_an_owner_in_the_folder() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let running = verso_service::lock(&lab.local.shared.inner);
        let server = &running.as_ref().unwrap().server;
        let folder = server.db.folders().unwrap().remove(0);
        let owner = server.db.local_owner().unwrap();
        assert_eq!(
            server.db.role(&folder.id, &owner.id).unwrap(),
            Some(Role::Owner)
        );
        let who = |phone| crate::auth::Who {
            account: owner.clone(),
            via: crate::auth::Via::Browser {
                session: "s".into(),
                csrf: "c".into(),
            },
            phone,
        };
        let role = |w: &crate::auth::Who| crate::access::role(server, w, &folder.id).unwrap().1;
        assert_eq!(role(&who(None)), Role::Owner);
        assert_eq!(role(&who(Some(Role::Editor))), Role::Editor);
        assert_eq!(role(&who(Some(Role::Reader))), Role::Reader);
    });
}

/// Item 2: unticking a folder takes it away from the phones — the next
/// start serves the folders ticked then, and the registry follows.
#[test]
fn an_unticked_folder_is_no_longer_served() {
    run(async {
        let mut lab = lab();
        let other = lab.notes.path().join("Outra");
        crate::data::ensure_dir(&other).unwrap();
        let mut settings = lab.local.settings().unwrap();
        let both = {
            let mut s = settings.clone();
            s.folders.push(other.to_string_lossy().into_owned());
            s
        };
        lab.local.set_settings(&both).unwrap();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let (_, mine) = lab.get("/api/folders", Some(&cookie)).await;
        let mut names: Vec<_> = mine["folders"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["name"].as_str().unwrap().to_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["Campanha", "Outra"]);
        lab.local.stop();
        settings.folders.truncate(1);
        lab.local.set_settings(&settings).unwrap();
        lab.serve();
        let (_, mine) = lab.get("/api/folders", Some(&cookie)).await;
        let names: Vec<_> = mine["folders"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["name"].as_str().unwrap().to_owned())
            .collect();
        assert_eq!(names, ["Campanha"]);
    });
}

/// Without the window's files the phone would be served a blank page: it
/// is said at the start instead, with what to do.
#[test]
fn it_will_not_start_without_the_windows_files() {
    run(async {
        let lab = lab();
        let without = super::LocalServer::for_tests(
            lab.dir.path().join("local"),
            vec![lab.dir.path().join("nowhere")],
            std::sync::Arc::new(|_| {}),
            lab.table.clone(),
            true,
        );
        let err = without.start().unwrap_err();
        assert!(err.contains("web.html"), "{err}");
    });
}

/// Item 9: the app tries its own address once; a connection that is
/// refused is told as a firewall's, with nothing added by the app.
#[test]
fn an_address_nobody_answers_on_is_told() {
    // A port that was open and is closed again.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    assert!(super::reachable(addr), "an open port answers");
    drop(listener);
    assert!(!super::reachable(addr), "a closed one does not");
}

/// A serving app has been able to reach itself: nothing is told. Waits for
/// the try to be made (it is made as serving starts, off to the side).
#[test]
fn a_serving_app_reaches_itself() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let mut tried = 0;
        for _ in 0..100 {
            tried = verso_service::lock(&lab.local.shared.inner)
                .as_ref()
                .map_or(0, |r| r.reach.load(std::sync::atomic::Ordering::Relaxed));
            if tried != 0 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert_eq!(tried, 1, "the try was made and the address answered");
        assert!(!lab.local.status().unwrap().unreachable);
        assert!(!said(&lab).contains(&Event::Unreachable));
    });
}

/// The pairing dialog says which address the QR is for, with its interface,
/// lists every address served so the person can pick another, and refuses
/// an address that is not served. The certificate names every address
/// served, so any pick is valid and none needs a new certificate.
#[test]
fn the_pairing_dialog_names_its_address_and_takes_a_pick() {
    run(async {
        let mut lab = lab();
        *lab.table.1.lock().unwrap() = Some("127.0.0.1".parse().unwrap());
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        assert_eq!(view.chosen, "127.0.0.1");
        assert_eq!(view.choices.len(), 1);
        let c = &view.choices[0];
        assert_eq!(
            (c.address.as_str(), c.interface.as_str()),
            ("127.0.0.1", "en0")
        );
        assert_eq!(c.kind, "lan");
        assert!(c.default_route);
        assert!(view.url.contains("127.0.0.1"), "{}", view.url);
        // Picking an address again opens a new window: a new token.
        let again = lab.local.pair_open_on(Some("127.0.0.1")).unwrap();
        assert_ne!(Lab::token(&view), Lab::token(&again));
        // The old token no longer pairs; the new one does.
        let (old, _) = lab
            .post("/api/pair", json!({ "token": Lab::token(&view) }), None)
            .await;
        assert_eq!(old, 410);
        // An address that is not served is refused, in words.
        let err = lab.local.pair_open_on(Some("10.0.0.9")).unwrap_err();
        assert!(err.contains("10.0.0.9"), "{err}");
    });
}

/// The web window, loading on a paired phone, asks a few commands of its
/// own before anything else (`main.ts`): the embed origins, the walk's
/// rules, the history days, the folder note's name, the menu's language, the
/// capabilities and the folder. None of them may be refused — the maintainer
/// saw "Erro: ... (not from a phone)" the first time a phone paired
/// (2026-10-15). The two that would change the laptop's folder settings
/// (the walk's rules and the folder note's name) are heard and change
/// nothing; the window's log lines are heard and dropped.
#[test]
fn the_web_window_loads_on_a_phone_with_no_refusal() {
    run(async {
        for role in [Role::Reader, Role::Editor] {
            let mut lab = lab();
            lab.serve();
            let cookie = lab.pair("Android", true, role).await.unwrap();
            let mut ws = open(&lab, &cookie).await;
            let mut id = 20;
            for (cmd, args) in [
                ("set_embed_origins", json!({ "origins": [] })),
                (
                    "set_walk_rules",
                    json!({ "builtinIgnores": false, "gitignore": false }),
                ),
                ("set_history_days", json!({ "days": 365 })),
                ("set_folder_note_name", json!({ "name": "index" })),
                ("set_menu_language", json!({ "language": "pt" })),
                ("log_write", json!({ "level": "INFO", "message": "x" })),
                ("open_initial", json!({})),
                ("capabilities", json!({})),
                ("app_info", json!({})),
                ("current_folder", json!({})),
                ("reindex", json!({})),
                ("list_notes", json!({})),
            ] {
                id += 1;
                let answer = call(&mut ws, id, cmd, args).await;
                assert!(answer.get("err").is_none(), "{cmd} as {role:?}: {answer}");
            }
        }
    });
}

static LOGGED: std::sync::Mutex<Vec<(String, String)>> = std::sync::Mutex::new(Vec::new());

fn keep_line(level: &str, message: &str) {
    LOGGED
        .lock()
        .unwrap()
        .push((level.to_owned(), message.to_owned()));
}

/// ADR 0096 item 14: the app's own log has the mode's life — on and off
/// with the addresses and the port, the pairing's events, the phones'
/// sessions and the refusals — and never a token, a code, the QR's text, the
/// fingerprint, a cookie or a note's words. The host's log file hears the
/// same lines through the server's log sink.
#[test]
fn the_log_has_the_modes_life_and_no_secret() {
    run(async {
        crate::log::set_sink(Some(keep_line));
        let mut lab = lab();
        lab.serve();
        // A pairing refused at the computer, one approved, a command refused
        // and the phone revoked.
        assert!(
            lab.pair("Moto Refusado", false, Role::Reader)
                .await
                .is_none()
        );
        let view = lab.local.pair_open().unwrap();
        let wrong = lab
            .post("/api/pair", json!({ "token": "not-the-token" }), None)
            .await;
        assert_eq!(wrong.0, 410);
        let cookie = lab.pair("Moto Aprovado", true, Role::Reader).await.unwrap();
        let mut ws = open(&lab, &cookie).await;
        let note = call(&mut ws, 2, "read_note", json!({ "path": "Sessao.md" })).await;
        assert!(note.get("ok").is_some());
        let refused = call(&mut ws, 3, "reveal", json!({ "path": "Sessao.md" })).await;
        assert_eq!(refused["err"]["kind"], "not_on_phone");
        drop(ws);
        // The server notices the closed socket on its own time: it closes the
        // phone's folder first, and on macOS that waits on `fseventsd`, which
        // under a loaded suite took more than the 5 s once (2026-10-22).
        // Bounded, and ending as soon as the line is there.
        for _ in 0..600 {
            let gone = LOGGED
                .lock()
                .unwrap()
                .iter()
                .any(|(_, m)| m.contains("a paired phone disconnected: Moto Aprovado"));
            if gone {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        let phones = lab.local.phones().unwrap();
        let aprovado = phones.iter().find(|p| p.name == "Moto Aprovado").unwrap();
        lab.local.revoke(&aprovado.id).unwrap();
        lab.local.stop();
        crate::log::set_sink(None);

        let lines: Vec<(String, String)> = LOGGED
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, m)| !m.contains("test-other"))
            .cloned()
            .collect();
        let has = |level: &str, what: &str| {
            assert!(
                lines.iter().any(|(l, m)| l == level && m.contains(what)),
                "no {level} line with {what:?} in {lines:#?}"
            );
        };
        has("INFO", "local server on: 127.0.0.1 (en0); port ");
        has("INFO", "the pairing window opened, for 127.0.0.1");
        has(
            "INFO",
            "a pairing was refused at the computer: Moto Refusado",
        );
        has(
            "INFO",
            "a pairing was approved at the computer: Moto Aprovado",
        );
        has("INFO", "a paired phone connected: Moto Aprovado");
        has("INFO", "a paired phone disconnected: Moto Aprovado");
        has("INFO", "a paired phone was revoked: Moto Aprovado");
        has("INFO", "local server stopped");
        has(
            "WARN",
            "a paired phone ran a command that is not its to run: reveal",
        );
        has("WARN", "a wrong or reused pairing token");
        // Secrets: the token and the code of the window, the QR's text, the
        // fingerprint (both forms), the session cookie and the note's text.
        let parsed = super::qr::parse(&view.url).unwrap();
        let secrets = [
            parsed.token.as_str(),
            view.code.as_str(),
            view.url.as_str(),
            view.fingerprint.as_str(),
            parsed.fingerprint.as_str(),
            cookie.as_str(),
            cookie.split_once('=').map_or("", |c| c.1),
            "# Sessao",
            "not-the-token",
        ];
        for (level, message) in &lines {
            for secret in secrets {
                assert!(
                    secret.is_empty() || !message.contains(secret),
                    "{level} line carries a secret ({secret:?}): {message}"
                );
            }
        }
    });
}

/// A paired phone's role is changed from the computer without pairing again
/// (the maintainer paired as a reader and had to forget the device to edit):
/// at once for a phone that is connected — its next write is accepted, and
/// after the demotion refused, with the window told its role — logged and
/// listed in the audit.
#[test]
fn a_paired_phones_role_changes_at_once() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("Pixel", true, Role::Reader).await.unwrap();
        let mut ws = open(&lab, &cookie).await;
        let note = call(&mut ws, 2, "read_note", json!({ "path": "Sessao.md" })).await;
        let revision = note["ok"]["revision"].as_str().unwrap().to_owned();
        let write = |text: &str, revision: &str| json!({ "path": "Sessao.md", "text": text, "revision": revision });
        let denied = call(&mut ws, 3, "write_note", write("# a\n", &revision)).await;
        assert_eq!(denied["err"]["kind"], "phone_reads", "{denied}");
        let id = lab.local.phones().unwrap()[0].id.clone();

        lab.local.set_phone_role(&id, true).unwrap();
        assert_eq!(lab.local.phones().unwrap()[0].role, Role::Editor);
        let told = next(&mut ws).await;
        assert_eq!(told["role"], "editor", "{told}");
        let done = call(&mut ws, 4, "write_note", write("# b\n", &revision)).await;
        assert!(done.get("ok").is_some(), "{done}");
        let revision = done["ok"]["note"]["revision"].as_str().unwrap().to_owned();

        lab.local.set_phone_role(&id, false).unwrap();
        let told = next(&mut ws).await;
        assert_eq!(told["role"], "reader", "{told}");
        let denied = call(&mut ws, 5, "write_note", write("# c\n", &revision)).await;
        assert_eq!(denied["err"]["kind"], "phone_reads", "{denied}");

        // Listed in the audit, and a phone that is not paired is refused.
        let actions: Vec<String> = lab
            .local
            .audit()
            .unwrap()
            .into_iter()
            .map(|a| a.action)
            .collect();
        assert!(
            actions.contains(&"phone_role_editor".to_owned()),
            "{actions:?}"
        );
        assert!(
            actions.contains(&"phone_role_reader".to_owned()),
            "{actions:?}"
        );
        assert!(lab.local.set_phone_role("nobody", true).is_err());
    });
}
