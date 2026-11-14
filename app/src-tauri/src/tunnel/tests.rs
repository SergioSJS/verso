// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The app's side of the link: what the window is told. The tunnel itself
//! is tested in `crates/verso-tunnel` (a fake `cloudflared`, no network).

use super::*;

#[test]
fn the_window_is_told_the_download_and_the_ceiling_in_seconds() {
    let view = LinkView {
        state: LinkState::Starting,
        origin: None,
        until_ms: Some(1_700_000_123_456),
        own: false,
        ended: None,
        protocol: None,
        download: Some((2000, Some(10_000))),
    };
    let told = contract(&view);
    assert_eq!(
        told.download,
        Some(verso_contract::LocalLinkDownload {
            done: 2000,
            total: Some(10_000)
        })
    );
    assert_eq!(told.until, Some(1_700_000_123));
    assert!(told.qr.is_empty(), "no QR with no origin");
    let on = LinkView {
        state: LinkState::On,
        origin: Some("https://abstract-simpson-player-passes.trycloudflare.com".to_owned()),
        until_ms: None,
        own: true,
        ended: None,
        protocol: Some("quic".to_owned()),
        download: None,
    };
    let told = contract(&on);
    assert!(told.own && !told.qr.is_empty());
    assert_eq!(told.protocol.as_deref(), Some("quic"));
}
