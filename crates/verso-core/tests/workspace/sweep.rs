// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The temporary files a crash left in the folder go when a host opens it
//! as its writer (`Workspace::sweep_temporaries`, which verso-service
//! calls at every opening): in the folder and in its settings directory,
//! `.verso/`, whose temporaries the walk leaves out (ADR 0070). A file
//! that is not one stays.

use super::*;

/// A file named `name` in `dir`, made with `tempfile` (the `std::fs`
/// guardrail holds here) and kept.
#[cfg(test)]
fn kept_file(dir: &Path, name: &str) {
    Builder::new()
        .prefix(name)
        .rand_bytes(0)
        .tempfile_in(dir)
        .unwrap()
        .keep()
        .unwrap();
}

#[test]
fn a_stale_temporary_file_is_gone_after_the_opening_and_a_note_stays() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    // A process that stopped: any id but this one's.
    let other = std::process::id().wrapping_add(1).max(2);
    let stale = format!(".verso-tmp-{other}-1");
    let settings = Builder::new()
        .prefix(".verso")
        .rand_bytes(0)
        .tempdir_in(vault.path())
        .unwrap()
        .keep();
    kept_file(vault.path(), &stale);
    kept_file(&settings, &stale);
    kept_file(&settings, "settings.json");
    kept_file(vault.path(), "Nota.md");
    kept_file(vault.path(), "verso-tmp-not-ours.md");
    let listed = |dir: &Path| -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    };

    let ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    // Opening alone removes nothing: the command line and the MCP open a
    // folder beside the app and are not its writer.
    assert!(listed(vault.path()).contains(&stale));
    assert_eq!(ws.sweep_temporaries().unwrap(), 2);
    assert_eq!(
        listed(vault.path()),
        [".verso", "Nota.md", "verso-tmp-not-ours.md"]
    );
    assert_eq!(listed(&settings), ["settings.json"]);
    assert_eq!(ws.sweep_temporaries().unwrap(), 0);
}
