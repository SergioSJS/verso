// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the server does for the window kept offline in a browser (ADR 0092):
//! it serves the service worker, and nothing else is new — the folders kept
//! sync by the commands a device's sync uses (`tests_sync`), over a browser's
//! session, and a reader's bytes are the projection (`tests_secret`).

use crate::tests::{block_on, start};

#[test]
fn the_service_worker_is_the_servers_own_file_never_kept_by_the_browsers_cache() {
    block_on(async {
        let r = start().await;
        crate::data::ensure_dir(&r.server.config.ui_dir).unwrap();
        crate::data::write_for_tests(
            &r.server.config.ui_dir.join("web.html"),
            "<!doctype html><title>Verso</title>",
        );
        crate::data::write_for_tests(
            &r.server.config.ui_dir.join("sw.js"),
            "self.addEventListener('fetch', () => {});",
        );
        let res = reqwest::Client::new()
            .get(r.url("/sw.js"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let header = |name: &str| {
            res.headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default()
                .to_owned()
        };
        // A script, and one the browser asks the server about each time: a
        // new build of the window is a new worker.
        assert!(header("content-type").contains("javascript"), "{res:?}");
        assert_eq!(header("cache-control"), "no-store");
        // Under the window's strict policy: scripts and connections from the
        // server only, workers from it (and blobs), nothing else.
        let csp = header("content-security-policy");
        assert!(csp.contains("script-src 'self';"), "{csp}");
        assert!(csp.contains("worker-src 'self' blob:;"), "{csp}");
        assert!(csp.contains("default-src 'self';"), "{csp}");
        // The page that registers it has the same policy, so that the
        // registration is allowed and nothing wider.
        let page = reqwest::Client::new().get(r.url("/")).send().await.unwrap();
        let page_csp = page.headers()["content-security-policy"].to_str().unwrap();
        assert!(page_csp.contains("worker-src 'self' blob:;"), "{page_csp}");
        assert!(!page_csp.contains("worker-src *"), "{page_csp}");
    });
}
