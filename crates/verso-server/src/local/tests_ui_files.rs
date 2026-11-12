// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A phone's app serves the window's files from inside itself (ADR 0118
//! item 7, decided 2026-11-12): the page, a file by its path, and the page
//! again for a route of the window, with no directory of them.

use std::sync::Arc;

use super::tests::{lab, run};
use crate::ui_files::UiFiles;

#[test]
fn the_window_is_served_from_memory_when_the_app_hands_its_files() {
    run(async {
        let mut lab = lab();
        lab.local
            .serve_ui_from(UiFiles(Arc::new(|path: &str| match path {
                "web.html" => Some(b"<!doctype html><title>From memory</title>".to_vec()),
                "chunks/app.js" => Some(b"export{}".to_vec()),
                _ => None,
            })));
        lab.serve();
        for (path, kind, body) in [
            ("/", "text/html; charset=utf-8", "From memory"),
            (
                "/chunks/app.js",
                "text/javascript; charset=utf-8",
                "export{}",
            ),
            (
                "/a/route/of/the/window",
                "text/html; charset=utf-8",
                "From memory",
            ),
        ] {
            let res = lab.client.get(lab.url(path)).send().await.unwrap();
            assert_eq!(res.status().as_u16(), 200, "{path}");
            assert_eq!(res.headers()["content-type"], kind, "{path}");
            assert!(res.text().await.unwrap().contains(body), "{path}");
        }
    });
}
