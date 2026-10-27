// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A placeholder sync already has a copy of (ADR 0043, decided 2026-10-27,
//! item b): the provider sent the file back to the cloud after it crossed.
//! It is held apart like any placeholder — held at its base hash, so never
//! a deletion on the server nor a change sent up (item c), and a change
//! made to it elsewhere waits — but nothing is asked of the person: it is
//! counted apart from the files that wait for them.

use std::collections::BTreeMap;

use verso_contract::SyncRefused;
use verso_core::sync::{FileState, Files};

/// The reason a placeholder with a base is held apart under, inside a
/// pass. It never reaches the window as a refusal: [`split`] takes it out.
pub(super) const REASON: &str = "cloud_only";

/// The reason to hold a path apart under: a placeholder whose path has a
/// base (`in_base`) is [`REASON`], any other reason stands.
pub(super) fn reason(reason: &str, in_base: bool) -> &str {
    if reason == "placeholder" && in_base {
        REASON
    } else {
        reason
    }
}

/// The name a placeholder stands for. The older `.Name.ext.icloud` form is
/// listed under its stub's name; when the real name (the stub's own folder,
/// the leading dot and the `.icloud` taken off) has a base, the file is that
/// one — synced before, sent back to the cloud — and is held under it, once.
pub(super) fn standing(path: &str, in_base: impl Fn(&str) -> bool) -> String {
    let (dir, name) = path.rsplit_once('/').map_or(("", path), |(d, n)| (d, n));
    let real = name
        .strip_prefix('.')
        .and_then(|n| n.strip_suffix(".icloud"))
        .filter(|n| !n.is_empty());
    match real {
        Some(n) if dir.is_empty() && in_base(n) => n.to_owned(),
        Some(n) if !dir.is_empty() && in_base(&format!("{dir}/{n}")) => format!("{dir}/{n}"),
        _ => path.to_owned(),
    }
}

/// Hold `path` apart: nothing is done to it in this pass. A path with a base
/// goes into `files` at its base hash, so it is never a deletion nor a change
/// to send (ADR 0043 item c); a placeholder with a base is [`REASON`].
pub(super) fn hold(
    base: &BTreeMap<String, String>,
    (path, why, message): (&str, &str, String),
    files: &mut Files,
    apart: &mut BTreeMap<String, SyncRefused>,
) {
    if let Some(b) = base.get(path) {
        files.insert(
            path.to_owned(),
            FileState {
                hash: b.clone(),
                size: 0,
            },
        );
    }
    apart.insert(
        path.to_owned(),
        SyncRefused {
            path: path.to_owned(),
            reason: reason(why, base.contains_key(path)).to_owned(),
            message,
        },
    );
}

/// The files held apart, as the window gets them: those that wait for the
/// person, and the paths that are only in the cloud on this computer while
/// the server has them. A cloud-only path the server no longer lists (it was
/// deleted there) is not "held by the server": it waits for the person like
/// any placeholder, and downloading it lets the deletion reach this
/// computer by the usual rules instead of staying hidden.
pub(super) fn split(
    apart: BTreeMap<String, SyncRefused>,
    server: &Files,
) -> (Vec<SyncRefused>, Vec<String>) {
    let (mut waiting, mut cloud) = (Vec::new(), Vec::new());
    for mut f in apart.into_values() {
        if f.reason != REASON {
            waiting.push(f);
        } else if server.contains_key(&f.path) {
            cloud.push(f.path);
        } else {
            "placeholder".clone_into(&mut f.reason);
            "not on this computer: on-demand storage; deleted on the server"
                .clone_into(&mut f.message);
            waiting.push(f);
        }
    }
    (waiting, cloud)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_of(paths: &[&str]) -> BTreeMap<String, String> {
        paths
            .iter()
            .map(|p| ((*p).to_owned(), format!("hash-of-{p}")))
            .collect()
    }

    fn server_of(paths: &[&str]) -> Files {
        paths
            .iter()
            .map(|p| {
                (
                    (*p).to_owned(),
                    FileState {
                        hash: String::new(),
                        size: 0,
                    },
                )
            })
            .collect()
    }

    /// The modern form: the walk lists the real name, `placeholder` true.
    #[test]
    fn a_dataless_file_with_a_base_is_held_at_its_hash_and_cloud_only() {
        let (mut files, mut apart) = (Files::new(), BTreeMap::new());
        let base = base_of(&["Mapas/a.png"]);
        hold(
            &base,
            ("Mapas/a.png", "placeholder", String::new()),
            &mut files,
            &mut apart,
        );
        assert_eq!(files["Mapas/a.png"].hash, "hash-of-Mapas/a.png");
        assert_eq!(apart["Mapas/a.png"].reason, REASON);
        let (waiting, cloud) = split(apart, &server_of(&["Mapas/a.png"]));
        assert!(waiting.is_empty());
        assert_eq!(cloud, ["Mapas/a.png"]);
    }

    #[test]
    fn a_dataless_file_without_a_base_is_pending_and_not_in_files() {
        let (mut files, mut apart) = (Files::new(), BTreeMap::new());
        hold(
            &base_of(&[]),
            ("novo.png", "placeholder", String::new()),
            &mut files,
            &mut apart,
        );
        assert!(files.is_empty());
        let (waiting, cloud) = split(apart, &server_of(&[]));
        assert!(cloud.is_empty());
        assert_eq!(waiting[0].reason, "placeholder");
    }

    #[test]
    fn a_cloud_only_file_the_server_deleted_waits_for_the_person() {
        let (mut files, mut apart) = (Files::new(), BTreeMap::new());
        hold(
            &base_of(&["a.md"]),
            ("a.md", "placeholder", String::new()),
            &mut files,
            &mut apart,
        );
        let (waiting, cloud) = split(apart, &server_of(&[]));
        assert!(cloud.is_empty(), "the server does not have it any more");
        assert_eq!(waiting.len(), 1);
        assert_eq!(waiting[0].reason, "placeholder");
    }

    #[test]
    fn an_old_form_stub_stands_for_a_synced_file_under_its_real_name() {
        let base = base_of(&["Nota.md", "Pasta/Mapa.png"]);
        let of = |p: &str| standing(p, |n| base.contains_key(n));
        assert_eq!(of(".Nota.md.icloud"), "Nota.md");
        assert_eq!(of("Pasta/.Mapa.png.icloud"), "Pasta/Mapa.png");
        // Never synced: the stub stays what it is.
        assert_eq!(of(".Nova.md.icloud"), ".Nova.md.icloud");
        assert_eq!(of("Pasta/.Nova.md.icloud"), "Pasta/.Nova.md.icloud");
        assert_eq!(of("Nota.md"), "Nota.md");
        assert_eq!(of(".icloud"), ".icloud");
    }

    #[test]
    fn only_a_placeholder_with_a_base_is_cloud_only() {
        assert_eq!(reason("placeholder", true), REASON);
        assert_eq!(reason("placeholder", false), "placeholder");
        assert_eq!(reason("failed", true), "failed");
        assert_eq!(reason("too_large", true), "too_large");
    }

    #[test]
    fn the_window_gets_cloud_only_apart_from_what_waits() {
        let mut apart = BTreeMap::new();
        let base = base_of(&["a.md"]);
        hold(
            &base,
            ("a.md", "placeholder", String::new()),
            &mut Files::new(),
            &mut apart,
        );
        hold(
            &base,
            ("b.md", "placeholder", String::new()),
            &mut Files::new(),
            &mut apart,
        );
        hold(
            &base,
            ("c.md", "failed", String::new()),
            &mut Files::new(),
            &mut apart,
        );
        let (waiting, cloud) = split(apart, &server_of(&["a.md"]));
        assert_eq!(cloud, ["a.md"]);
        let paths: Vec<&str> = waiting.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["b.md", "c.md"]);
    }
}
