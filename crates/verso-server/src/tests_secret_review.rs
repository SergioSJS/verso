// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Regression tests for the independent review of ADR 0087 item 4 (readers
//! never receive a secret block "or anything derived from it"), each one
//! a probe of the review turned permanent: the sizes, the counters, the
//! order and the flags a reader sees do not move with a secret block.

use std::path::Path;

use serde_json::json;

use crate::tests::{block_on, call};

/// `text` written to `path` as an editor outside the server writes it.
fn put_file(path: &std::path::Path, text: &str) {
    use std::io::Write;
    let dir = path.parent().unwrap();
    let mut f = tempfile::NamedTempFile::new_in(dir).unwrap();
    f.write_all(text.as_bytes()).unwrap();
    f.persist(path).unwrap();
}
use crate::tests_secret::{ask, folder_with_a_reader, listen};

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

#[test]
fn a_note_too_large_to_serve_a_reader_is_not_in_its_manifest() {
    // M2: past 16 MB a note is refused to a reader; its manifest and its
    // log must not tell it the whole file's size and hash instead.
    block_on(async {
        let (r, _owner, mut reader, id) = folder_with_a_reader().await;
        let body = format!(
            "# Grande\n\n> [!secret]\n> zqbig\n\n{}\n",
            "pub ".repeat(5_000_000)
        );
        put_file(&r.campanha().join("Grande.md"), &body);
        // The folder's walk finds it on a question; wait until it did.
        let mut recorded = false;
        for k in 0..10u64 {
            let state = ask(&mut reader, 2 + k * 2, "sync_state", json!({})).await;
            let files = state["ok"]["files"].as_array().unwrap().clone();
            assert!(
                !files.iter().any(|f| f["path"] == "Grande.md"),
                "a reader is told of a note it cannot read: {state}"
            );
            let log = ask(
                &mut reader,
                3 + k * 2,
                "sync_changes",
                json!({ "since": 0 }),
            )
            .await;
            let changes = log["ok"]["changes"].as_array().unwrap().clone();
            assert!(!changes.iter().any(|c| c["path"] == "Grande.md"), "{log}");
            recorded = r
                .server
                .db
                .manifest_paths(&id)
                .unwrap()
                .iter()
                .any(|p| p == "Grande.md");
            if recorded {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        }
        assert!(recorded, "the walk never recorded the large note");
    });
}

#[test]
fn an_edit_made_outside_the_server_inside_a_secret_block_is_not_stale_or_indexed_for_a_reader() {
    // M4: a reader's `stale` is the projection's, and the summary of a
    // reindex it asks counts nothing.
    block_on(async {
        let (r, mut owner, mut reader, _id) = folder_with_a_reader().await;
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        listen(&mut reader, 300).await;
        let before = ask(&mut reader, 2, "read_note", json!({ "path": "Taverna.md" })).await;
        let path = r.campanha().join("Taverna.md");
        // The whole text, as its owner reads it (the folder is read in data.rs only).
        let whole = call(&mut owner, 20, "read_note", json!({ "path": "Taverna.md" })).await;
        let text = whole["ok"]["text"]
            .as_str()
            .unwrap()
            .replace("zqbody", "zqbody segue");
        put_file(&path, &text);
        let after = ask(&mut reader, 3, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(before["ok"]["stale"], json!(false), "{before}");
        assert_eq!(after["ok"]["stale"], json!(false), "{after}");
        assert_eq!(before["ok"]["revision"], after["ok"]["revision"]);
        let re = ask(&mut reader, 4, "reindex", json!({})).await;
        assert_eq!(re["ok"]["indexed"], json!(0), "{re}");
        assert_eq!(re["ok"]["removed"], json!(0), "{re}");
        // A public edit made outside is still stale for the reader.
        let whole = call(&mut owner, 21, "read_note", json!({ "path": "Taverna.md" })).await;
        let text = whole["ok"]["text"]
            .as_str()
            .unwrap()
            .replace("Fim.", "Fim, enfim.");
        put_file(&path, &text);
        let public = ask(&mut reader, 5, "read_note", json!({ "path": "Taverna.md" })).await;
        assert_eq!(public["ok"]["stale"], json!(true), "{public}");
    });
}

/// A symlink inside the folder to a note, under a name that is no note's:
/// confinement keeps the name, the file system follows the link. On
/// Windows a symlink needs Developer Mode (ADR 0069), as the other tests
/// that make one.
#[test]
fn a_link_inside_the_folder_to_a_note_hands_a_reader_no_secret_block() {
    block_on(async {
        let (r, _owner, mut reader, id) = folder_with_a_reader().await;
        verso_fs::link_for_tests(Path::new("Taverna.md"), &r.campanha().join("espelho.txt"))
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        // Whatever the contract does with the name, no word only a secret
        // block holds comes back (`ask` checks every message).
        for (n, cmd) in ["read_file_text", "read_text", "read_note"]
            .into_iter()
            .enumerate()
        {
            ask(
                &mut reader,
                2 + n as u64,
                cmd,
                json!({ "path": "espelho.txt" }),
            )
            .await;
        }
        let le = crate::tests::sign_in(&r, "le@casa.lan", "senha muito longa").await;
        let res = reqwest::Client::new()
            .get(r.url(&format!("/f/{id}/espelho.txt")))
            .header("cookie", &le.cookie)
            .send()
            .await
            .unwrap();
        let body = res.text().await.unwrap();
        for word in crate::tests_secret::SECRET {
            assert!(
                !body.contains(word),
                "{word:?} reached a reader through /f/: {body}"
            );
        }
        ask(
            &mut reader,
            20,
            "sync_read",
            json!({ "path": "espelho.txt", "offset": 0 }),
        )
        .await;
        // Its size and hash in the manifest are the projection's too.
        let state = ask(&mut reader, 21, "sync_state", json!({})).await;
        let shown = verso_core::secret::project(crate::tests_secret::TAVERNA).len();
        let listed = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == "espelho.txt")
            .map(|f| f["size"].as_u64().unwrap());
        assert_eq!(listed, Some(shown as u64), "{state}");
    });
}
