// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! ADR 0113 item 5, where the file goes (amended 2026-10-28): a new file a
//! player puts into a note or board they edit is made beside it, in the
//! person's attachments subfolder, as the game master's own paste is; it
//! takes the access of the file it was put into; a name taken by something
//! the player does not see gets the silent suffix; the chat keeps the
//! table's attachments place.

use base64::Engine;
use serde_json::{Value, json};

use crate::tests::block_on;
use crate::tests_campaign::{Mesa, mesa, strings};

/// A PNG whose bytes are its own (`tag`), so a test can name its file.
fn picture(tag: &str) -> String {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend_from_slice(tag.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn edit_for(who: &str) -> Value {
    json!({ "kind": "set", "set": { "whole": "none", "rows": [{ "account": who, "level": "edit" }] }, "secret_name": null })
}

/// A board of the game master's, and Ana's edit of it.
async fn board(m: &mut Mesa, path: &str, change: Value) {
    let made = m
        .owner
        .call(
            "create_file",
            json!({ "path": path, "base64": base64::engine::general_purpose::STANDARD.encode(r#"{"nodes":[],"edges":[]}"#) }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let walked = m.owner.call("reindex", json!({})).await;
    assert!(walked.get("ok").is_some(), "{walked}");
    let set = m
        .owner
        .call("access_set", json!({ "paths": [path], "change": change }))
        .await;
    assert!(set.get("ok").is_some(), "{set}");
}

async fn files(w: &mut crate::tests_campaign::Win) -> Vec<String> {
    strings(&w.call("list_files", json!({})).await["ok"])
}

#[test]
fn the_file_goes_beside_the_board_and_beside_the_note_and_the_subfolder_is_made() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        let set = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq/Cripta Zq.md"], "change": edit_for(&ana) }),
            )
            .await;
        assert!(set.get("ok").is_some(), "{set}");
        // Beside a board in a folder: its own `assets`, made on the spot.
        let one = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": picture("a"), "into": "Cofre/Mapa.canvas", "sub": "assets" }),
            )
            .await;
        let path = one["ok"].as_str().unwrap_or_default().to_owned();
        assert!(path.starts_with("Cofre/assets/mesa-"), "{one}");
        assert!(files(&mut m.owner).await.contains(&path));
        // Beside a note, in the subfolder the person names, nested.
        let two = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": picture("b"), "into": "Mundo Zq/Cripta Zq.md", "sub": "fotos/mesa" }),
            )
            .await;
        let path = two["ok"].as_str().unwrap_or_default();
        assert!(path.starts_with("Mundo Zq/fotos/mesa/mesa-"), "{two}");
        // A note at the folder's root: the subfolder is at the root.
        let set = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Livre.md"], "change": edit_for(&ana) }),
            )
            .await;
        assert!(set.get("ok").is_some(), "{set}");
        let three = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": picture("c"), "into": "Livre.md", "sub": "assets" }),
            )
            .await;
        assert!(
            three["ok"]
                .as_str()
                .unwrap_or_default()
                .starts_with("assets/mesa-"),
            "{three}"
        );
        // An old window that names none: `assets`.
        let old = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": picture("d"), "into": "Livre.md" }),
            )
            .await;
        assert!(
            old["ok"]
                .as_str()
                .unwrap_or_default()
                .starts_with("assets/mesa-"),
            "{old}"
        );
        // The chat keeps the table's own place.
        let given = m
            .owner
            .call(
                "table_rights_set",
                json!({ "root": "", "accounts": [ana], "right": "images", "on": true }),
            )
            .await;
        assert!(given.get("ok").is_some(), "{given}");
        let joined = m
            .ana
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let chat = m
            .ana
            .call("table_send_image", json!({ "base64": picture("e") }))
            .await;
        let image = chat["ok"]["image"].as_str().unwrap_or_default();
        assert!(image.starts_with("attachments/mesa-"), "{chat}");
    });
}

#[test]
fn a_subfolder_the_server_does_not_accept_is_assets() {
    for bad in [
        "../fora",
        "a/../b",
        "..",
        ".oculto",
        "a/.git",
        "/abs",
        "a\\b",
        "",
        "  ",
        "a//b",
        "a/b/c/d/e",
        "con:x",
        "x\u{7}",
    ] {
        assert_eq!(
            crate::table_image::clean_sub(Some(bad)),
            "assets",
            "{bad:?}"
        );
    }
    assert_eq!(crate::table_image::clean_sub(None), "assets");
    assert_eq!(crate::table_image::clean_sub(Some("fotos/")), "fotos");
    // NFC: a decomposed é is the composed one.
    assert_eq!(
        crate::table_image::clean_sub(Some("imagens e\u{301}picas")),
        "imagens \u{e9}picas"
    );
    assert_eq!(
        crate::table_image::clean_sub(Some(&"x".repeat(500))),
        "assets"
    );
}

#[test]
fn a_dot_dot_never_leaves_the_notes_folder() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        for sub in ["../../fora", "../fora", "a/../../b"] {
            let made = m
                .ana
                .call(
                    "table_attach",
                    json!({ "base64": picture("f"), "into": "Cofre/Mapa.canvas", "sub": sub }),
                )
                .await;
            let path = made["ok"].as_str().unwrap_or_default();
            assert!(path.starts_with("Cofre/assets/mesa-"), "{sub}: {made}");
        }
        // The file one edits is the one judged: a path out of the folder is refused.
        let no = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": picture("g"), "into": "../Mapa.canvas", "sub": "assets" }),
            )
            .await;
        assert!(no.get("err").is_some(), "{no}");
    });
}

#[test]
fn a_name_taken_by_a_hidden_file_gets_the_suffix_and_the_answer_does_not_say_which() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        let secret = m
            .owner
            .call(
                "create_file",
                json!({ "path": "Cofre/assets/zqsegredo.png", "base64": picture("s") }),
            )
            .await;
        assert!(secret.get("ok").is_some(), "{secret}");
        let walked = m.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let data = picture("clash");
        crate::table_image::NAMES
            .lock()
            .unwrap()
            .push((data.clone(), "zqsegredo.png".to_owned()));
        assert!(
            !files(&mut m.ana)
                .await
                .iter()
                .any(|f| f.contains("zqsegredo"))
        );
        let made = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": data, "into": "Cofre/Mapa.canvas", "sub": "assets" }),
            )
            .await;
        let path = made["ok"].as_str().unwrap_or_default();
        assert_eq!(path, "Cofre/assets/zqsegredo 2.png", "{made}");
        assert!(!made.to_string().contains("exists"), "{made}");
        // The hidden file is untouched and still hidden.
        let all = files(&mut m.owner).await;
        assert!(
            all.contains(&"Cofre/assets/zqsegredo.png".to_owned()),
            "{all:?}"
        );
        assert!(
            all.contains(&"Cofre/assets/zqsegredo 2.png".to_owned()),
            "{all:?}"
        );
    });
}

#[test]
fn the_new_file_has_the_access_of_the_board_it_was_put_into() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        // A folder hidden from everyone, the board an exception inside it:
        // Ana edits it; Bia does not see it.
        let hide =
            json!({ "kind": "set", "set": { "whole": "none", "rows": [] }, "secret_name": null });
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": "Cofre/assets/velho.png", "base64": picture("v") }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        let set = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Cofre/assets"], "change": hide }),
            )
            .await;
        assert!(set.get("ok").is_some(), "{set}");
        let made = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": picture("h"), "into": "Cofre/Mapa.canvas", "sub": "assets" }),
            )
            .await;
        let path = made["ok"].as_str().unwrap_or_default().to_owned();
        assert!(path.starts_with("Cofre/assets/mesa-"), "{made}");
        assert!(
            files(&mut m.ana).await.contains(&path),
            "Ana sees the image of her board"
        );
        assert!(files(&mut m.owner).await.contains(&path));
        let bia = files(&mut m.bia).await;
        assert!(
            !bia.iter().any(|f| f.starts_with("Cofre/")),
            "Bia sees nothing of it: {bia:?}"
        );
        // Bia is given the board: the image of a later paste is hers too, and
        // an image she could not see before stays as it was.
        let bia_id = m.bia_id.clone();
        let see = json!({ "kind": "set", "set": { "whole": "none", "rows": [
            { "account": ana, "level": "edit" }, { "account": bia_id, "level": "see" }] }, "secret_name": null });
        let set = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Cofre/Mapa.canvas"], "change": see }),
            )
            .await;
        assert!(set.get("ok").is_some(), "{set}");
        let again = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": picture("i"), "into": "Cofre/Mapa.canvas", "sub": "assets" }),
            )
            .await;
        let second = again["ok"].as_str().unwrap_or_default().to_owned();
        let bia = files(&mut m.bia).await;
        assert!(bia.contains(&second), "{bia:?}");
        assert!(!bia.contains(&path), "{bia:?}");
        assert!(
            !bia.contains(&"Cofre/assets/velho.png".to_owned()),
            "{bia:?}"
        );
    });
}
