// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Verso app paired, once it is home (ADR 0117 D19 items 3 and 5, the
//! maintainer's decisions of 2026-11-15): how long it lasts without
//! speaking to this computer — the owner's setting, 90 days by default, a
//! browser's phone keeping its 14 — and this computer announced on the
//! network while, and only while, it serves there.

use std::sync::Arc;

use super::tests::{lab, run};
use super::tests_pair_app::{bearer_get, pair_app};
use super::{LocalSettings, Policy, lock};
use crate::db::{APP_IDLE_DAYS, Db, Role};

const DAY: i64 = 24 * 3600;

fn db_of(lab: &super::tests::Lab) -> Db {
    Db::open(&lab.dir.path().join("local")).unwrap()
}

/// An app paired lasts the setting's days unused — 90 unless the owner
/// chose otherwise, past a browser's 14 and past 90 days since it was
/// paired while it is used; a shorter limit holds at once, for the apps
/// paired before too, and the app must pair again; *never* keeps it. A
/// browser's phone keeps 14 days.
#[test]
fn a_paired_app_lasts_the_owners_limit_and_a_browsers_phone_its_fourteen_days() {
    run(async {
        let mut lab = lab();
        lab.serve();
        assert_eq!(lab.local.app_idle_days().unwrap(), APP_IDLE_DAYS);
        assert_eq!(APP_IDLE_DAYS, 90);
        let (token, _) = pair_app(&lab, Role::Editor).await;
        let cookie = lab
            .pair("Firefox do Davi", true, Role::Reader)
            .await
            .unwrap();
        assert_eq!(lab.local.phones().unwrap().len(), 2);
        // A month without a word: the app is still paired, the browser not.
        db_of(&lab).age_sessions_for_tests(30 * DAY).unwrap();
        let (status, folders) = bearer_get(&lab, "/api/folders", &token).await;
        assert_eq!(status, 200, "within 90 days the app syncs: {folders}");
        let (status, _) = lab.get("/api/folders", Some(&cookie)).await;
        assert_eq!(status, 401, "a browser's phone keeps its 14 days");
        let phones = lab.local.phones().unwrap();
        assert_eq!(phones.len(), 1, "{phones:?}");
        assert_eq!(phones[0].name, "Pixel da Ana");
        // Used every day for a hundred days, it is not ended at 90.
        for _ in 0..4 {
            db_of(&lab).age_sessions_for_tests(25 * DAY).unwrap();
            let (status, _) = bearer_get(&lab, "/api/folders", &token).await;
            assert_eq!(status, 200, "an app in use has no bound since its pairing");
        }
        // A shorter limit, chosen now, holds for the app paired before it.
        assert!(lab.local.set_app_idle_days(3).is_err(), "below the bounds");
        assert!(lab.local.set_app_idle_days(366).is_err(), "above them");
        lab.local.set_app_idle_days(7).unwrap();
        assert_eq!(lab.local.app_idle_days().unwrap(), 7);
        db_of(&lab).age_sessions_for_tests(8 * DAY).unwrap();
        let (status, _) = bearer_get(&lab, "/api/folders", &token).await;
        assert_eq!(status, 401, "idle past the limit: the app pairs again");
        assert!(lab.local.phones().unwrap().is_empty());
        // It pairs again and syncs (its copy stayed on the device).
        let (again, _) = pair_app(&lab, Role::Editor).await;
        let (status, _) = bearer_get(&lab, "/api/folders", &again).await;
        assert_eq!(status, 200);
        // Never: only Revoke, Forget all or a new identity end it.
        lab.local.set_app_idle_days(0).unwrap();
        db_of(&lab).age_sessions_for_tests(1000 * DAY).unwrap();
        let (status, _) = bearer_get(&lab, "/api/folders", &again).await;
        assert_eq!(status, 200, "never: still paired after 1000 days");
        assert_eq!(lab.local.phones().unwrap().len(), 1);
        // The setting is said in the audit, and kept across a restart.
        assert!(
            lab.local
                .audit()
                .unwrap()
                .iter()
                .any(|a| a.action == "app_idle_set")
        );
        lab.local.stop();
        assert_eq!(lab.local.app_idle_days().unwrap(), 0);
    });
}

fn policy(lab: &super::tests::Lab) -> Arc<Policy> {
    Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().policy)
}

/// Announced while serving on the network, the pairing window opened and
/// closed or not; announced no more once serving stops or the network
/// changes; never while only the internet link serves.
#[test]
fn this_computer_is_announced_while_and_only_while_it_serves_on_the_network() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let p = policy(&lab);
        assert!(p.announced(), "serving on the network: announced");
        assert!(p.pin().is_some(), "with its key's pin");
        lab.local.pair_open().unwrap();
        lab.local.pair_close();
        assert!(p.announced(), "the window closed: still announced");
        lab.local.stop();
        assert!(!p.announced(), "serving stopped: the goodbye");
        // Again, and the network changes: serving stops, and the record.
        lab.serve();
        let p = policy(&lab);
        assert!(p.announced());
        *lab.table.0.lock().unwrap() = vec![super::tests::net("127.0.0.2")];
        let id = lock(&lab.local.shared.inner).as_ref().unwrap().id;
        assert!(!lab.local.watch_once(id, false));
        assert!(!p.announced(), "the network changed: announced no more");
        // The internet link alone: nothing is announced on the network.
        *lab.table.0.lock().unwrap() = vec![super::tests::net("127.0.0.1")];
        let settings = lab.local.settings().unwrap();
        lab.local
            .set_settings(&LocalSettings {
                network: false,
                ..settings
            })
            .unwrap();
        lab.local.link_open().unwrap();
        let p = policy(&lab);
        assert!(!p.announced(), "only the link serves: no announcement");
        lab.local.link_close();
    });
}
