// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Regression tests for the independent review of ADR 0087 item 4 (readers
//! never receive a secret block "or anything derived from it"), each one
//! a probe of the review turned permanent: the sizes, the counters, the
//! order and the flags a reader sees do not move with a secret block.

use serde_json::json;

use crate::tests::{block_on, call};
use crate::tests_secret::{ask, folder_with_a_reader};

#[test]
fn a_reader_is_told_no_index_size() {
    // I1: the index grows with the secret text it holds.
    block_on(async {
        let (_r, mut owner, mut reader, _id) = folder_with_a_reader().await;
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        let owned = call(&mut owner, 20, "folder_space", json!({})).await;
        assert!(
            owned["ok"]["index"].as_f64().unwrap_or(0.0) > 0.0,
            "{owned}"
        );
        let read = ask(&mut reader, 2, "folder_space", json!({})).await;
        assert_eq!(read["ok"]["index"], json!(0.0), "{read}");
    });
}

#[test]
fn a_reader_s_change_numbers_have_no_gaps_for_secret_only_changes() {
    // M1: the folder's numbers would tell a reader how many changes only
    // touched a secret block; its log is numbered in its own count.
    block_on(async {
        let (_r, mut owner, mut reader, _id) = folder_with_a_reader().await;
        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
        let before = ask(&mut reader, 2, "sync_changes", json!({ "since": 0 })).await;
        let head = before["ok"]["head"].as_i64().unwrap();
        let mut text = crate::tests_secret::TAVERNA.to_owned();
        for i in 0..3u64 {
            let w = call(
                &mut owner,
                20 + i * 2,
                "read_note",
                json!({ "path": "Taverna.md" }),
            )
            .await;
            text = text.replace("zqbody", "zqbody x");
            let r = call(
                &mut owner,
                21 + i * 2,
                "write_note",
                json!({ "path": "Taverna.md", "text": text, "revision": w["ok"]["revision"] }),
            )
            .await;
            assert!(r.get("ok").is_some(), "{r}");
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        }
        let w = call(&mut owner, 40, "read_note", json!({ "path": "Taverna.md" })).await;
        let public = text.replace("Fim.", "Fim, enfim.");
        let r = call(
            &mut owner,
            41,
            "write_note",
            json!({ "path": "Taverna.md", "text": public, "revision": w["ok"]["revision"] }),
        )
        .await;
        assert!(r.get("ok").is_some(), "{r}");
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        let after = ask(&mut reader, 3, "sync_changes", json!({ "since": head })).await;
        let seqs: Vec<i64> = after["ok"]["changes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["seq"].as_i64().unwrap())
            .collect();
        assert_eq!(seqs, vec![head + 1], "{after}");
        assert_eq!(after["ok"]["head"], json!(head + 1), "{after}");
        // The head a reader hears in `sync_state` is the same count, and
        // asking from it yields nothing more.
        let state = ask(&mut reader, 4, "sync_state", json!({})).await;
        assert_eq!(state["ok"]["head"], json!(head + 1), "{state}");
        let none = ask(&mut reader, 5, "sync_changes", json!({ "since": head + 1 })).await;
        assert_eq!(none["ok"]["changes"], json!([]), "{none}");
    });
}
