// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A computer at home paired (ADR 0117, "The Verso app paired"), the
//! app's side: the pinned verifier against certificates made here — the
//! pinned key under a certificate made again accepted, another key refused
//! and said as a changed identity — and the whole way against a real
//! `LocalServer` on loopback: the code typed, the person at the computer
//! allowing, the sign-in kept under the computer's name, a copy synced both
//! ways through it, and "Replace this computer's identity" said as such.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Arc;
use std::time::Duration;

use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::{ServerConfig, ServerConnection, StreamOwned};
use verso_server::db::Role;
use verso_server::local::{LocalServer, LocalSettings, pin};

use super::pair::{address_of, keep, pair};
use super::{changed, http_client, ws_connector};
use crate::tests_sync::{changed as told_changed, device_at, sync, text, write};

fn ring() -> Arc<rustls::crypto::CryptoProvider> {
    Arc::new(rustls::crypto::ring::default_provider())
}

/// A certificate over `key` naming `ip`, and a server's configuration.
fn served_over(key: &rcgen::KeyPair, ip: &str) -> Arc<ServerConfig> {
    let mut params = rcgen::CertificateParams::new(Vec::<String>::new()).unwrap();
    params.subject_alt_names = vec![rcgen::SanType::IpAddress(ip.parse().unwrap())];
    let cert = params.self_signed(key).unwrap();
    let der = CertificateDer::from(cert.der().to_vec());
    let private = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key.serialize_der()));
    Arc::new(
        ServerConfig::builder_with_provider(ring())
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(vec![der], private)
            .unwrap(),
    )
}

/// One HTTPS answer with `config`; a client that refuses ends it.
fn serve_once(config: Arc<ServerConfig>) -> (u16, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = std::thread::spawn(move || {
        let Ok((tcp, _)) = listener.accept() else {
            return;
        };
        let _ = tcp.set_read_timeout(Some(Duration::from_secs(20)));
        let Ok(conn) = ServerConnection::new(config) else {
            return;
        };
        let mut tls = StreamOwned::new(conn, tcp);
        let mut seen = [0_u8; 1024];
        if tls.read(&mut seen).is_ok() {
            let _ = tls
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
            let _ = tls.flush();
        }
    });
    (port, handle)
}

/// A computer held as paired to `key`'s pin, at 127.0.0.1: its address.
fn held(key: &rcgen::KeyPair, port: u16) -> (String, tempfile::TempDir) {
    use rcgen::PublicKeyData as _;
    let pinned = pin::of_key(&key.subject_public_key_info());
    let url = format!("https://{}:{port}", pin::name(&pinned));
    let config = tempfile::tempdir().unwrap();
    verso_core::servers::keep_paired(
        Some(config.path()),
        verso_core::servers::Paired {
            url: url.clone(),
            pin: pinned,
            addresses: vec!["127.0.0.1".into()],
        },
    )
    .unwrap();
    super::load(Some(config.path()));
    (url, config)
}

fn get(url: &str) -> Result<String, reqwest::Error> {
    http_client(url, Duration::from_secs(10))
        .unwrap()
        .unwrap()
        .get(format!("{url}/x"))
        .send()?
        .text()
}

/// The pinned key under its own certificate, and under one made again for
/// another address over the same key, is accepted; a certificate over
/// another key — the identity replaced, or someone else at the address —
/// is refused, and said as a changed identity, not as out of reach.
#[test]
fn the_pinned_key_is_accepted_under_any_certificate_and_no_other_key_is() {
    let key = rcgen::KeyPair::generate().unwrap();
    for ip in ["127.0.0.1", "10.0.0.7"] {
        let (port, served) = serve_once(served_over(&key, ip));
        let (url, _config) = held(&key, port);
        assert_eq!(get(&url).unwrap(), "ok", "a certificate naming {ip}");
        assert!(changed(&url).is_none());
        served.join().unwrap();
    }
    let other = rcgen::KeyPair::generate().unwrap();
    let (port, served) = serve_once(served_over(&other, "127.0.0.1"));
    let (url, _config) = held(&key, port);
    let e = get(&url).unwrap_err();
    let said = crate::reach::unsent(&url, &e);
    assert!(said.message.starts_with(super::CHANGED), "{}", said.message);
    assert_eq!(
        crate::sync::problem_of(&said, false),
        "identity_changed",
        "the sync says it, and waits as on a refusal"
    );
    served.join().unwrap();
    // The WebSocket's TLS is the same verifier.
    let host = reqwest::Url::parse(&url)
        .unwrap()
        .host_str()
        .unwrap()
        .to_owned();
    assert!(ws_connector(&host).is_some());
    assert!(
        ws_connector("notas.casa.lan").is_none(),
        "any other server as before"
    );
    assert!(http_client("https://notas.casa.lan", Duration::from_secs(1)).is_none());
}

/// A name of a paired computer's kind that this app holds no pin for is
/// never asked of a DNS server, and gets a pin nothing matches.
#[test]
fn a_paired_name_not_held_is_never_resolved_or_trusted() {
    let name = pin::name(&"ef".repeat(32));
    assert_eq!(super::addresses(&name), Some(Vec::new()));
    assert!(get(&format!("https://{name}:1")).is_err());
    assert_eq!(super::addresses("notas.casa.lan"), None);
}

#[test]
fn the_address_is_read_as_the_dialog_shows_it() {
    for typed in [
        "192.168.1.20:51234",
        " https://192.168.1.20:51234 ",
        "https://192.168.1.20:51234/pair#t=x&fp=y&c=z",
    ] {
        let (base, host, port) = address_of(typed).unwrap();
        assert_eq!(
            (base.as_str(), host.as_str(), port),
            ("https://192.168.1.20:51234", "192.168.1.20", 51234),
            "{typed}"
        );
    }
    assert_eq!(
        address_of("[fd00::5]:7000").unwrap().0,
        "https://[fd00::5]:7000"
    );
    for wrong in ["192.168.1.20", "http://192.168.1.20:5000", "", "a b"] {
        assert!(address_of(wrong).is_err(), "{wrong}");
    }
}

/// Someone in the middle answering as a computer would, with their own key:
/// they can say "allowed" and hand a token, but not the computer's proof
/// over the key the app saw — so the app keeps nothing.
#[test]
fn an_answer_without_the_computers_proof_pairs_nothing() {
    let key = rcgen::KeyPair::generate().unwrap();
    let config = served_over(&key, "127.0.0.1");
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let fake = std::thread::spawn(move || {
        for _ in 0..3 {
            let Ok((tcp, _)) = listener.accept() else {
                return;
            };
            let _ = tcp.set_read_timeout(Some(Duration::from_secs(20)));
            let Ok(conn) = ServerConnection::new(Arc::clone(&config)) else {
                return;
            };
            let mut tls = StreamOwned::new(conn, tcp);
            let mut seen = [0_u8; 4096];
            let n = tls.read(&mut seen).unwrap_or(0);
            let asked = String::from_utf8_lossy(&seen[..n]).into_owned();
            let body = if asked.starts_with("GET /api/state") {
                r#"{"local":true,"pairing":true}"#.to_owned()
            } else if asked.starts_with("POST /api/pair/poll") {
                format!(
                    r#"{{"state":"allowed","token":"stolen","proof":"{}","name":"x"}}"#,
                    "0".repeat(64)
                )
            } else {
                r#"{"poll":"p","interval":1}"#.to_owned()
            };
            let _ = write!(
                tls,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = tls.flush();
        }
    });
    let e = pair(&format!("127.0.0.1:{port}"), "BCDF-GHJK", "Verso · Pixel")
        .err()
        .unwrap();
    assert!(
        e.message.contains("did not come from the computer"),
        "{}",
        e.message
    );
    fake.join().unwrap();
}

/// This computer's server, serving `Campanha` on loopback with its own
/// certificate, as a computer at home does on its network.
struct Home {
    local: LocalServer,
    port: u16,
    folder: std::path::PathBuf,
    _dirs: (tempfile::TempDir, tempfile::TempDir, tempfile::TempDir),
}

fn home() -> Home {
    let notes = tempfile::tempdir().unwrap();
    let ui = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let folder = notes.path().join("Campanha");
    verso_fs::server::make_folder(notes.path(), "Campanha").unwrap();
    let _ = crate::tests::note(&folder, "Sessao.md", "# Sessao\n").keep();
    let _ = crate::tests::note(ui.path(), "web.html", "<!doctype html><title>Verso</title>").keep();
    let local = LocalServer::on_loopback_for_tests(
        data.path().join("local-server"),
        vec![ui.path().to_path_buf()],
        Arc::new(|_| {}),
    );
    local
        .set_settings(&LocalSettings {
            folders: vec![folder.to_string_lossy().into_owned()],
            ..LocalSettings::default()
        })
        .unwrap();
    let port = local.start().unwrap().port.unwrap();
    Home {
        local,
        port,
        folder,
        _dirs: (notes, ui, data),
    }
}

/// The app pairs with `code` while the person at the computer answers
/// `allow` at `role` once asked.
fn pair_at(
    h: &Home,
    code: &str,
    allow: bool,
    role: Role,
) -> Result<super::pair::Made, verso_contract::ContractError> {
    let address = format!("127.0.0.1:{}", h.port);
    std::thread::scope(|s| {
        let app = s.spawn(|| pair(&address, code, "Verso · Pixel"));
        for _ in 0..300 {
            if app.is_finished() {
                break;
            }
            if h.local.pair_state().asked.is_some() {
                h.local.answer(allow, role).unwrap();
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        app.join().unwrap()
    })
}

/// The whole way: the code typed, the computer asked and allowing, the
/// sign-in kept under the computer's name with its pin, its folder synced
/// into a folder of this device and a change sent back to the computer.
#[test]
fn a_computer_paired_by_its_code_syncs_a_copy_both_ways() {
    let h = home();
    let code = h.local.pair_open().unwrap().code;
    let made = pair_at(&h, &code, true, Role::Editor).unwrap();
    let config = tempfile::tempdir().unwrap();
    let account = keep(Some(config.path()), made).unwrap();
    assert!(account.paired);
    assert!(account.url.contains(".home.arpa:"), "{}", account.url);
    let phones = h.local.phones().unwrap();
    assert_eq!(phones.len(), 1);
    assert_eq!(phones[0].role, Role::Editor);
    let login = verso_core::servers::find(Some(config.path()), &account.url)
        .unwrap()
        .unwrap();
    let kept = verso_core::servers::paired(Some(config.path())).unwrap();
    assert_eq!(kept[0].addresses, vec!["127.0.0.1".to_owned()]);
    let folders: serde_json::Value = http_client(&login.url, Duration::from_secs(10))
        .unwrap()
        .unwrap()
        .get(format!("{}/api/folders", login.url))
        .bearer_auth(&login.token)
        .send()
        .unwrap()
        .json()
        .unwrap();
    // The computer's own folder, listed at the phone's role: an editor's,
    // never the owner's (the maintainer's phone said *dona*, 2026-11-15).
    assert_eq!(folders["folders"][0]["role"], "editor", "{folders}");
    let id = folders["folders"][0]["id"].as_str().unwrap().to_owned();
    let d = device_at(&login.url, &id, &login.token, &[]);
    sync(&d);
    assert_eq!(text(&d, "Sessao.md").as_deref(), Some("# Sessao\n"));
    write(&d, "Do celular.md", b"# Do celular\n");
    told_changed(&d, &["Do celular.md"]);
    sync(&d);
    let index = tempfile::tempdir().unwrap();
    let mut computer = verso_core::Workspace::open(&h.folder, Some(index.path())).unwrap();
    let there = computer.read_note("Do celular.md").unwrap();
    assert_eq!(
        there.lines,
        vec!["# Do celular"],
        "the change reached the computer"
    );
}

/// A wrong code pairs nothing and says what to do; the computer is asked
/// nothing. A refusal at the computer pairs nothing either.
#[test]
fn a_wrong_code_or_a_refusal_pairs_nothing() {
    let h = home();
    let code = h.local.pair_open().unwrap().code;
    let wrong = if code == "BCDF-GHJK" {
        "BCDF-GHJL"
    } else {
        "BCDF-GHJK"
    };
    let e = pair_at(&h, wrong, true, Role::Editor).err().unwrap();
    assert!(e.message.contains("code was not right"), "{}", e.message);
    assert!(h.local.phones().unwrap().is_empty());
    let e = pair_at(&h, &code, false, Role::Editor).err().unwrap();
    assert!(e.message.contains("said no"), "{}", e.message);
    assert!(h.local.phones().unwrap().is_empty());
}

/// "Replace this computer's identity" ends the pairing in words: the
/// sync's connection is refused for a changed identity, not retried as a
/// computer out of reach.
#[test]
fn a_replaced_identity_ends_the_pairing_in_words() {
    let h = home();
    let code = h.local.pair_open().unwrap().code;
    let made = pair_at(&h, &code, true, Role::Reader).unwrap();
    let config = tempfile::tempdir().unwrap();
    let account = keep(Some(config.path()), made).unwrap();
    let login = verso_core::servers::find(Some(config.path()), &account.url)
        .unwrap()
        .unwrap();
    h.local.replace_identity().unwrap();
    let again = h.local.start().unwrap().port.unwrap();
    assert_eq!(again, h.port, "the port is kept");
    let d = device_at(&login.url, "any", &login.token, &[]);
    let e = tauri::async_runtime::block_on(crate::sync::link(&d.ctx, &d.s))
        .err()
        .unwrap();
    assert_eq!(
        crate::sync::problem_of(&e, false),
        "identity_changed",
        "{}",
        e.message
    );
}

/// The computer kept at `addresses` only, under `key`'s pin, at `port`.
fn held_at(key: &rcgen::KeyPair, port: u16, addresses: &[&str]) -> (String, tempfile::TempDir) {
    let (url, config) = held(key, port);
    let mut kept = verso_core::servers::paired(Some(config.path())).unwrap();
    kept[0].addresses = addresses.iter().map(|a| (*a).to_owned()).collect();
    verso_core::servers::keep_paired(Some(config.path()), kept.remove(0)).unwrap();
    super::load(Some(config.path()));
    (url, config)
}

fn host_of(url: &str) -> String {
    reqwest::Url::parse(url)
        .unwrap()
        .host_str()
        .unwrap()
        .to_owned()
}

/// Someone on the network announcing the computer's pin at their own
/// address, with their own key: the probe there fails the pin, nothing is
/// kept, and the request is said as out of reach — never as the computer's
/// identity changed, which it did not.
#[test]
fn an_impostor_announcing_the_pin_is_tried_and_never_kept() {
    use crate::dns::SendRetrying as _;
    let key = rcgen::KeyPair::generate().unwrap();
    let other = rcgen::KeyPair::generate().unwrap();
    let (port, impostor) = serve_once(served_over(&other, "127.0.0.1"));
    // Known only at an address where nothing listens now.
    let (url, config) = held_at(&key, port, &["::1"]);
    use rcgen::PublicKeyData as _;
    let pinned = pin::of_key(&key.subject_public_key_info());
    super::find::pretend_found(&pinned, vec![format!("127.0.0.1:{port}").parse().unwrap()]);
    let e = http_client(&url, Duration::from_secs(10))
        .unwrap()
        .unwrap()
        .get(format!("{url}/x"))
        .send_retrying()
        .unwrap_err();
    impostor.join().unwrap();
    assert!(changed(&url).is_none(), "not said as the identity changed");
    let said = crate::reach::unsent(&url, &e);
    assert_eq!(
        said.kind,
        verso_contract::ErrorKind::Unreachable,
        "{}",
        said.message
    );
    let kept = verso_core::servers::paired(Some(config.path())).unwrap();
    assert_eq!(
        kept[0].addresses,
        vec!["::1".to_owned()],
        "the impostor's address is kept nowhere"
    );
    assert_eq!(
        super::addresses(&host_of(&url)),
        Some(vec!["::1".parse().unwrap()])
    );
    // A second look inside 30 s is not made: away from home, a retry does
    // not browse the network each time.
    assert!(!super::find_again(&host_of(&url)));
}

/// The computer got an address this app never saw: none of the known ones
/// answers, the network says where its pin is announced, the handshake
/// there shows the pinned key — the address is kept, first, and the copy
/// syncs, both ways, on the sync's own first try.
#[test]
fn a_computer_at_a_new_address_is_found_by_its_pin_and_syncs() {
    let h = home();
    let code = h.local.pair_open().unwrap().code;
    let made = pair_at(&h, &code, true, Role::Editor).unwrap();
    let config = tempfile::tempdir().unwrap();
    let account = keep(Some(config.path()), made).unwrap();
    let login = verso_core::servers::find(Some(config.path()), &account.url)
        .unwrap()
        .unwrap();
    let folders: serde_json::Value = http_client(&login.url, Duration::from_secs(10))
        .unwrap()
        .unwrap()
        .get(format!("{}/api/folders", login.url))
        .bearer_auth(&login.token)
        .send()
        .unwrap()
        .json()
        .unwrap();
    let id = folders["folders"][0]["id"].as_str().unwrap().to_owned();
    // The address it was paired at is gone (a new DHCP lease).
    let mut kept = verso_core::servers::paired(Some(config.path())).unwrap();
    let pinned = kept[0].pin.clone();
    kept[0].addresses = vec!["::1".to_owned()];
    verso_core::servers::keep_paired(Some(config.path()), kept.remove(0)).unwrap();
    super::load(Some(config.path()));
    super::find::pretend_found(
        &pinned,
        vec![format!("127.0.0.1:{}", h.port).parse().unwrap()],
    );
    let d = device_at(&login.url, &id, &login.token, &[]);
    sync(&d);
    assert_eq!(text(&d, "Sessao.md").as_deref(), Some("# Sessao\n"));
    let kept = verso_core::servers::paired(Some(config.path())).unwrap();
    assert_eq!(
        kept[0].addresses.first().map(String::as_str),
        Some("127.0.0.1"),
        "{:?}",
        kept[0].addresses
    );
    assert!(changed(&login.url).is_none());
    write(&d, "Achado.md", b"# Achado\n");
    told_changed(&d, &["Achado.md"]);
    sync(&d);
    let index = tempfile::tempdir().unwrap();
    let mut computer = verso_core::Workspace::open(&h.folder, Some(index.path())).unwrap();
    assert_eq!(
        computer.read_note("Achado.md").unwrap().lines,
        vec!["# Achado"]
    );
}
