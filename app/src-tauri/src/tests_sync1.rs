// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! This app, of sync 2, against a server of sync 1 (ADR 0079 item 5: the
//! newer side follows the version before): a file of several pieces
//! crosses both ways as base64 inside the JSON, the way of sync 1, never
//! as the binary messages of sync 2 (item 12, revised 2026-10-12). And a
//! file of several pieces between two devices of this app's own sync.

use super::tests_sync::{device, kept, on, read, serve, sync, write};

/// A file of 3 MiB and a bit: four pieces of 1 MiB.
fn big() -> Vec<u8> {
    (0..((3_u32 << 20) + 4321))
        .map(|i| u8::try_from(i % 251).unwrap())
        .collect()
}

#[test]
fn a_device_of_sync_2_sends_and_fetches_pieces_from_a_server_of_sync_1() {
    let r = serve(&[]);
    r.server.upgrade().unwrap().speak_sync(1);
    let bytes = big();

    // Sent from this computer to the server, in pieces, as base64.
    let a = device(&r, &r.owner, &[]);
    write(&a, "anexos/mapa.bin", &bytes);
    let mut la = kept(&a);
    assert!(
        !la.socket.as_ref().unwrap().binary(),
        "a server of sync 1 takes no binary pieces"
    );
    let passed = on(&a, &mut la);
    assert!(passed.actions >= 1, "{passed:?}");
    let status = a.s.status();
    assert!(status.refused.is_empty(), "{:?}", status.refused);
    assert_eq!(status.state, "synced", "{status:?}");

    // Fetched from the server by another device, in pieces, as base64.
    let b = device(&r, &r.owner, &[]);
    let mut lb = kept(&b);
    assert!(!lb.socket.as_ref().unwrap().binary());
    on(&b, &mut lb);
    assert_eq!(
        read(&b, "anexos/mapa.bin").as_deref(),
        Some(bytes.as_slice())
    );

    // Changed there and fetched back here: both ways on one connection.
    let mut changed = bytes.clone();
    changed.extend_from_slice("mais um pedaço".as_bytes());
    write(&b, "anexos/mapa.bin", &changed);
    on(&b, &mut lb);
    super::tests_sync::changed(&a, &[]);
    on(&a, &mut la);
    assert_eq!(
        read(&a, "anexos/mapa.bin").as_deref(),
        Some(changed.as_slice())
    );
}

/// The same server, speaking its own sync again, takes binary pieces:
/// the knob is what made the difference above.
#[test]
fn the_same_server_of_sync_2_takes_binary_pieces() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[]);
    let la = kept(&a);
    assert!(la.socket.as_ref().unwrap().binary());
}

/// A file larger than a message, between two devices of this app's own
/// sync: in pieces both ways (moved here from tests_sync.rs, which is at
/// the size limit of ADR 0067).
#[test]
fn a_file_larger_than_a_message_crosses_in_pieces() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[]);
    let big: Vec<u8> = (0..(9_u32 << 20))
        .map(|i| u8::try_from(i % 251).unwrap())
        .collect();
    write(&a, "anexos/mapa.bin", &big);
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(read(&b, "anexos/mapa.bin").as_deref(), Some(big.as_slice()));
}

/// The provider sends a synced file back to the cloud (ADR 0043, decided
/// 2026-10-27, items b and c), as iCloud's older form does on any system:
/// the file's name is gone and `.Name.ext.icloud` stands in its place.
fn evict(d: &super::tests_sync::Device, path: &str) -> tempfile::NamedTempFile {
    let p = path.to_owned();
    d.ctx
        .service
        .with_key(&d.key, move |ws| {
            ws.delete_entry(&p)?;
            Ok(())
        })
        .unwrap();
    let stub = tempfile::Builder::new()
        .prefix(&format!(".{path}.icloud"))
        .rand_bytes(0)
        .tempfile_in(d._dirs.1.path())
        .unwrap();
    super::tests_sync::changed(d, &[path, &format!(".{path}.icloud")]);
    stub
}

#[test]
fn a_synced_file_sent_back_to_the_cloud_is_no_deletion_no_upload_and_asks_nothing() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Nota.md", "# Nota\n")]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let b = device(&r, &r.owner, &[]);
    let mut lb = kept(&b);
    on(&b, &mut lb);
    assert_eq!(read(&b, "Nota.md").as_deref(), Some(b"# Nota\n".as_slice()));

    // Evicted here: nothing crosses, and the server keeps its copy.
    let stub = evict(&a, "Nota.md");
    let passed = on(&a, &mut la);
    assert_eq!(passed.actions, 0, "{passed:?}");
    let status = a.s.status();
    assert_eq!(status.cloud_only, ["Nota.md"], "{status:?}");
    assert!(
        status.refused.is_empty(),
        "a file the server has asks nothing of the person, the stub included: {:?}",
        status.refused
    );
    on(&b, &mut lb);
    assert_eq!(read(&b, "Nota.md").as_deref(), Some(b"# Nota\n".as_slice()));

    // Changed elsewhere: it waits on the server, nothing is written over
    // the placeholder.
    write(&b, "Nota.md", b"# Nota, mudada\n");
    on(&b, &mut lb);
    on(&a, &mut la);
    assert!(
        !super::tests_sync::files(&a).contains(&"Nota.md".to_owned()),
        "{:?}",
        super::tests_sync::files(&a)
    );
    assert_eq!(a.s.status().cloud_only, ["Nota.md"]);
    assert!(a.s.status().refused.is_empty());

    // Back on this computer (the stub gone, the file in its place): the
    // change that waited arrives.
    drop(stub);
    super::tests_sync::changed(&a, &[".Nota.md.icloud"]);
    on(&a, &mut la);
    assert_eq!(
        read(&a, "Nota.md").as_deref(),
        Some(b"# Nota, mudada\n".as_slice())
    );
    assert!(a.s.status().cloud_only.is_empty());
    // The edit arrived on the file; no copy was set beside it.
    let all = super::tests_sync::files(&a);
    assert!(all.iter().all(|p| !p.contains("conflito")), "{all:?}");
}

#[test]
fn a_cloud_only_file_the_server_deleted_is_not_called_held_by_the_server() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Nota.md", "# Nota\n")]);
    let mut la = kept(&a);
    on(&a, &mut la);
    let b = device(&r, &r.owner, &[]);
    let mut lb = kept(&b);
    on(&b, &mut lb);
    let _stub = evict(&a, "Nota.md");
    on(&a, &mut la);
    assert_eq!(a.s.status().cloud_only, ["Nota.md"]);

    // Deleted on the server by the other device.
    b.ctx
        .service
        .with_key(&b.key, |ws| {
            ws.delete_entry("Nota.md")?;
            Ok(())
        })
        .unwrap();
    super::tests_sync::changed(&b, &["Nota.md"]);
    on(&b, &mut lb);
    on(&a, &mut la);

    // Not "the server has it": it waits for the person, the placeholder
    // is neither deleted nor hidden.
    let status = a.s.status();
    assert!(status.cloud_only.is_empty(), "{status:?}");
    assert!(
        status
            .refused
            .iter()
            .any(|f| f.path == "Nota.md" && f.reason == "placeholder"),
        "{status:?}"
    );
}

#[test]
fn a_placeholder_sync_never_sent_stays_pending_with_its_reason() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[]);
    let _stub = tempfile::Builder::new()
        .prefix(".Nova.md.icloud")
        .rand_bytes(0)
        .tempfile_in(a._dirs.1.path())
        .unwrap();
    super::tests_sync::changed(&a, &[".Nova.md.icloud"]);
    sync(&a);
    let status = a.s.status();
    assert!(status.cloud_only.is_empty(), "{status:?}");
    assert!(
        status.refused.iter().any(|f| f.reason == "placeholder"),
        "{status:?}"
    );
}
