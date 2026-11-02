// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which sites play now, for the Mac and Linux (S10): the name the picker
//! gives the *Pages open in Verso* source (`Pages open in Verso:
//! open.spotify.com`), as Windows does from WebView2 (`windows_source.rs`).
//! Each page is a child web view (`web.rs`); its platform view is asked on
//! the main thread through `with_webview`, and the answer comes back by a
//! channel with a timeout.
//!
//! The answer is for naming only and fails closed: an error, a timeout or no
//! answer means "not playing" and never changes what is captured.

use std::sync::mpsc::{Sender, channel};
use std::time::Duration;

use tauri::Manager;
use tauri::webview::PlatformWebview;

use super::winpages::{self, PAGES_NAME};

/// How long one page may take to answer.
const ASK_TIMEOUT: Duration = Duration::from_secs(2);

/// How a platform tells whether a page plays now: sends `true` or `false`
/// on the sender, from the main thread (now or later), or sends nothing.
pub type Ask = fn(&PlatformWebview, Sender<bool>);

/// Each page open in `label`'s window as (playing now, host). Blocks, so it
/// must not run on the main thread.
fn pages_blocking<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    ask: Ask,
) -> Vec<(bool, String)> {
    let views: Vec<String> = crate::lock(&app.state::<crate::App>().web_views)
        .iter()
        .filter(|(_, owner)| owner.as_str() == label)
        .map(|(view, _)| view.clone())
        .collect();
    let mut out = Vec::new();
    for view in views {
        let Some(wv) = app.get_webview(&view) else {
            continue;
        };
        let host = wv
            .url()
            .map(|u| winpages::host_of(u.as_str()))
            .unwrap_or_default();
        let (tx, rx) = channel();
        let playing = wv.with_webview(move |pw| ask(&pw, tx)).is_ok()
            && rx.recv_timeout(ASK_TIMEOUT).unwrap_or(false);
        out.push((playing, host));
    }
    out
}

/// The source's name now: *Pages open in Verso*, and the sites that play.
/// The plain name when anything fails.
pub async fn source_name<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    ask: Ask,
) -> String {
    let (app, label) = (app.clone(), label.to_owned());
    tauri::async_runtime::spawn_blocking(move || pages_blocking(&app, &label, ask))
        .await
        .map_or_else(
            |_| PAGES_NAME.to_owned(),
            |pages| winpages::name_of(pages.iter().map(|(p, h)| (*p, h.as_str()))),
        )
}
