// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A placeholder sync already has a copy of (ADR 0043, decided 2026-10-27,
//! item b): the provider sent the file back to the cloud after it crossed.
//! It is held apart like any placeholder — held at its base hash, so never
//! a deletion on the server nor a change sent up (item c), and a change
//! made to it elsewhere waits — but nothing is asked of the person: it is
//! counted apart from the files that wait for them.

use std::collections::BTreeMap;

use verso_contract::SyncRefused;

/// The reason a placeholder with a base is held apart under, inside a
/// pass. It never reaches the window as a refusal: [`split`] takes it out.
pub(super) const REASON: &str = "cloud_only";

/// The reason to hold `path` apart under: a placeholder whose path has a
/// base (`in_base`) is [`REASON`], any other reason stands.
pub(super) fn reason(reason: &str, in_base: bool) -> &str {
    if reason == "placeholder" && in_base {
        REASON
    } else {
        reason
    }
}

/// The files held apart, as the window gets them: those that wait for the
/// person, and the paths that are only in the cloud on this computer while
/// the server has them.
pub(super) fn split(apart: BTreeMap<String, SyncRefused>) -> (Vec<SyncRefused>, Vec<String>) {
    let (cloud, waiting): (Vec<_>, Vec<_>) = apart.into_values().partition(|f| f.reason == REASON);
    (waiting, cloud.into_iter().map(|f| f.path).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn held(path: &str, why: &str) -> (String, SyncRefused) {
        (
            path.to_owned(),
            SyncRefused {
                path: path.to_owned(),
                reason: why.to_owned(),
                message: String::new(),
            },
        )
    }

    #[test]
    fn only_a_placeholder_with_a_base_is_cloud_only() {
        assert_eq!(reason("placeholder", true), REASON);
        assert_eq!(reason("placeholder", false), "placeholder");
        assert_eq!(reason("failed", true), "failed");
        assert_eq!(reason("too_large", true), "too_large");
    }

    #[test]
    fn the_window_gets_cloud_only_apart_from_what_waits() {
        let apart: BTreeMap<_, _> = [
            held("a.md", REASON),
            held("b.md", "placeholder"),
            held("c.md", "failed"),
        ]
        .into_iter()
        .collect();
        let (waiting, cloud) = split(apart);
        assert_eq!(cloud, vec!["a.md".to_owned()]);
        let paths: Vec<&str> = waiting.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["b.md", "c.md"]);
    }
}
