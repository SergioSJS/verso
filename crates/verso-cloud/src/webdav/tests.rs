// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;
use crate::fake::{Dav, DavMode, agrees};
use crate::testkit::{Bytes, Collect, meta, sha};

fn connect(dav: &Dav) -> WebDav {
    WebDav::new(&dav.address, "ana", "segredo", true)
        .unwrap()
        .quick()
}

fn mode() -> DavMode {
    DavMode {
        user: "ana".to_owned(),
        password: "segredo".to_owned(),
        ..DavMode::default()
    }
}

fn put(w: &WebDav, path: &str, condition: &Condition, bytes: &[u8]) -> Result<Written> {
    w.write(path, condition, &meta(bytes), &mut Bytes::new(bytes, 1000))
}

fn version_of(w: &WebDav, path: &str) -> String {
    let listing = w.list(None).unwrap();
    listing
        .changes
        .iter()
        .find_map(|c| match c {
            Change::Present(e) if e.path == path => Some(e.version.clone()),
            _ => None,
        })
        .unwrap()
}

#[test]
fn a_new_file_is_written_listed_and_read_back() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    assert!(w.list(None).unwrap().changes.is_empty());
    let written = put(
        &w,
        "Notas/Ideias/Café & chá.md",
        &Condition::Absent,
        b"um dois tres",
    )
    .unwrap();
    assert_eq!(written.path, "Notas/Ideias/Café & chá.md");
    assert_eq!(
        dav.get("Notas/Ideias/Café & chá.md").unwrap(),
        b"um dois tres"
    );
    let listing = w.list(None).unwrap();
    assert!(listing.full);
    assert_eq!(listing.changes.len(), 1);
    let Change::Present(e) = &listing.changes[0] else {
        panic!()
    };
    assert_eq!(
        (e.path.as_str(), e.size),
        ("Notas/Ideias/Café & chá.md", 12)
    );
    assert_eq!(e.version, written.version);
    let mut sink = Collect::default();
    let read = w.read("Notas/Ideias/Café & chá.md", &mut sink).unwrap();
    assert_eq!(
        (sink.0.as_slice(), read.version),
        (&b"um dois tres"[..], written.version)
    );
    // The default fingerprint reads and hashes.
    assert_eq!(
        w.fingerprint("Notas/Ideias/Café & chá.md").unwrap().1,
        sha(b"um dois tres")
    );
}

#[test]
fn a_file_goes_up_in_pieces_and_arrives_whole() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    let bytes: Vec<u8> = (0..3_000_000_u32).map(|i| (i % 251) as u8).collect();
    let written = w
        .write(
            "grande.bin",
            &Condition::Absent,
            &meta(&bytes),
            &mut Bytes::new(&bytes, 1 << 20),
        )
        .unwrap();
    assert_eq!(dav.get("grande.bin").unwrap(), bytes);
    assert!(!written.version.is_empty());
    let mut sink = Collect::default();
    w.read("grande.bin", &mut sink).unwrap();
    assert_eq!(sink.0, bytes);
}

#[test]
fn a_write_against_a_version_that_is_not_there_changed() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    let first = put(&w, "a.md", &Condition::Absent, b"um").unwrap();
    // Another device writes meanwhile.
    dav.put("a.md", b"do outro aparelho");
    let e = put(&w, "a.md", &Condition::Version(first.version), b"dois").unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Changed);
    assert_eq!(dav.get("a.md").unwrap(), b"do outro aparelho");
    // A new file where one was made: also changed.
    let e = put(&w, "a.md", &Condition::Absent, b"tres").unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Changed);
    assert_eq!(dav.get("a.md").unwrap(), b"do outro aparelho");
}

#[test]
fn a_write_against_the_right_version_replaces_it() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    put(&w, "a.md", &Condition::Absent, b"um").unwrap();
    let v = version_of(&w, "a.md");
    let second = put(&w, "a.md", &Condition::Version(v.clone()), b"dois").unwrap();
    assert_ne!(second.version, v);
    assert_eq!(dav.get("a.md").unwrap(), b"dois");
    assert!(dav.writes().iter().all(agrees));
}

#[test]
fn a_service_without_a_put_etag_is_asked_for_it() {
    let dav = Dav::start(DavMode {
        no_put_etag: true,
        ..mode()
    });
    let w = connect(&dav);
    let written = put(&w, "a.md", &Condition::Absent, b"um").unwrap();
    assert_eq!(written.version, version_of(&w, "a.md"));
}

#[test]
fn delete_and_rename_hold_to_the_version() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    put(&w, "a.md", &Condition::Absent, b"um").unwrap();
    put(&w, "b.md", &Condition::Absent, b"dois").unwrap();
    let (va, vb) = (version_of(&w, "a.md"), version_of(&w, "b.md"));
    // Wrong version: refused, nothing moves or goes.
    assert_eq!(
        w.delete("a.md", &Condition::Version("\"x\"".into()))
            .unwrap_err()
            .kind,
        RemoteErrorKind::Changed
    );
    assert_eq!(
        w.rename("a.md", "pasta/c.md", &Condition::Version("\"x\"".into()))
            .unwrap_err()
            .kind,
        RemoteErrorKind::Changed
    );
    assert!(dav.get("a.md").is_some());
    // A name that is taken.
    assert_eq!(
        w.rename("a.md", "b.md", &Condition::Version(va.clone()))
            .unwrap_err()
            .kind,
        RemoteErrorKind::Exists
    );
    // Renamed into a folder that does not exist yet.
    let moved = w
        .rename("a.md", "pasta/nova/c.md", &Condition::Version(va))
        .unwrap();
    assert_eq!(moved.path, "pasta/nova/c.md");
    assert!(dav.get("a.md").is_none());
    assert_eq!(dav.get("pasta/nova/c.md").unwrap(), b"um");
    assert_eq!(moved.version, version_of(&w, "pasta/nova/c.md"));
    w.delete("b.md", &Condition::Version(vb.clone())).unwrap();
    assert!(dav.get("b.md").is_none());
    // Already gone: nothing to do.
    w.delete("b.md", &Condition::Version(vb)).unwrap();
}

#[test]
fn reading_what_is_not_there_says_so() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    let e = w.read("nada.md", &mut Collect::default()).unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::NotFound);
}

#[test]
fn a_wrong_password_is_a_refusal_that_says_so() {
    let dav = Dav::start(mode());
    let w = WebDav::new(&dav.address, "ana", "errada", true)
        .unwrap()
        .quick();
    let e = w.list(None).unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Refused);
    assert!(e.message.starts_with("cloud sign-in refused"), "{e}");
    assert!(!e.message.contains("errada"));
}

#[test]
fn a_service_that_says_slow_down_is_waited_for_and_then_given_up_on() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    dav.throttle(2);
    put(&w, "a.md", &Condition::Absent, b"um").unwrap();
    assert_eq!(dav.get("a.md").unwrap(), b"um");
    dav.throttle(100);
    let e = w.list(None).unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::RateLimited(Some(0)));
    dav.throttle(0);
    // The upload was rewound each time: the body that finally went is whole.
    dav.throttle(2);
    let bytes = vec![7_u8; 5000];
    w.write(
        "b.bin",
        &Condition::Absent,
        &meta(&bytes),
        &mut Bytes::new(&bytes, 999),
    )
    .unwrap();
    assert_eq!(dav.get("b.bin").unwrap(), bytes);
}

#[test]
fn names_a_server_keeps_for_itself_are_refused() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    for name in ["x.part", "pasta/y.filepart", ".htaccess", ".verso-probe/z"] {
        let e = put(&w, name, &Condition::Absent, b"x").unwrap_err();
        assert_eq!(e.kind, RemoteErrorKind::NameInvalid, "{name}");
    }
    assert!(dav.paths().is_empty());
}

#[test]
fn a_names_decomposed_form_goes_up_composed() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    let written = put(&w, "Cafe\u{301}.md", &Condition::Absent, b"x").unwrap();
    assert_eq!(written.path, "Caf\u{e9}.md");
    assert_eq!(dav.paths(), vec!["Caf\u{e9}.md".to_owned()]);
}

#[test]
fn a_source_that_fails_here_fails_the_write_as_local() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    let bytes = vec![1_u8; 4000];
    let mut source = Bytes::new(&bytes, 1000);
    source.fail_after = Some(2000);
    let e = w
        .write("a.bin", &Condition::Absent, &meta(&bytes), &mut source)
        .unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Local);
}

#[test]
fn the_probe_passes_an_honest_server_and_leaves_nothing() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    dav.put("antigo.md", b"ja estava la");
    let report = w.probe().unwrap();
    assert_eq!(report.provider, "webdav");
    assert_eq!((report.files, report.bytes), (1, 12));
    assert_eq!(report.free, Some(987_654_321));
    assert_eq!(report.deletions, Deletions::Final);
    // Our check files are gone, and the person's file untouched.
    assert_eq!(dav.paths(), vec!["antigo.md".to_owned()]);
    assert!(dav.requests().iter().any(|r| r.contains(".verso-probe")));
}

#[test]
fn the_probe_refuses_a_server_that_would_lose_an_edit() {
    type Tweak = fn(&mut DavMode);
    let cases: [(&str, Tweak); 5] = [
        ("If-None-Match", |m| m.ignore_if_none_match = true),
        ("If-Match", |m| m.ignore_if_match = true),
        ("ETag", |m| m.weak_etags = true),
        ("ETag", |m| m.no_etags = true),
        ("delete", |m| m.ignore_delete_if_match = true),
    ];
    for (needle, tweak) in cases {
        let mut m = mode();
        tweak(&mut m);
        let dav = Dav::start(m);
        let e = connect(&dav).probe().unwrap_err();
        assert_eq!(e.kind, RemoteErrorKind::Refused, "{needle}: {e}");
        assert!(e.message.contains(needle), "{needle}: {e}");
        // Cleaned up even so.
        assert!(dav.paths().is_empty(), "{needle}: {:?}", dav.paths());
    }
}

#[test]
fn plain_http_outside_the_local_network_never_carries_a_password() {
    let e = WebDav::new("http://nuvem.example.com/dav", "a", "b", true)
        .err()
        .unwrap();
    assert_eq!(e.detail.as_deref(), Some("plain_http_refused"));
    let e = WebDav::new("http://127.0.0.1:1/dav", "a", "b", false)
        .err()
        .unwrap();
    assert_eq!(e.detail.as_deref(), Some("plain_http_unconfirmed"));
    let e = WebDav::new("https://ana:segredo@nuvem.example.com/dav", "a", "b", false)
        .err()
        .unwrap();
    assert_eq!(e.kind, RemoteErrorKind::Refused);
    assert!(WebDav::new("https://nuvem.example.com/dav", "a", "b", false).is_ok());
}

#[test]
fn nothing_is_reachable_at_a_closed_port() {
    let w = WebDav::new("http://127.0.0.1:1/dav", "a", "b", true)
        .unwrap()
        .quick();
    let e = w.list(None).unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Unreachable);
    assert!(!e.message.contains("segredo"));
}

#[test]
fn a_file_is_asked_for_by_itself_and_a_folder_that_is_gone_is_an_error() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    put(&w, "pasta/a.md", &Condition::Absent, b"um").unwrap();
    assert!(w.exists("pasta/a.md").unwrap());
    assert!(!w.exists("pasta/b.md").unwrap());
    // A folder is not a file.
    assert!(!w.exists("pasta").unwrap());
    // The listing lagging does not make a file not exist.
    dav.hide("pasta/a.md");
    assert!(w.list(None).unwrap().changes.is_empty());
    assert!(w.exists("pasta/a.md").unwrap());
    // The folder itself gone: an error, not an empty folder.
    dav.remove_folder();
    assert_eq!(w.list(None).unwrap_err().kind, RemoteErrorKind::NotFound);
}

#[test]
fn a_write_answers_with_the_version_it_made_not_the_one_that_landed_after_it() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    // Another device's write, made against our version, lands before our
    // next request, with as many bytes as ours.
    dav.after("PUT", "a.md", b"ou");
    let written = put(&w, "a.md", &Condition::Absent, b"um").unwrap();
    assert_eq!(dav.get("a.md").unwrap(), b"ou");
    let ours = dav.writes().into_iter().rev().nth(1).unwrap().etag;
    assert_eq!(written.version, ours);
    assert_ne!(written.version, version_of(&w, "a.md"));
}

#[test]
fn with_no_etag_on_the_put_a_stat_never_gives_our_bytes_another_devices_version() {
    let dav = Dav::start(DavMode {
        no_put_etag: true,
        ..mode()
    });
    let w = connect(&dav);
    dav.after("PUT", "a.md", b"ou");
    let e = put(&w, "a.md", &Condition::Absent, b"um").unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Changed, "{e}");
    // Nothing landed: the version is the one the read-back saw.
    let written = put(&w, "b.md", &Condition::Absent, b"um").unwrap();
    assert_eq!(written.version, version_of(&w, "b.md"));
}

#[test]
fn asking_whether_a_file_exists_does_not_download_it() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    put(&w, "pasta/a.md", &Condition::Absent, &[7_u8; 4096]).unwrap();
    let before = dav.requests().len();
    assert!(w.exists("pasta/a.md").unwrap());
    assert!(!w.exists("pasta/b.md").unwrap());
    // A folder is not a file.
    assert!(!w.exists("pasta").unwrap());
    let asked = dav.requests()[before..].to_vec();
    assert!(
        asked.iter().all(|r| r.starts_with("PROPFIND ")),
        "only metadata is asked for: {asked:?}"
    );
}

#[test]
fn a_fingerprint_reads_the_file_once() {
    let dav = Dav::start(mode());
    let w = connect(&dav);
    put(&w, "a.md", &Condition::Absent, b"conteudo").unwrap();
    let before = dav.requests().len();
    let (version, hash) = w.fingerprint("a.md").unwrap();
    assert_eq!((version, hash), (version_of(&w, "a.md"), sha(b"conteudo")));
    let gets = dav.requests()[before..]
        .iter()
        .filter(|r| r.starts_with("GET "))
        .count();
    assert_eq!(gets, 1);
}

#[test]
fn the_probe_deletes_only_its_own_object_never_the_shared_folder() {
    let dav = Dav::start(mode());
    // Another device is probing the same folder at the same moment: its
    // object is in `.verso-probe`.
    dav.put(".verso-probe/probe-outro", b"verso");
    connect(&dav).probe().unwrap();
    assert_eq!(dav.get(".verso-probe/probe-outro").unwrap(), b"verso");
    assert!(dav.has_dir(".verso-probe"));
    let deleted_folder: Vec<_> = dav
        .requests()
        .into_iter()
        .filter(|r| r.starts_with("DELETE ") && r.trim_end_matches('/').ends_with("/.verso-probe"))
        .collect();
    assert!(deleted_folder.is_empty(), "{deleted_folder:?}");
}

#[test]
fn collections_are_asked_for_with_a_trailing_slash() {
    // Apache's mod_dav answers a collection asked for without one with a
    // redirect, which is refused (credentials follow no redirect).
    let dav = Dav::start(mode());
    let w = connect(&dav);
    put(&w, "pasta/fundo/a.md", &Condition::Absent, b"um").unwrap();
    w.list(None).unwrap();
    w.probe().unwrap();
    let collections: Vec<String> = dav
        .requests()
        .into_iter()
        .filter(|r| r.starts_with("MKCOL ") || r.starts_with("PROPFIND "))
        .collect();
    assert!(collections.len() > 4, "{collections:?}");
    // A PROPFIND of a file (the stat after a write) is the only one
    // without.
    for r in &collections {
        let path = r.split_once(' ').map_or("", |(_, p)| p);
        assert!(
            path.ends_with('/') || path.ends_with(".md") || path.contains("/probe-"),
            "{r}"
        );
    }
    assert!(collections.iter().any(|r| r == "PROPFIND /dav/"));
    assert!(
        collections
            .iter()
            .any(|r| r == "PROPFIND /dav/pasta/fundo/")
    );
    assert!(collections.iter().any(|r| r == "MKCOL /dav/pasta/"));
    assert!(collections.iter().any(|r| r == "MKCOL /dav/.verso-probe/"));
}

/// A first listing of a folder whose link drops at the k-th file read
/// (I4 of the sync review, 2026-11-15): the hashes read before it are
/// kept, and the next try reads only from the k-th on.
#[test]
fn a_first_listing_cut_short_does_not_read_again_what_it_read() {
    use std::collections::BTreeMap;
    use verso_core::sync::remote::refresh_learning;
    let dav = Dav::start(DavMode {
        fail_get: 4,
        ..mode()
    });
    let names: Vec<String> = (1..=6).map(|i| format!("pasta/n{i}.md")).collect();
    for (i, p) in names.iter().enumerate() {
        dav.put(p, format!("conteudo {i}").as_bytes());
    }
    let w = connect(&dav);
    let (mut known, mut tokens) = (None, BTreeMap::new());
    assert!(refresh_learning(&w, &mut known, &mut tokens).is_err());
    assert!(known.is_none());
    assert_eq!(tokens.len(), 3);
    refresh_learning(&w, &mut known, &mut tokens).unwrap();
    let gets: Vec<String> = dav
        .requests()
        .into_iter()
        .filter_map(|r| r.strip_prefix("GET /dav/").map(str::to_owned))
        .collect();
    // The fourth twice — its read failed — and every other once.
    let mut want: Vec<String> = names.clone();
    want.insert(3, names[3].clone());
    assert_eq!(gets, want);
    let k = known.unwrap();
    assert_eq!(k.files.len(), 6);
    assert_eq!(k.files["pasta/n6.md"].hash, sha(b"conteudo 5"));
}

/// A first listing of a folder whose files this device never saw (I4 part
/// 2, 2026-11-15): none is read for its hash — each is fetched once, by its
/// download — and one with a base is read as before.
#[test]
fn a_first_listing_reads_no_file_only_there() {
    use std::collections::BTreeMap;
    use verso_core::sync::remote::{UNREAD, refresh_planning};
    let dav = Dav::start(mode());
    for i in 1..=4 {
        dav.put(
            &format!("pasta/n{i}.md"),
            format!("conteudo {i}").as_bytes(),
        );
    }
    let w = connect(&dav);
    let (mut known, mut tokens) = (None, BTreeMap::new());
    refresh_planning(&w, &mut known, &mut tokens, &|p| p != "pasta/n2.md").unwrap();
    let gets: Vec<String> = dav
        .requests()
        .into_iter()
        .filter_map(|r| r.strip_prefix("GET /dav/").map(str::to_owned))
        .filter(|p| p.starts_with("pasta/"))
        .collect();
    assert_eq!(gets, vec!["pasta/n2.md"]);
    let k = known.unwrap();
    assert_eq!(k.files.len(), 4);
    assert_eq!(k.files["pasta/n1.md"].hash, UNREAD);
    assert_eq!(k.files["pasta/n2.md"].hash, sha(b"conteudo 2"));
    assert_eq!(k.unread.len(), 3);
    assert_eq!(tokens.len(), 1);
}
