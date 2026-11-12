// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The picture of a web page (`web_snapshot`, ADR 0056, revision of
//! 2026-11-12): the window shows it in the page's place while an overlay is
//! open. The picture itself needs a real web engine, which the mock runtime
//! does not have (`docs/reference/manual-checks.md` lists what the app
//! shows on each system); here: a window asks only for its own pages, and a
//! view that gives no picture answers an error at once, never a wait, so
//! the window falls back to hiding the page.

use serde_json::json;
use tauri::Manager;

use super::tests::{app, call};
use super::*;

#[test]
fn a_window_asks_for_the_picture_of_its_own_pages_only() {
    let (app, main) = app();
    main.as_ref()
        .window()
        .add_child(
            tauri::webview::WebviewBuilder::new(
                "web-7",
                tauri::WebviewUrl::External("https://example.com".parse().unwrap()),
            ),
            tauri::LogicalPosition::new(0.0, 0.0),
            tauri::LogicalSize::new(10.0, 10.0),
        )
        .unwrap();
    let snapshot = |label: &str| call(&main, "web_snapshot", json!({ "label": label }));

    // Not a page of this window (nor of any): refused, nothing asked.
    let e = snapshot("web-7").unwrap_err();
    assert_eq!(e["kind"], "refused", "{e}");
    lock(&app.state::<App>().web_views).insert("web-7".to_owned(), "note-3".to_owned());
    let e = snapshot("web-7").unwrap_err();
    assert_eq!(e["kind"], "refused", "{e}");

    // Its own page: the mock's view draws nothing, which is an error, said
    // at once.
    lock(&app.state::<App>().web_views).insert("web-7".to_owned(), "main".to_owned());
    let started = std::time::Instant::now();
    let e = snapshot("web-7").unwrap_err();
    assert_eq!(e["kind"], "failed", "{e}");
    assert!(
        started.elapsed() < std::time::Duration::from_secs(1),
        "no picture is said at once, not after the wait: {:?}",
        started.elapsed()
    );
}

/// The command is one the app's own window may call: listed for the build
/// and allowed by the window's capability, or the real app answers "not
/// allowed" while every test passes.
#[test]
fn the_picture_is_allowed_to_the_window() {
    let build = include_str!("../build.rs");
    assert!(build.contains("\"web_snapshot\""));
    let capability = include_str!("../capabilities/default.json");
    assert!(capability.contains("\"allow-web-snapshot\""));
}
