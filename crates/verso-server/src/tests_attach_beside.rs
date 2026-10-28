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

/// A file of the game master's that only Ana sees, so that its folder is
/// one she sees too.
async fn shown_to_ana(m: &mut Mesa, path: &str, tag: &str) {
    hidden_file(m, path, tag).await;
    let ana = m.ana_id.clone();
    let see = json!({ "kind": "set", "set": { "whole": "none", "rows": [{ "account": ana, "level": "see" }] }, "secret_name": null });
    let set = m
        .owner
        .call("access_set", json!({ "paths": [path], "change": see }))
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
        shown_to_ana(&mut m, "Cofre/assets/vista.png", "vis").await;
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
        shown_to_ana(&mut m, "Cofre/assets/vista.png", "vis").await;
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

async fn attach(m: &mut Mesa, tag: &str, into: &str, sub: &str) -> Value {
    m.ana
        .call(
            "table_attach",
            json!({ "base64": picture(tag), "into": into, "sub": sub }),
        )
        .await
}

fn made(v: &Value) -> String {
    v["ok"].as_str().unwrap_or_default().to_owned()
}

async fn hidden_file(m: &mut Mesa, path: &str, tag: &str) {
    let r = m
        .owner
        .call(
            "create_file",
            json!({ "path": path, "base64": picture(tag) }),
        )
        .await;
    assert!(r.get("ok").is_some(), "{r}");
    let walked = m.owner.call("reindex", json!({})).await;
    assert!(walked.get("ok").is_some(), "{walked}");
}

/// The subfolder is the person's to name, not an oracle for what they do not
/// see: a name that is, twins or sits under something hidden falls back
/// (beside the file in `assets`, else the table's attachments place), and no
/// answer names the hidden thing.
#[test]
fn a_subfolder_that_meets_something_hidden_falls_back_and_tells_nothing() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        // A hidden folder twin by case, a hidden folder twin by Unicode form,
        // a hidden file used as a folder, a hidden folder of the exact name.
        hidden_file(&mut m, "Cofre/assets/velho.png", "h1").await;
        hidden_file(&mut m, "Cofre/cafe\u{301}2/x.png", "h2").await;
        hidden_file(&mut m, "Cofre/Mapa2.canvas.bak", "h3").await;
        hidden_file(&mut m, "Cofre/Quarto/x.png", "h4").await;
        hidden_file(&mut m, "Cofre/Lista", "h5").await;
        for (tag, sub) in [
            ("q1", "ASSETS"),
            ("q2", "assets"),
            ("q3", "café2"),
            ("q4", "quarto"),
            ("q5", "Quarto"),
            ("q6", "Lista"),
            ("q7", "Quarto/fotos"),
        ] {
            let r = attach(&mut m, tag, "Cofre/Mapa.canvas", sub).await;
            let used = made(&r);
            // `assets` is itself hidden: the table's attachments place.
            assert!(used.starts_with("attachments/mesa-"), "{sub}: {r}");
            for secret in [
                "velho", "Quarto", "quarto", "café", "cafe", "Lista", "exists", "twin",
            ] {
                assert!(!r.to_string().contains(secret), "{sub}: {secret} in {r}");
            }
        }
        // Only `assets` hidden away from the one asked: `assets` beside the
        // file is the second try; here it is hidden, so a hidden `Quarto`
        // asked for alone also ends in the table's place (checked above). With
        // a visible `assets` the fall back is beside the file.
        hidden_file(&mut m, "Cofre2/Mapa.canvas", "h6").await;
        let set = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Cofre2/Mapa.canvas"], "change": edit_for(&ana) }),
            )
            .await;
        assert!(set.get("ok").is_some(), "{set}");
        hidden_file(&mut m, "Cofre2/Quarto/x.png", "h7").await;
        let r = attach(&mut m, "q8", "Cofre2/Mapa.canvas", "quarto").await;
        assert!(made(&r).starts_with("Cofre2/assets/mesa-"), "{r}");
    });
}

#[test]
fn with_nothing_hidden_the_names_asked_for_are_used() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        // Nothing hidden: the names asked for are used, as asked.
        for (tag, sub) in [
            ("p1", "ASSETS"),
            ("p2", "cafe\u{301}"),
            ("p3", "Mapa2.canvas"),
        ] {
            let r = attach(&mut m, tag, "Cofre/Mapa.canvas", sub).await;
            let want: String = sub.chars().collect::<String>();
            let used = made(&r);
            assert!(
                used.starts_with("Cofre/")
                    && used.contains("/mesa-")
                    && !used.starts_with("Cofre/assets/"),
                "{want}: {r}"
            );
        }
    });
}

#[test]
fn a_subfolder_that_is_another_table_or_a_gm_only_folder_falls_back() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        // A folder the player sees nothing in: the game master's.
        hidden_file(&mut m, "Cofre/Mestre/notas.png", "g1").await;
        let r = attach(&mut m, "g2", "Cofre/Mapa.canvas", "Mestre").await;
        assert!(made(&r).starts_with("Cofre/assets/mesa-"), "{r}");
        // A table of its own inside the folder is another table.
        hidden_file(&mut m, "Cofre/Outra/n.png", "g3").await;
        let t = m
            .owner
            .call("campaign_make", json!({ "root": "Cofre/Outra" }))
            .await;
        assert!(t.get("ok").is_some(), "{t}");
        let r = attach(&mut m, "g4", "Cofre/Mapa.canvas", "Outra").await;
        assert!(made(&r).starts_with("Cofre/assets/mesa-"), "{r}");
    });
}

#[test]
fn an_absent_file_or_a_folder_is_told_as_a_file_one_may_not_touch() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        let hidden = attach(&mut m, "n0", "Barão Zq.md", "assets").await;
        assert!(hidden.get("err").is_some(), "{hidden}");
        for into in ["Cofre", "Cofre/Nada.canvas", "Nada.md"] {
            let r = attach(&mut m, "n1", into, "assets").await;
            assert_eq!(r["err"], hidden["err"], "{into}: {r}");
        }
    });
}

#[test]
fn a_path_that_exists_keeps_its_set_and_the_create_fails_with_one_message() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        board(&mut m, "Cofre/Mapa.canvas", edit_for(&ana)).await;
        hidden_file(&mut m, "Cofre/assets/vista.png", "e1").await;
        let see = json!({ "kind": "set", "set": { "whole": "none", "rows": [{ "account": ana, "level": "see" }] }, "secret_name": null });
        let set = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Cofre/assets/vista.png"], "change": see }),
            )
            .await;
        assert!(set.get("ok").is_some(), "{set}");
        let before = m
            .owner
            .call("access_get", json!({ "paths": ["Cofre/assets/vista.png"] }))
            .await;
        let data = picture("e2");
        crate::table_image::NAMES
            .lock()
            .unwrap()
            .push((data.clone(), "vista.png".to_owned()));
        let r = m
            .ana
            .call(
                "table_attach",
                json!({ "base64": data, "into": "Cofre/Mapa.canvas", "sub": "assets" }),
            )
            .await;
        assert_eq!(r["err"]["message"], "the file could not be saved", "{r}");
        let after = m
            .owner
            .call("access_get", json!({ "paths": ["Cofre/assets/vista.png"] }))
            .await;
        assert_eq!(before["ok"], after["ok"], "its set was not touched");
    });
}
