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
        let client = reqwest::Client::new();
        let res = client.get(r.url("/sw.js")).send().await.unwrap();
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
        assert!(
            csp.contains("script-src 'self' 'wasm-unsafe-eval';"),
            "{csp}"
        );
        assert!(csp.contains("worker-src 'self' blob:;"), "{csp}");
        assert!(csp.contains("default-src 'self';"), "{csp}");
        // The page that registers it has the same policy, so that the
        // registration is allowed and nothing wider.
        // The same connection's client, and a bound on the wait: a request
        // that stalled to the server's own deadline (a 408, which carries no
        // policy) failed once on a loaded Windows runner with nothing but a
        // missing header to show for it (CI of 2026-10-17); now it says so.
        let page = client
            .get(r.url("/"))
            .timeout(std::time::Duration::from_secs(90))
            .send()
            .await
            .unwrap();
        assert_eq!(page.status().as_u16(), 200, "{page:?}");
        let page_csp = page.headers()["content-security-policy"].to_str().unwrap();
        assert!(page_csp.contains("worker-src 'self' blob:;"), "{page_csp}");
        assert!(!page_csp.contains("worker-src *"), "{page_csp}");
    });
}

#[test]
fn the_windows_files_are_asked_about_each_time_unless_their_name_has_a_hash() {
    block_on(async {
        let r = start().await;
        let ui = r.server.config.ui_dir.clone();
        crate::data::ensure_dir(&ui.join("chunks")).unwrap();
        crate::data::write_for_tests(&ui.join("web.html"), "<!doctype html><title>V</title>");
        crate::data::write_for_tests(&ui.join("web.js"), "export {};");
        crate::data::write_for_tests(&ui.join("chunks/note-A1B2C3D4.js"), "export {};");
        let client = reqwest::Client::new();
        let get = |path: &'static str, tag: Option<String>| {
            let client = client.clone();
            let url = r.url(path);
            async move {
                let mut req = client.get(url);
                if let Some(tag) = tag {
                    req = req.header("if-none-match", tag);
                }
                req.send().await.unwrap()
            }
        };
        let cache = |res: &reqwest::Response| {
            res.headers()
                .get("cache-control")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
        };
        // The listing: kind of file, status, cache-control.
        let page = get("/", None).await;
        assert_eq!(cache(&page).as_deref(), Some("no-store"));
        let script = get("/web.js", None).await;
        assert_eq!(script.status().as_u16(), 200);
        assert_eq!(cache(&script).as_deref(), Some("no-cache"));
        let tag = script.headers()["etag"].to_str().unwrap().to_owned();
        let chunk = get("/chunks/note-A1B2C3D4.js", None).await;
        assert_eq!(
            cache(&chunk).as_deref(),
            Some("public, max-age=31536000, immutable")
        );
        assert!(chunk.headers().get("etag").is_none());
        // The same file, asked about again: nothing sent. Another tag: sent.
        let same = get("/web.js", Some(tag.clone())).await;
        assert_eq!(same.status().as_u16(), 304);
        assert_eq!(cache(&same).as_deref(), Some("no-cache"));
        assert_eq!(same.headers()["etag"].to_str().unwrap(), tag);
        assert_eq!(same.headers()["x-content-type-options"], "nosniff");
        assert!(same.bytes().await.unwrap().is_empty());
        let other = get("/web.js", Some("W/\"0-0-0\"".to_owned())).await;
        assert_eq!(other.status().as_u16(), 200);
        // A changed file (another size) is another validator.
        crate::data::write_for_tests(&ui.join("web.js"), "export const a = 1;");
        let changed = get("/web.js", Some(tag)).await;
        assert_eq!(changed.status().as_u16(), 200);
    });
}

#[test]
fn the_page_is_never_an_empty_404_when_its_file_cannot_be_read_for_a_moment() {
    block_on(async {
        let r = start().await;
        let ui = r.server.config.ui_dir.clone();
        crate::data::ensure_dir(&ui).unwrap();
        let page = ui.join("web.html");
        let client = reqwest::Client::new();
        // No file yet: a page that asks again, not a blank 404.
        let res = client.get(r.url("/")).send().await.unwrap();
        assert_eq!(res.status().as_u16(), 503, "{res:?}");
        assert_eq!(res.headers()["retry-after"], "2");
        assert!(res.text().await.unwrap().contains("refresh"));
        // Served once, then the file goes (a build replacing dist/): the last copy.
        crate::data::write_for_tests(&page, "<!doctype html><title>V1</title>");
        let res = client.get(r.url("/signin")).send().await.unwrap();
        assert_eq!(res.status().as_u16(), 200);
        crate::data::remove_for_tests(&page);
        let res = client.get(r.url("/signin")).send().await.unwrap();
        assert_eq!(res.status().as_u16(), 200);
        assert!(res.text().await.unwrap().contains("V1"));
    });
}
