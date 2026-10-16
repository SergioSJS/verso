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

use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::{ClientConfig, RootCertStore, ServerConfig, ServerConnection, StreamOwned};

use crate::dns::{self, Dial, SendRetrying};
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
    *lock(&remote::TEST_ROOT) = Some(pem.into_bytes());
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
    let _ = server.join();
    *lock(&remote::TEST_ROOT) = None;
}

#[test]
fn the_websockets_dial_verifies_the_urls_name_too() {
    tauri::async_runtime::block_on(the_dial_verifies());
}

async fn the_dial_verifies() {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::{Connector, client_async_tls_with_config};
    let (der, _, config) = certificate("pretend.test");
    let mut roots = RootCertStore::empty();
    roots.add(der).unwrap();
    let client = Arc::new(
        ClientConfig::builder_with_provider(ring())
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    );
    dns::pretend_system("pretend.test", vec!["127.0.0.1".parse().unwrap()]);
    dns::pretend_system("other.test", vec!["127.0.0.1".parse().unwrap()]);
    let dial = |host: &'static str, port: u16| {
        let client = Arc::clone(&client);
        async move {
            let request = format!("wss://{host}:{port}/api/ws")
                .into_client_request()
                .unwrap();
            dns::dial_with(host, port, move |stream| {
                let (request, connector) =
                    (request.clone(), Connector::Rustls(Arc::clone(&client)));
                async move {
                    client_async_tls_with_config(request, stream, None, Some(connector))
                        .await
                        .map(|_| ())
                        .map_err(|e| (e.to_string(), false))
                }
            })
            .await
        }
    };
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = serve_once(listener, Arc::clone(&config), true);
    assert!(dial("pretend.test", port).await.is_ok());
    server.join().unwrap();

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = serve_once(listener, config, true);
    let wrong = dial("other.test", port).await;
    assert!(
        matches!(wrong, Err(Dial::Shake(_))),
        "a certificate for another name must not do"
    );
    let _ = server.join();
}
