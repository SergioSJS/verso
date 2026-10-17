// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A process of its own, as the app is: with no local server started, the
//! sync's `wss://` dial must reach the network, not panic for want of a
//! crypto provider (the maintainer's UniVerso, 2026-10-16: the sync sat on
//! "Conectando ao servidor…" while the host had panicked). Without
//! `install_crypto_provider` this test panics inside rustls.

#[test]
fn a_wss_dial_after_the_apps_crypto_setup_fails_on_the_network_not_in_rustls() {
    verso_server::install_crypto_provider();
    // Accepts and hangs up at once: the dial gets past TCP, so the TLS
    // client is made, and the handshake then fails on the closed socket.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        if let Ok((socket, _)) = listener.accept() {
            drop(socket);
        }
    });
    let dialed = tauri::async_runtime::block_on(tokio_tungstenite::connect_async(format!(
        "wss://127.0.0.1:{port}/sync"
    )));
    assert!(dialed.is_err(), "nothing speaks TLS there");
}
