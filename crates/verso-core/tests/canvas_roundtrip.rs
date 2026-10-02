// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The board's guardrail (ADR 0057, Consequences): a canvas in Obsidian's
//! layout, read and written with no change, comes out byte for byte; and
//! whatever tree Verso writes reads back as the same tree.

use proptest::prelude::*;
use verso_core::canvas::{Canvas, Json, Str};

fn tree() -> impl Strategy<Value = Json> {
    let leaf = prop_oneof![
        Just(Json::Null),
        any::<bool>().prop_map(Json::Bool),
        any::<i32>().prop_map(|n| Json::Number(n.to_string())),
        (-1.0e6f64..1.0e6).prop_map(|f| Json::Number(format!("{f}"))),
        any::<String>().prop_map(|s| Json::String(Str::new(s))),
    ];
    leaf.prop_recursive(5, 64, 6, |inner| {
        prop_oneof![
            prop::collection::vec(inner.clone(), 0..6).prop_map(Json::Array),
            prop::collection::vec((any::<String>(), inner), 0..6).prop_map(Json::Object),
        ]
    })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    #[test]
    fn written_reads_back_and_writes_the_same(root in tree(), newline in any::<bool>()) {
        let canvas = Canvas { root, trailing: if newline { "\n".into() } else { String::new() } };
        let text = canvas.write();
        let read = Canvas::parse(&text).unwrap();
        prop_assert_eq!(&read.root, &canvas.root);
        prop_assert_eq!(read.write(), text);
    }
}
