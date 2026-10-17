// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A base's map on a UniVerso (ADR 0094 item 10): the window fetches the
//! tiles from the origins the person approved, and the server's content
//! security policy lets it reach those and no other; the server itself
//! never fetches a tile.

use std::time::Duration;

use serde_json::json;

use crate::tests::{block_on, call, connect, folder_id, next, put, sign_in, start};

/// The page's and the map worker's `connect-src`, as the server sends it
/// to `cookie` (none: a visitor).
async fn connect_src(
    r: &crate::tests::Running,
    path: &str,
    cookie: Option<&str>,
) -> (String, Option<String>) {
    let mut req = reqwest::Client::new().get(r.url(path));
    if let Some(c) = cookie {
        req = req.header("cookie", c);
    }
    let res = req.send().await.unwrap();
    assert_eq!(res.status().as_u16(), 200, "{path}");
    let csp = res.headers()["content-security-policy"]
        .to_str()
        .unwrap()
        .to_owned();
    let cache = res
        .headers()
        .get("cache-control")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let connect = csp
        .split(';')
        .map(str::trim)
        .find(|d| d.starts_with("connect-src"))
        .unwrap_or_default()
        .to_owned();
    (connect, cache)
}

#[test]
fn the_page_lets_the_window_reach_only_the_approved_tile_origins() {
    block_on(async {
        let r = start().await;
        crate::data::ensure_dir(&r.server.config.ui_dir).unwrap();
        crate::data::write_for_tests(
            &r.server.config.ui_dir.join("web.html"),
            "<!doctype html><title>Verso</title>",
        );
        crate::data::write_for_tests(
            &r.server.config.ui_dir.join("maplibre-worker.mjs"),
            "export {};",
        );
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        // Approved in Settings, with what a hand-edited settings file could
        // hold: a policy's syntax, a wildcard, a path, another scheme.
        let settings = json!({
            "mapTileOrigins": [
                "https://tiles.openfreemap.org",
                "http://192.168.0.7:8080",
                "https://evil.example; script-src *",
                "*",
                "https://a.example/tiles",
                "data:",
                "https://'self'",
                "javascript://x",
            ]
        });
        let (status, _) = put(
            &r,
            "/api/me/settings",
            json!({ "settings": settings.to_string() }),
            &admin,
        )
        .await;
        assert_eq!(status, 200);
        for path in ["/", "/maplibre-worker.mjs"] {
            let (connect, cache) = connect_src(&r, path, Some(&admin.cookie)).await;
            assert!(
                connect.contains(" https://tiles.openfreemap.org"),
                "{path}: {connect}"
            );
            assert!(
                connect.contains(" http://192.168.0.7:8080"),
                "{path}: {connect}"
            );
            for refused in [
                "evil",
                "*",
                "a.example",
                "data:",
                "javascript",
                "'self' 'self'",
                "https://'self'",
            ] {
                assert!(!connect.contains(refused), "{path}: {refused} in {connect}");
            }
            // Never kept by the browser: the next load reads the policy anew.
            assert_eq!(cache.as_deref(), Some("no-store"), "{path}");
        }
        // A visitor, and a person who approved nothing, reach no origin.
        let (connect, _) = connect_src(&r, "/", None).await;
        assert!(!connect.contains("openfreemap"), "{connect}");
        let (status, _) = put(&r, "/api/me/settings", json!({ "settings": "{}" }), &admin).await;
        assert_eq!(status, 200);
        let (connect, _) = connect_src(&r, "/", Some(&admin.cookie)).await;
        assert!(!connect.contains("openfreemap"), "{connect}");
    });
}

#[test]
fn a_map_never_makes_the_server_fetch_a_tile() {
    block_on(async {
        // A tile server, listening: anything the server asked of it would
        // arrive here.
        let tiles = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        tiles.set_nonblocking(true).unwrap();
        let at = format!("http://127.0.0.1:{}", tiles.local_addr().unwrap().port());
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let settings =
            json!({ "mapTileOrigins": [at], "mapTiles": format!("{at}/{{z}}/{{x}}/{{y}}.png") });
        put(
            &r,
            "/api/me/settings",
            json!({ "settings": settings.to_string() }),
            &admin,
        )
        .await;
        let id = folder_id(&r, &admin).await;
        let mut w = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut w).await;
        call(&mut w, 1, "open_server_folder", json!({ "id": id })).await;
        let made = call(
            &mut w,
            2,
            "create_note",
            json!({ "name": "Paris", "text": "---\ncoordinates: \"48.8566, 2.3522\"\n---\n" }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
        let text = format!(
            "views:\n  - type: map\n    name: M\n    coordinates: note.coordinates\n    mapTiles: {at}/{{z}}/{{x}}/{{y}}.png\n"
        );
        let base = call(
            &mut w,
            3,
            "query_base",
            json!({ "query": { "path": null, "text": text, "this": null, "view": null,
                "extra": ["note.coordinates"], "now": 0, "offset": 0, "lang": "pt" } }),
        )
        .await;
        assert!(base["ok"]["total"].as_u64().unwrap() >= 1, "{base}");
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert!(
            matches!(tiles.accept(), Err(e) if e.kind() == std::io::ErrorKind::WouldBlock),
            "the server asked the tile server for something"
        );
    });
}
