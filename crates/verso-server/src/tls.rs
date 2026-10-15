// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! TLS served by the server itself (the maintainer's answer F of
//! 2026-10-09): the host's certificate and key, PEM files, for a server
//! reached without a proxy or `tailscale serve` in front. Each connection's
//! handshake runs in a task of its own, so a slow or broken client holds
//! no other.

use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use rustls_pki_types::pem::PemObject;
use rustls_pki_types::{CertificateDer, PrivateKeyDer};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_rustls::TlsAcceptor;
use tokio_rustls::server::TlsStream;

use crate::listen::{Counted, Incoming, Slots};

/// How long a client has to finish its handshake.
const HANDSHAKE: Duration = Duration::from_secs(10);

/// The acceptor for the certificate chain and key in `cert` and `key`.
pub fn acceptor(cert: &Path, key: &Path) -> Result<TlsAcceptor, String> {
    let chain: Vec<CertificateDer<'static>> = CertificateDer::pem_file_iter(cert)
        .map_err(|e| format!("VERSO_TLS_CERT_FILE ({}): {e}", cert.display()))?
        .collect::<Result<_, _>>()
        .map_err(|e| format!("VERSO_TLS_CERT_FILE ({}): {e}", cert.display()))?;
    if chain.is_empty() {
        return Err(format!(
            "VERSO_TLS_CERT_FILE ({}): no certificate",
            cert.display()
        ));
    }
    let key = PrivateKeyDer::from_pem_file(key)
        .map_err(|e| format!("VERSO_TLS_KEY_FILE ({}): {e}", key.display()))?;
    acceptor_from(chain, key)
        .map_err(|e| format!("VERSO_TLS_CERT_FILE and VERSO_TLS_KEY_FILE: {e}"))
}

/// The acceptor for a certificate chain and key already in memory: the
/// app's own certificate, kept in its database rather than in files
/// ("this app is a server", ADR 0096 items 5 and 16).
pub fn acceptor_from(
    chain: Vec<CertificateDer<'static>>,
    key: PrivateKeyDer<'static>,
) -> Result<TlsAcceptor, String> {
    let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
    let mut config = tokio_rustls::rustls::ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .with_no_client_auth()
        .with_single_cert(chain, key)
        .map_err(|e| e.to_string())?;
    config.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(TlsAcceptor::from(Arc::new(config)))
}

/// A listener whose connections are TLS. A connection takes its place
/// ([`crate::listen::Slots`]) before its handshake: one without a place is
/// closed before any work is spent on it.
pub struct TlsListener {
    incoming: mpsc::Receiver<(Counted<TlsStream<TcpStream>>, SocketAddr)>,
    local: SocketAddr,
}

impl TlsListener {
    pub fn new(
        tcp: TcpListener,
        acceptor: TlsAcceptor,
        slots: Arc<Slots>,
    ) -> std::io::Result<Self> {
        let local = tcp.local_addr()?;
        let (tx, incoming) = mpsc::channel(64);
        tokio::spawn(async move {
            loop {
                let (stream, addr) = match tcp.accept().await {
                    Ok(c) => c,
                    Err(e) => {
                        crate::log::warn(&format!("accepting a connection: {e}"));
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        continue;
                    }
                };
                let Some(slot) = slots.take(addr.ip()) else {
                    continue;
                };
                let acceptor = acceptor.clone();
                let tx = tx.clone();
                tokio::spawn(async move {
                    // A client that speaks plain HTTP to the TLS port, or
                    // gives up: nothing to serve, nothing worth a line.
                    if let Ok(Ok(tls)) =
                        tokio::time::timeout(HANDSHAKE, acceptor.accept(stream)).await
                    {
                        let _ = tx.send((Counted::new(tls, slot), addr)).await;
                    }
                });
            }
        });
        Ok(Self { incoming, local })
    }
}

impl Incoming for TlsListener {
    type Io = TlsStream<TcpStream>;

    async fn accept(&mut self) -> (Counted<Self::Io>, SocketAddr) {
        loop {
            if let Some(c) = self.incoming.recv().await {
                return c;
            }
            // The accepting task is gone: nothing more will come.
            std::future::pending::<()>().await;
        }
    }

    fn local_addr(&self) -> std::io::Result<SocketAddr> {
        Ok(self.local)
    }
}
