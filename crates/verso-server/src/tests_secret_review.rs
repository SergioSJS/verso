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
