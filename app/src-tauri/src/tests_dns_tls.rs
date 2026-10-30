// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The TLS name stays the URL's when the DNS gives the address (ADR 0097):
//! a server whose certificate is for `pretend.test`, reached at 127.0.0.1
//! because the (pretended) system DNS says so, is verified for the name the
//! URL has — it connects under that name and fails under any other — over
//! HTTP and over the WebSocket's dial.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Arc;
use std::time::Duration;

use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::{ClientConfig, RootCertStore, ServerConfig, ServerConnection, StreamOwned};

use crate::dns::{self, SendRetrying};
use crate::remote;
use verso_service::lock;

fn ring() -> Arc<rustls::crypto::CryptoProvider> {
    Arc::new(rustls::crypto::ring::default_provider())
}

/// A certificate for `name`, made now: (DER, PEM, the server's config).
fn certificate(name: &str) -> (CertificateDer<'static>, String, Arc<ServerConfig>) {
    let made = rcgen::generate_simple_self_signed(vec![name.to_owned()]).unwrap();
    let der = made.cert.der().clone();
    let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(made.signing_key.serialize_der()));
    let config = ServerConfig::builder_with_provider(ring())
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(vec![der.clone()], key)
        .unwrap();
    (der, made.cert.pem(), Arc::new(config))
}

/// Serve one TLS connection with `config`: an HTTP answer, or the
/// WebSocket handshake. A client that refuses the certificate ends it.
fn serve_once(
    listener: TcpListener,
    config: Arc<ServerConfig>,
    websocket: bool,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let Ok((tcp, _)) = listener.accept() else {
            return;
        };
        // Never reads forever: a client that gave up (a refused certificate)
        // must not hang the run (seen on Windows, 2026-10-26).
        let _ = tcp.set_read_timeout(Some(Duration::from_secs(20)));
        let _ = tcp.set_write_timeout(Some(Duration::from_secs(20)));
        let Ok(conn) = ServerConnection::new(config) else {
            return;
        };
        let mut tls = StreamOwned::new(conn, tcp);
        if websocket {
            let _ = tokio_tungstenite::tungstenite::accept(tls);
        } else {
            let mut seen = [0_u8; 1024];
            if tls.read(&mut seen).is_ok() {
                let _ = tls.write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
                );
                let _ = tls.flush();
            }
        }
    })
}

#[test]
fn the_certificate_is_checked_for_the_urls_name_not_for_the_address() {
    let (_, pem, config) = certificate("pretend.test");
    lock(&remote::TEST_ROOT).push(pem.into_bytes());
    dns::pretend_system("pretend.test", vec!["127.0.0.1".parse().unwrap()]);
    dns::pretend_system("other.test", vec!["127.0.0.1".parse().unwrap()]);

    // The name the certificate is for: connects, at the address the DNS gave.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = serve_once(listener, Arc::clone(&config), false);
    let client = remote::http().unwrap();
    let response = client
        .get(format!("https://pretend.test:{port}/"))
        .send_retrying()
        .unwrap();
    assert_eq!(
        response
            .remote_addr()
            .map(|a| a.ip().to_string())
            .as_deref(),
        Some("127.0.0.1")
    );
    assert_eq!(response.text().unwrap(), "ok");
    server.join().unwrap();

    // The same server under another name that the DNS also sends to
    // 127.0.0.1: the certificate is not for that name, so it does not
    // connect — the IP does not stand in for the name.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = serve_once(listener, config, false);
    let e = client
        .get(format!("https://other.test:{port}/"))
        .send()
        .unwrap_err();
    assert!(e.is_connect(), "{e}");
    // A certificate that is not for the name fails the handshake, not the
    // TCP connection: the other address is still worth trying.
    assert!(!dns::tcp_level(&e));
    release(port, server);
}

/// Wait for a one-shot server whose client may never have reached it: a
/// connection of our own, closed at once, ends a wait in `accept` (the run
/// hung there on Windows, 2026-10-30, only among the other tests), and a
/// server already done finds nobody listening.
fn release(port: u16, server: std::thread::JoinHandle<()>) {
    drop(std::net::TcpStream::connect(("127.0.0.1", port)));
    let _ = server.join();
}

/// A server on `listener` that answers with `reply` whatever it is asked,
/// over TLS with `config`, or in the clear with none.
fn serve_raw(
    listener: TcpListener,
    config: Option<Arc<ServerConfig>>,
    reply: Vec<u8>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let Ok((tcp, _)) = listener.accept() else {
            return;
        };
        let mut seen = [0_u8; 2048];
        match config {
            Some(config) => {
                let Ok(conn) = ServerConnection::new(config) else {
                    return;
                };
                let mut tls = StreamOwned::new(conn, tcp);
                if tls.read(&mut seen).is_ok() {
                    let _ = tls.write_all(&reply);
                    let _ = tls.flush();
                }
            }
            None => {
                let mut tcp = tcp;
                if tcp.read(&mut seen).is_ok() {
                    let _ = tcp.write_all(&reply);
                    let _ = tcp.flush();
                }
            }
        }
    })
}

fn trusting(der: CertificateDer<'static>) -> tokio_tungstenite::Connector {
    let mut roots = RootCertStore::empty();
    roots.add(der).unwrap();
    tokio_tungstenite::Connector::Rustls(Arc::new(
        ClientConfig::builder_with_provider(ring())
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    ))
}

/// What the server writes for a 401: its sync header, then JSON — with the
/// body held back in the test that wants it late (see `late`).
fn servers_401() -> Vec<u8> {
    let body = r#"{"error":"unauthorized","message":"sign in again"}"#;
    format!("HTTP/1.1 401 Unauthorized\r\nx-verso-sync: 2\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes()
}

/// A NAS or a router whose API answers 401 with JSON that has an `error`
/// too, but not the server's header.
fn lookalike_401() -> Vec<u8> {
    let body = r#"{"error":"unauthorized"}"#;
    format!("HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes()
}

/// What a router's login page writes for a 401: basic auth, HTML.
fn routers_401() -> Vec<u8> {
    let body = "<h1>Login please</h1>";
    format!("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"router\"\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes()
}

fn request(
    scheme: &str,
    host: &str,
    port: u16,
) -> tokio_tungstenite::tungstenite::handshake::client::Request {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    format!("{scheme}://{host}:{port}/api/ws")
        .into_client_request()
        .unwrap()
}

/// `remote::ws_open` is what `dial_hello` calls: the same per-address dial
/// and the same mapping of errors, with the tests' own certificate trusted.
#[test]
fn the_websockets_open_verifies_the_urls_name_and_maps_a_401_only_when_it_is_the_servers() {
    tauri::async_runtime::block_on(ws_open_cases());
}

async fn ws_open_cases() {
    use verso_contract::ErrorKind;
    let (der, _, config) = certificate("pretend.test");
    dns::pretend_system("pretend.test", vec!["127.0.0.1".parse().unwrap()]);
    dns::pretend_system("other.test", vec!["127.0.0.1".parse().unwrap()]);
    dns::pretend_system("router.test", vec!["127.0.0.1".parse().unwrap()]);
    let bind = || {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        (l, port)
    };

    // The name the certificate is for: opens, at the address the DNS gave.
    let (l, port) = bind();
    let server = serve_once(l, Arc::clone(&config), true);
    let opened = remote::ws_open(
        "https://pretend.test",
        "pretend.test",
        port,
        request("wss", "pretend.test", port),
        Some(trusting(der.clone())),
    )
    .await;
    assert!(opened.is_ok(), "{:?}", opened.err().map(|e| e.message));
    server.join().unwrap();

    // The same server under another name sent to the same address: the
    // certificate is not for that name, so it is out of reach.
    let (l, port) = bind();
    let server = serve_once(l, Arc::clone(&config), true);
    let wrong = remote::ws_open(
        "https://other.test",
        "other.test",
        port,
        request("wss", "other.test", port),
        Some(trusting(der.clone())),
    )
    .await;
    assert_eq!(wrong.err().map(|e| e.kind), Some(ErrorKind::Unreachable));
    release(port, server);

    // The server's own 401 over wss: "sign in again", the dial ends.
    let (l, port) = bind();
    let server = serve_raw(l, Some(Arc::clone(&config)), servers_401());
    let refused = remote::ws_open(
        "https://pretend.test",
        "pretend.test",
        port,
        request("wss", "pretend.test", port),
        Some(trusting(der.clone())),
    )
    .await;
    assert_eq!(refused.err().map(|e| e.kind), Some(ErrorKind::Refused));
    release(port, server);

    // Over ws://, the JSON the server writes is the server's 401 …
    let (l, port) = bind();
    let server = serve_raw(l, None, servers_401());
    let refused = remote::ws_open(
        "http://pretend.test",
        "pretend.test",
        port,
        request("ws", "pretend.test", port),
        None,
    )
    .await;
    assert_eq!(refused.err().map(|e| e.kind), Some(ErrorKind::Refused));
    release(port, server);

    // … but a router's basic-auth page is not: no "sign in again", and the
    // address is passed over, not remembered.
    let (l, port) = bind();
    let server = serve_raw(l, None, routers_401());
    let router = remote::ws_open(
        "http://router.test",
        "router.test",
        port,
        request("ws", "router.test", port),
        None,
    )
    .await;
    assert_ne!(router.err().map(|e| e.kind), Some(ErrorKind::Refused));
    release(port, server);

    // … nor is a JSON 401 from something else that happens to say `error`.
    let (l, port) = bind();
    let server = serve_raw(l, None, lookalike_401());
    let nas = remote::ws_open(
        "http://router.test",
        "router.test",
        port,
        request("ws", "router.test", port),
        None,
    )
    .await;
    assert_ne!(nas.err().map(|e| e.kind), Some(ErrorKind::Refused));
    release(port, server);

    // The server's 401 is known by its header even when the body has not
    // arrived by the time the headers are read.
    let (l, port) = bind();
    let server = std::thread::spawn(move || {
        let (mut tcp, _) = l.accept().unwrap();
        let mut seen = [0_u8; 2048];
        let _ = tcp.read(&mut seen);
        let head = b"HTTP/1.1 401 Unauthorized\r\nx-verso-sync: 2\r\nContent-Type: application/json\r\nContent-Length: 49\r\nConnection: close\r\n\r\n";
        tcp.write_all(head).unwrap();
        tcp.flush().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let _ = tcp.write_all(br#"{"error":"unauthorized","message":"sign in again"}"#);
    });
    let late = remote::ws_open(
        "http://pretend.test",
        "pretend.test",
        port,
        request("ws", "pretend.test", port),
        None,
    )
    .await;
    assert_eq!(late.err().map(|e| e.kind), Some(ErrorKind::Refused));
    release(port, server);
}

/// A TLS handshake that fails at the first address (a certificate for another
/// name, as a router's page on 443 would have) is sent again, now with the
/// other address first; without the second try the request stays failed.
#[test]
fn a_request_whose_first_address_fails_the_handshake_is_sent_again_to_the_next() {
    let (_, pem, good) = certificate("retry.test");
    let (_, other_pem, wrong) = certificate("some-router.test");
    {
        let mut roots = lock(&remote::TEST_ROOT);
        roots.push(pem.into_bytes());
        roots.push(other_pem.into_bytes());
    }
    // ::1 and 127.0.0.1 on one port; a machine without ::1 fails loudly.
    let v6 = TcpListener::bind("[::1]:0").unwrap();
    let port = v6.local_addr().unwrap().port();
    let v4 = TcpListener::bind(("127.0.0.1", port)).unwrap();
    dns::pretend_system(
        "retry.test",
        vec!["::1".parse().unwrap(), "127.0.0.1".parse().unwrap()],
    );
    let s6 = serve_once(v6, wrong, false);
    let s4 = serve_once(v4, good, false);
    let client = remote::http().unwrap();
    let response = client
        .get(format!("https://retry.test:{port}/"))
        .send_retrying()
        .unwrap();
    assert_eq!(
        response
            .remote_addr()
            .map(|a| a.ip().to_string())
            .as_deref(),
        Some("127.0.0.1")
    );
    assert_eq!(response.text().unwrap(), "ok");
    let _ = s6.join();
    s4.join().unwrap();
}
