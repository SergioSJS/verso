// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;
use crate::fake::{BUCKET, S3 as Fake, S3Mode, agrees, removal_agrees};
use crate::testkit::{Bytes, Collect, meta, sha};

fn settings(fake: &Fake) -> Settings {
    Settings {
        endpoint: fake.address.clone(),
        bucket: BUCKET.to_owned(),
        prefix: "Cofre".to_owned(),
        region: "test-1".to_owned(),
        access: "AKIATEST".to_owned(),
        secret: "secret-test-key".to_owned(),
        path_style: true,
        plain_http: true,
        ..Settings::default()
    }
}

/// A client that has done what connecting does: probed, and keeping what
/// the service honours.
fn connect(fake: &Fake) -> S3 {
    let report = S3::new(settings(fake)).unwrap().quick().probe().unwrap();
    S3::new(Settings {
        caps: report.caps,
        ..settings(fake)
    })
    .unwrap()
    .quick()
}

fn put(s: &S3, path: &str, condition: &Condition, bytes: &[u8]) -> Result<Written> {
    s.write(path, condition, &meta(bytes), &mut Bytes::new(bytes, 1000))
}

fn version_of(s: &S3, path: &str) -> String {
    s.list(None)
        .unwrap()
        .changes
        .iter()
        .find_map(|c| match c {
            Change::Present(e) if e.path == path => Some(e.version.clone()),
            _ => None,
        })
        .unwrap()
}

#[test]
fn the_probe_passes_an_honest_service_and_finds_what_it_honours() {
    let fake = Fake::start(S3Mode::default());
    fake.put("Cofre/antigo.md", b"ja estava la");
    fake.put("Outro/nada.md", b"fora do prefixo");
    let report = S3::new(settings(&fake)).unwrap().quick().probe().unwrap();
    assert_eq!(report.provider, "s3");
    assert_eq!((report.files, report.bytes), (1, 12));
    for cap in [
        CAP_CHECKSUM,
        CAP_DELETE_IF_MATCH,
        CAP_COPY_IF_NONE_MATCH,
        CAP_MULTIPART_CONDITIONAL,
    ] {
        assert!(
            report.caps.iter().any(|c| c == cap),
            "{cap}: {:?}",
            report.caps
        );
    }
    assert_eq!(report.deletions, Deletions::Final);
    // Nothing of ours is left, and nothing of the person's touched.
    assert_eq!(
        fake.keys(),
        vec!["Cofre/antigo.md".to_owned(), "Outro/nada.md".to_owned()]
    );
    assert!(fake.requests().iter().any(|r| r.contains(".verso-probe")));
}

#[test]
fn a_bucket_that_keeps_versions_says_so() {
    let fake = Fake::start(S3Mode {
        versioning: true,
        ..S3Mode::default()
    });
    let report = S3::new(settings(&fake)).unwrap().quick().probe().unwrap();
    assert!(matches!(report.deletions, Deletions::Kept(_)));
}

#[test]
fn the_probe_refuses_a_service_that_would_lose_an_edit() {
    type Tweak = fn(&mut S3Mode);
    let cases: [(&str, Tweak); 4] = [
        ("If-None-Match", |m| m.ignore_if_none_match = true),
        ("If-Match", |m| m.ignore_if_match = true),
        ("conditional", |m| m.not_implemented = true),
        ("If-Match on a delete", |m| m.ignore_delete_if_match = true),
    ];
    for (needle, tweak) in cases {
        let mut m = S3Mode::default();
        tweak(&mut m);
        let fake = Fake::start(m);
        let e = S3::new(settings(&fake))
            .unwrap()
            .quick()
            .probe()
            .unwrap_err();
        assert_eq!(e.kind, RemoteErrorKind::Refused, "{needle}: {e}");
        assert!(e.message.contains(needle), "{needle}: {e}");
        // A service with no conditional delete is refused with its own
        // reason, for the window to say (I-3).
        assert_eq!(
            e.detail.as_deref() == Some(crate::DETAIL_NO_CONDITIONAL_DELETE),
            needle == "If-Match on a delete",
            "{needle}: {e:?}"
        );
        assert!(fake.keys().is_empty(), "{needle}: {:?}", fake.keys());
    }
}

#[test]
fn what_a_service_does_not_honour_is_noted_not_refused() {
    let fake = Fake::start(S3Mode {
        checksum: false,
        ignore_copy_conditions: true,
        ignore_multipart_conditions: true,
        ..S3Mode::default()
    });
    let report = S3::new(settings(&fake)).unwrap().quick().probe().unwrap();
    assert_eq!(report.caps, [CAP_DELETE_IF_MATCH], "{:?}", report.caps);
    assert!(report.notes.len() >= 2, "{:?}", report.notes);
}

#[test]
fn a_wrong_secret_or_key_or_bucket_is_said() {
    let fake = Fake::start(S3Mode::default());
    let wrong = |f: fn(&mut Settings)| {
        let mut s = settings(&fake);
        f(&mut s);
        S3::new(s).unwrap().quick().list(None).unwrap_err()
    };
    let e = wrong(|s| s.secret = "outra".into());
    assert_eq!(e.kind, RemoteErrorKind::Refused);
    assert!(e.message.starts_with("cloud sign-in refused"), "{e}");
    assert!(!e.message.contains("outra"));
    assert!(
        wrong(|s| s.access = "AKIAOUTRA".into())
            .message
            .contains("does not know")
    );
    assert!(
        wrong(|s| s.bucket = "naoexiste".into())
            .message
            .contains("bucket")
    );
}

#[test]
fn listing_pages_through_the_prefix_and_hides_ours() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    for i in 0..5 {
        fake.put(&format!("Cofre/pasta/n{i}.md"), b"x");
    }
    fake.put("Cofre/.verso-probe/x", b"x");
    fake.put("Cofre/.verso-tmp/y", b"x");
    fake.put("Cofre/vazia/", b"");
    fake.put("Fora/z.md", b"x");
    let listing = s.list(None).unwrap();
    assert!(listing.full && listing.cursor.is_none());
    let mut paths: Vec<_> = listing
        .changes
        .iter()
        .map(|c| match c {
            Change::Present(e) => e.path.clone(),
            _ => panic!(),
        })
        .collect();
    paths.sort();
    assert_eq!(
        paths,
        (0..5).map(|i| format!("pasta/n{i}.md")).collect::<Vec<_>>()
    );
}

#[test]
fn a_write_is_conditional_on_the_version() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    let first = put(&s, "Notas/a & b.md", &Condition::Absent, b"um").unwrap();
    assert_eq!(fake.get("Cofre/Notas/a & b.md").unwrap(), b"um");
    assert_eq!(first.version, version_of(&s, "Notas/a & b.md"));
    // The same name as a new file: changed.
    assert_eq!(
        put(&s, "Notas/a & b.md", &Condition::Absent, b"dois")
            .unwrap_err()
            .kind,
        RemoteErrorKind::Changed
    );
    // Replaced against the right version.
    let second = put(
        &s,
        "Notas/a & b.md",
        &Condition::Version(first.version.clone()),
        b"dois",
    )
    .unwrap();
    // The old version no longer guards a write.
    assert_eq!(
        put(
            &s,
            "Notas/a & b.md",
            &Condition::Version(first.version),
            b"tres"
        )
        .unwrap_err()
        .kind,
        RemoteErrorKind::Changed
    );
    assert_eq!(fake.get("Cofre/Notas/a & b.md").unwrap(), b"dois");
    assert_eq!(second.version, version_of(&s, "Notas/a & b.md"));
    assert!(fake.writes().iter().all(agrees));
}

#[test]
fn an_object_carries_its_hash_so_another_device_need_not_read_it() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    put(&s, "a.md", &Condition::Absent, b"conteudo").unwrap();
    let before = fake.requests().len();
    let (version, hash) = s.fingerprint("a.md").unwrap();
    assert_eq!(hash, sha(b"conteudo"));
    assert_eq!(version, version_of(&s, "a.md"));
    let asked: Vec<_> = fake.requests()[before..]
        .iter()
        .filter(|r| r.starts_with("GET /bucket/Cofre/a.md"))
        .cloned()
        .collect();
    assert!(asked.is_empty(), "{asked:?}");
    // An object put by another tool has none: it is read.
    fake.put("Cofre/b.md", b"de fora");
    assert_eq!(s.fingerprint("b.md").unwrap().1, sha(b"de fora"));
    assert_eq!(
        s.fingerprint("nada.md").unwrap_err().kind,
        RemoteErrorKind::NotFound
    );
}

#[test]
fn a_read_gives_the_bytes_the_version_and_the_services_checksum() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    put(&s, "a.md", &Condition::Absent, b"conteudo").unwrap();
    let mut sink = Collect::default();
    let read = s.read("a.md", &mut sink).unwrap();
    assert_eq!(sink.0, b"conteudo");
    assert_eq!(read.hash.as_deref(), Some(sha(b"conteudo").as_str()));
    assert_eq!(read.version, version_of(&s, "a.md"));
    assert_eq!(
        s.read("x.md", &mut sink).unwrap_err().kind,
        RemoteErrorKind::NotFound
    );
}

#[test]
fn a_large_file_goes_up_in_parts_and_completes_against_the_version() {
    let fake = Fake::start(S3Mode::default());
    let probe = S3::new(Settings {
        single_max: 10,
        part_size: 8,
        ..settings(&fake)
    })
    .unwrap()
    .quick();
    let caps = probe.probe().unwrap().caps;
    let s = S3::new(Settings {
        single_max: 10,
        part_size: 8,
        caps,
        ..settings(&fake)
    })
    .unwrap()
    .quick();
    let bytes: Vec<u8> = (0..30_u8).collect();
    let first = put(&s, "grande.bin", &Condition::Absent, &bytes).unwrap();
    assert_eq!(fake.get("Cofre/grande.bin").unwrap(), bytes);
    assert!(first.version.contains("mp-"));
    // Complete against a stale version: the service says so in a 200 and
    // in a 412; either is a change there.
    let other = vec![9_u8; 25];
    assert_eq!(
        put(
            &s,
            "grande.bin",
            &Condition::Version("\"velha\"".into()),
            &other
        )
        .unwrap_err()
        .kind,
        RemoteErrorKind::Changed
    );
    assert_eq!(
        put(&s, "grande.bin", &Condition::Absent, &other)
            .unwrap_err()
            .kind,
        RemoteErrorKind::Changed
    );
    assert_eq!(fake.get("Cofre/grande.bin").unwrap(), bytes);
    let again = put(&s, "grande.bin", &Condition::Version(first.version), &other).unwrap();
    assert_eq!(fake.get("Cofre/grande.bin").unwrap(), other);
    // Its hash is kept as metadata, so no one need read it to know it.
    assert_eq!(
        s.fingerprint("grande.bin").unwrap(),
        (again.version, sha(&other))
    );
    assert!(fake.writes().iter().all(agrees));
}

#[test]
fn a_large_file_on_a_service_that_cannot_complete_conditionally_goes_by_a_copy() {
    let fake = Fake::start(S3Mode {
        ignore_multipart_conditions: true,
        ..S3Mode::default()
    });
    let caps = S3::new(Settings {
        single_max: 10,
        part_size: 8,
        ..settings(&fake)
    })
    .unwrap()
    .quick()
    .probe()
    .unwrap()
    .caps;
    assert!(!caps.iter().any(|c| c == CAP_MULTIPART_CONDITIONAL));
    assert!(caps.iter().any(|c| c == CAP_COPY_IF_NONE_MATCH));
    let s = S3::new(Settings {
        single_max: 10,
        part_size: 8,
        caps,
        ..settings(&fake)
    })
    .unwrap()
    .quick();
    let bytes: Vec<u8> = (0..30_u8).collect();
    let first = put(&s, "grande.bin", &Condition::Absent, &bytes).unwrap();
    assert_eq!(fake.get("Cofre/grande.bin").unwrap(), bytes);
    // The temporary key is gone.
    assert_eq!(fake.keys(), vec!["Cofre/grande.bin".to_owned()]);
    let other = vec![9_u8; 25];
    assert_eq!(
        put(&s, "grande.bin", &Condition::Absent, &other)
            .unwrap_err()
            .kind,
        RemoteErrorKind::Changed
    );
    assert_eq!(
        put(
            &s,
            "grande.bin",
            &Condition::Version("\"velha\"".into()),
            &other
        )
        .unwrap_err()
        .kind,
        RemoteErrorKind::Changed
    );
    assert_eq!(fake.get("Cofre/grande.bin").unwrap(), bytes);
    assert_eq!(fake.keys(), vec!["Cofre/grande.bin".to_owned()]);
    put(&s, "grande.bin", &Condition::Version(first.version), &other).unwrap();
    assert_eq!(fake.get("Cofre/grande.bin").unwrap(), other);
    // Our own keys (the probe's, the temporary one) are not the person's;
    // every write to a name of theirs agrees.
    assert!(
        fake.writes()
            .iter()
            .filter(|w| !w.path.contains(".verso-"))
            .all(agrees)
    );
}

#[test]
fn a_large_file_on_a_service_with_no_safe_way_is_listed_not_sent() {
    let fake = Fake::start(S3Mode {
        ignore_multipart_conditions: true,
        ignore_copy_conditions: true,
        ..S3Mode::default()
    });
    let s = S3::new(Settings {
        single_max: 10,
        part_size: 8,
        caps: Vec::new(),
        ..settings(&fake)
    })
    .unwrap()
    .quick();
    let e = put(&s, "grande.bin", &Condition::Absent, &[1_u8; 30]).unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Failed);
    assert!(e.message.contains("without risking"), "{e}");
    assert!(fake.keys().is_empty());
}

#[test]
fn a_delete_and_a_rename_hold_to_the_version() {
    for ignore in [false, true] {
        let fake = Fake::start(S3Mode {
            ignore_delete_if_match: ignore,
            ..S3Mode::default()
        });
        // A service with no conditional delete is refused at connection;
        // one connected before that was decided still deletes by looking at
        // the file first.
        let s = if ignore {
            S3::new(settings(&fake)).unwrap().quick()
        } else {
            connect(&fake)
        };
        put(&s, "a.md", &Condition::Absent, b"um").unwrap();
        put(&s, "b.md", &Condition::Absent, b"dois").unwrap();
        let (va, vb) = (version_of(&s, "a.md"), version_of(&s, "b.md"));
        let stale = Condition::Version("\"velha\"".into());
        assert_eq!(
            s.delete("a.md", &stale).unwrap_err().kind,
            RemoteErrorKind::Changed,
            "{ignore}"
        );
        assert_eq!(
            s.rename("a.md", "c.md", &stale).unwrap_err().kind,
            RemoteErrorKind::Changed
        );
        assert!(fake.get("Cofre/a.md").is_some());
        // A name that is taken.
        assert_eq!(
            s.rename("a.md", "b.md", &Condition::Version(va.clone()))
                .unwrap_err()
                .kind,
            RemoteErrorKind::Exists
        );
        assert_eq!(fake.get("Cofre/b.md").unwrap(), b"dois");
        let moved = s
            .rename("a.md", "pasta/c.md", &Condition::Version(va))
            .unwrap();
        assert_eq!(moved.path, "pasta/c.md");
        assert!(fake.get("Cofre/a.md").is_none());
        assert_eq!(fake.get("Cofre/pasta/c.md").unwrap(), b"um");
        // The moved file still carries its hash.
        assert_eq!(s.fingerprint("pasta/c.md").unwrap().1, sha(b"um"));
        s.delete("b.md", &Condition::Version(vb.clone())).unwrap();
        assert!(fake.get("Cofre/b.md").is_none());
        s.delete("b.md", &Condition::Version(vb)).unwrap();
    }
}

#[test]
fn a_service_that_says_slow_down_is_waited_for() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    fake.throttle(3);
    put(&s, "a.md", &Condition::Absent, b"um").unwrap();
    fake.throttle(100);
    assert_eq!(
        s.list(None).unwrap_err().kind,
        RemoteErrorKind::RateLimited(Some(0))
    );
    fake.throttle(0);
    assert_eq!(fake.get("Cofre/a.md").unwrap(), b"um");
}

#[test]
fn names_a_key_cannot_hold_are_refused_and_the_rest_goes_up_composed() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    let long = format!("{}.md", "x".repeat(950));
    assert_eq!(
        put(&s, &long, &Condition::Absent, b"x").unwrap_err().kind,
        RemoteErrorKind::NameInvalid
    );
    assert_eq!(
        put(&s, ".verso-tmp/a", &Condition::Absent, b"x")
            .unwrap_err()
            .kind,
        RemoteErrorKind::NameInvalid
    );
    let w = put(&s, "Cafe\u{301}.md", &Condition::Absent, b"x").unwrap();
    assert_eq!(w.path, "Caf\u{e9}.md");
    assert!(fake.get("Cofre/Caf\u{e9}.md").is_some());
}

#[test]
fn the_address_must_be_one_a_secret_may_travel_to() {
    let with = |endpoint: &str, plain_http: bool| {
        S3::new(Settings {
            endpoint: endpoint.to_owned(),
            bucket: "b".to_owned(),
            plain_http,
            ..Settings::default()
        })
        .err()
    };
    assert_eq!(
        with("http://s3.example.com", true)
            .unwrap()
            .detail
            .as_deref(),
        Some("plain_http_refused")
    );
    assert_eq!(
        with("http://localhost:9000", false)
            .unwrap()
            .detail
            .as_deref(),
        Some("plain_http_unconfirmed")
    );
    assert!(with("https://s3.example.com/bucket", false).is_some());
    assert!(with("https://key:secret@s3.example.com", false).is_some());
    assert!(with("http://localhost:9000", true).is_none());
    assert!(with("https://minio.example.com:9000", false).is_none());
    assert!(
        S3::new(Settings {
            bucket: String::new(),
            ..Settings::default()
        })
        .is_err()
    );
}

#[test]
fn aws_is_addressed_by_region_and_a_dotted_bucket_in_the_path() {
    let url = |bucket: &str| {
        let s = S3::new(Settings {
            bucket: bucket.to_owned(),
            region: "sa-east-1".to_owned(),
            access: "a".to_owned(),
            secret: "b".to_owned(),
            ..Settings::default()
        })
        .unwrap();
        (s.origin.to_string(), s.base_path)
    };
    assert_eq!(
        url("meu-cofre"),
        (
            "https://meu-cofre.s3.sa-east-1.amazonaws.com/".to_owned(),
            String::new()
        )
    );
    assert_eq!(
        url("meu.cofre"),
        (
            "https://s3.sa-east-1.amazonaws.com/".to_owned(),
            "/meu.cofre".to_owned()
        )
    );
}

#[test]
fn an_object_is_asked_for_by_itself() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    put(&s, "a.md", &Condition::Absent, b"um").unwrap();
    assert!(s.exists("a.md").unwrap());
    assert!(!s.exists("b.md").unwrap());
    fake.hide("Cofre/a.md");
    assert!(s.list(None).unwrap().changes.is_empty());
    assert!(s.exists("a.md").unwrap());
}

/// A client that sends a file of more than ten bytes in parts of eight.
fn connect_parts(fake: &Fake) -> S3 {
    let small = |caps: Vec<String>| Settings {
        single_max: 10,
        part_size: 8,
        caps,
        ..settings(fake)
    };
    let caps = S3::new(small(Vec::new()))
        .unwrap()
        .quick()
        .probe()
        .unwrap()
        .caps;
    S3::new(small(caps)).unwrap().quick()
}

/// The ETag the service gave the last write of `key` that was ours.
fn etag_of_last_write(fake: &Fake, key: &str) -> String {
    fake.writes()
        .into_iter()
        .filter(|w| w.path == key)
        .rev()
        .nth(1)
        .unwrap()
        .etag
}

#[test]
fn a_write_answers_with_the_version_it_made_not_the_one_that_landed_after_it() {
    // Another device's write, made against our version, lands between our
    // PUT and our HEAD, with as many bytes as ours: the size cannot tell.
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    fake.after("PUT", "Cofre/a.md", b"ou");
    let written = put(&s, "a.md", &Condition::Absent, b"um").unwrap();
    assert_eq!(fake.get("Cofre/a.md").unwrap(), b"ou");
    let ours = etag_of_last_write(&fake, "Cofre/a.md");
    assert_eq!(written.version, ours, "the version of our bytes");
    assert_ne!(written.version, version_of(&s, "a.md"));
    // The same through a multipart upload.
    let fake = Fake::start(S3Mode::default());
    let s = connect_parts(&fake);
    let bytes = vec![1_u8; 30];
    fake.after("POST", "Cofre/g.bin", &[2_u8; 30]);
    let written = put(&s, "g.bin", &Condition::Absent, &bytes).unwrap();
    assert_eq!(fake.get("Cofre/g.bin").unwrap(), vec![2_u8; 30]);
    assert_eq!(written.version, etag_of_last_write(&fake, "Cofre/g.bin"));
    assert_ne!(written.version, version_of(&s, "g.bin"));
}

#[test]
fn a_rename_never_deletes_a_name_that_another_device_wrote_after_the_copy() {
    let fake = Fake::start(S3Mode::default());
    let s = connect(&fake);
    let a = put(&s, "a.md", &Condition::Absent, b"um").unwrap();
    // Another device sees the copy in a listing and writes against it.
    fake.after("PUT", "Cofre/c.md", b"theirs, longer");
    let e = s
        .rename("a.md", "c.md", &Condition::Version(a.version))
        .unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Changed, "{e}");
    assert_eq!(fake.get("Cofre/c.md").unwrap(), b"theirs, longer");
    assert_eq!(fake.get("Cofre/a.md").unwrap(), b"um");
    assert!(
        fake.removed().iter().all(|r| !r.path.ends_with("c.md")),
        "{:?}",
        fake.removed()
    );
}

#[test]
fn a_bad_copy_is_deleted_only_against_its_own_version_or_left_alone() {
    // With a conditional delete: gone, and only if it is still the copy.
    let fake = Fake::start(S3Mode {
        corrupt_copy: true,
        ..S3Mode::default()
    });
    let s = connect(&fake);
    let a = put(&s, "a.md", &Condition::Absent, b"um").unwrap();
    let e = s
        .rename("a.md", "c.md", &Condition::Version(a.version.clone()))
        .unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Failed, "{e}");
    assert!(fake.get("Cofre/c.md").is_none());
    assert_eq!(fake.get("Cofre/a.md").unwrap(), b"um");
    let removed: Vec<_> = fake
        .removed()
        .into_iter()
        .filter(|r| !r.path.contains(".verso-"))
        .collect();
    assert_eq!(removed.len(), 1, "{removed:?}");
    assert!(removal_agrees(&removed[0]));
    // Without one: nothing is deleted, the duplicate stays for the next
    // pass to sort out.
    let fake = Fake::start(S3Mode {
        corrupt_copy: true,
        ignore_delete_if_match: true,
        ..S3Mode::default()
    });
    // (A connection made before such a service was refused at connection.)
    let s = S3::new(settings(&fake)).unwrap().quick();
    assert!(!s.can(CAP_DELETE_IF_MATCH));
    let a = put(&s, "a.md", &Condition::Absent, b"um").unwrap();
    let e = s
        .rename("a.md", "c.md", &Condition::Version(a.version))
        .unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Failed, "{e}");
    assert!(fake.get("Cofre/c.md").is_some());
    assert!(
        fake.requests()
            .iter()
            .all(|r| r != "DELETE /bucket/Cofre/c.md"),
        "{:?}",
        fake.requests()
    );
}

#[test]
fn a_service_without_a_conditional_delete_is_refused_at_connection() {
    // I-3, decided 2026-10-22: on a service that ignores If-Match on
    // DELETE an edit another device makes between the adapter's look and
    // its DELETE would be lost, so the person is not connected to it. The
    // check file is cleaned up even so.
    let fake = Fake::start(S3Mode {
        ignore_delete_if_match: true,
        ..S3Mode::default()
    });
    let e = S3::new(settings(&fake))
        .unwrap()
        .quick()
        .probe()
        .unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Refused, "{e}");
    assert_eq!(
        e.detail.as_deref(),
        Some(crate::DETAIL_NO_CONDITIONAL_DELETE)
    );
    assert!(e.message.contains("If-Match on a delete"), "{e}");
    assert!(fake.keys().is_empty(), "{:?}", fake.keys());
}

#[test]
fn an_answer_that_never_ends_is_cut_off_not_read_into_memory() {
    let fake = Fake::start(S3Mode {
        endless_listing: true,
        ..S3Mode::default()
    });
    let s = S3::new(settings(&fake)).unwrap().quick();
    let e = s.list(None).unwrap_err();
    assert_eq!(e.kind, RemoteErrorKind::Failed, "{e}");
    assert!(e.message.contains("too large"), "{e}");
    let fake = Fake::start(S3Mode {
        endless_error: true,
        ..S3Mode::default()
    });
    let s = S3::new(settings(&fake)).unwrap().quick();
    let e = put(&s, "a.md", &Condition::Absent, b"um").unwrap_err();
    assert!(e.message.contains("500"), "{e}");
}

#[test]
fn the_probe_leaves_no_multipart_upload_open() {
    let fake = Fake::start(S3Mode::default());
    let other = fake.start_upload("Cofre/pessoa.md");
    S3::new(settings(&fake)).unwrap().quick().probe().unwrap();
    // The probe's own uploads are all aborted, the refused one too; the
    // person's own is not ours to abort.
    assert_eq!(fake.open_uploads(), 1);
    let _ = other;
    // A service that honours no condition completes both: none open.
    let fake = Fake::start(S3Mode {
        ignore_multipart_conditions: true,
        ..S3Mode::default()
    });
    S3::new(settings(&fake)).unwrap().quick().probe().unwrap();
    assert_eq!(fake.open_uploads(), 0);
}

#[test]
fn the_probes_cleanup_aborts_open_uploads_under_its_key_and_only_there() {
    let fake = Fake::start(S3Mode::default());
    fake.start_upload("Cofre/.verso-probe/x-multi");
    fake.start_upload("Cofre/.verso-probe/outro-multi");
    fake.start_upload("Cofre/pessoa.md");
    S3::new(settings(&fake))
        .unwrap()
        .quick()
        .abort_uploads_under("Cofre/.verso-probe/x");
    assert_eq!(fake.open_uploads(), 2);
}
