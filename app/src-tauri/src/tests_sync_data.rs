// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's data files across two devices of this app's own sync, with
//! a real server (the settings' test is `tests_sync.rs`'s).

use super::tests_sync::{Device, changed, device, files, serve, sync, text};

/// The folder's data files, `.verso/layouts/<id>.json` and
/// `.verso/bundles/<id>.json` (ADR 0099 item 2, ADR 0098 item 2), travel
/// as the settings do: written on one device they arrive on the other,
/// removed there the removal comes back — and the tree and the index never
/// list them.
#[test]
fn the_folders_data_files_cross_like_the_settings() {
    use verso_core::FolderDataKind::{Bundles, Layouts};
    let r = serve(&[("Nota.md", "# Nota\n")]);
    let a = device(&r, &r.owner, &[]);
    let b = device(&r, &r.owner, &[]);
    sync(&a);
    sync(&b);
    let on = |d: &Device| d.key.clone();
    let write = |d: &Device, kind, id: &'static str, text: &'static str| {
        d.ctx
            .service
            .with_key(&on(d), move |ws| {
                Ok(ws.write_folder_data(kind, id, text, None).map(|_| ())?)
            })
            .unwrap();
        let dir = if matches!(kind, Layouts) {
            "layouts"
        } else {
            "bundles"
        };
        changed(d, &[&format!(".verso/{dir}/{id}.json")]);
    };
    let ids = |d: &Device, kind| -> Vec<String> {
        d.ctx
            .service
            .with_key(&on(d), move |ws| {
                Ok(ws
                    .list_folder_data(kind)?
                    .entries
                    .into_iter()
                    .map(|e| e.id)
                    .collect())
            })
            .unwrap()
    };
    write(&a, Layouts, "mesa", "{\"cards\": 1}");
    write(&a, Bundles, "mundo", "{\"notes\": []}");
    sync(&a);
    changed(&b, &[]);
    sync(&b);
    assert_eq!(ids(&b, Layouts), ["mesa"]);
    assert_eq!(ids(&b, Bundles), ["mundo"]);
    assert_eq!(
        text(&b, ".verso/layouts/mesa.json").as_deref(),
        Some("{\"cards\": 1}")
    );
    assert!(files(&b).iter().all(|p| !p.starts_with(".verso")));
    // Removed on B through the bin: the removal reaches A.
    b.ctx
        .service
        .with_key(&on(&b), |ws| {
            let rev = ws.read_folder_data(Layouts, "mesa")?.revision;
            Ok(ws.remove_folder_data(Layouts, "mesa", &rev).map(|_| ())?)
        })
        .unwrap();
    changed(&b, &[".verso/layouts/mesa.json"]);
    sync(&b);
    changed(&a, &[]);
    sync(&a);
    assert!(ids(&a, Layouts).is_empty());
    assert_eq!(ids(&a, Bundles), ["mundo"]);
}
