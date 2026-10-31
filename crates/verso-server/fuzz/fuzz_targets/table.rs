// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: what any member of a table may send it (ADR 0107 item 12,
//! ADR 0083 item 14): a typed message, a dice look and an image's bytes,
//! and the request that carries them. The first byte picks which; the rest
//! is the input.
//!
//! A crash means a peer's bytes panic one of the readers; that a message
//! the table keeps is not plain text of at most 500 characters; that a dice
//! look it relays is anything but three looks of `#rrggbb` colours, a
//! texture and a material from the fixed lists, and a flag; that an image
//! is taken for a PNG, a JPEG, a WebP or a GIF without its first bytes
//! saying so; or that a table command is not bounded before it is parsed.
//! Seeds in `../seeds-table/`.
//! Run: `cargo +nightly fuzz run table fuzz/corpus/table fuzz/seeds-table`.

#![no_main]

use libfuzzer_sys::fuzz_target;
use serde_json::Value;
use verso_server::fuzz_api::{self, TABLE_MATERIALS, TABLE_TEXTURES};

fn is_colour(c: &Value) -> bool {
    c.as_str().is_some_and(|c| {
        c.len() == 7
            && c.starts_with('#')
            && c[1..]
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

fuzz_target!(|data: &[u8]| {
    let Some((pick, rest)) = data.split_first() else {
        return;
    };
    match pick % 4 {
        0 => {
            let text = String::from_utf8_lossy(rest);
            if let Ok(kept) = fuzz_api::table_message(&text) {
                assert!(
                    kept.chars().count() <= 500,
                    "a message is at most 500 characters"
                );
                assert!(!kept.is_empty(), "a message has some text");
                assert!(kept.trim() == kept, "a message is trimmed");
                assert!(
                    kept.chars().all(|c| !c.is_control() || c == '\n'),
                    "a message is plain text: {kept:?}"
                );
            }
        }
        1 => {
            let json = String::from_utf8_lossy(rest);
            if let Ok(look) = fuzz_api::table_look(&json) {
                let slots = look.as_object().expect("a look is an object");
                let names: Vec<&String> = slots.keys().collect();
                assert_eq!(names, ["1", "2", "3"], "three looks and nothing else");
                for style in slots.values() {
                    let style = style.as_object().expect("a style is an object");
                    for key in style.keys() {
                        assert!(
                            ["body", "number", "outline", "texture", "material", "app"]
                                .contains(&key.as_str()),
                            "a field beyond the form: {key}"
                        );
                    }
                    for key in ["body", "number", "outline"] {
                        assert!(is_colour(&style[key]), "{key}: {style:?}");
                    }
                    assert!(TABLE_TEXTURES.contains(&style["texture"].as_str().expect("text")));
                    assert!(TABLE_MATERIALS.contains(&style["material"].as_str().expect("text")));
                    assert!(
                        style
                            .get("app")
                            .is_none_or(|a| a.is_null() || a.is_boolean())
                    );
                }
            }
        }
        2 => {
            if let Some(kind) = fuzz_api::table_image(rest) {
                let ok = match kind {
                    "png" => rest.starts_with(b"\x89PNG\r\n\x1a\n"),
                    "jpg" => rest.starts_with(&[0xff, 0xd8, 0xff]),
                    "webp" => rest.len() >= 12 && &rest[..4] == b"RIFF" && &rest[8..12] == b"WEBP",
                    "gif" => rest.starts_with(b"GIF87a") || rest.starts_with(b"GIF89a"),
                    _ => false,
                };
                assert!(ok, "taken for a {kind} without saying so");
            }
        }
        _ => {
            let text = String::from_utf8_lossy(rest);
            let (most, table) = fuzz_api::table_command(&text);
            if text == "table_say" {
                assert!(
                    table && most <= 4096,
                    "a message is bounded before it is parsed"
                );
            }
            if text == "table_send_image" {
                assert!(table && most <= 16 * 1024 * 1024, "an image is bounded");
            }
            if let Some((_, cmd, _)) = fuzz_api::text_request(&text) {
                let (most, _) = fuzz_api::table_command(&cmd);
                assert!(most >= 1, "{cmd}");
            }
        }
    }
});
