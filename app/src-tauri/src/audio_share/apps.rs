// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which applications make the sound a system reports (ADR 0116 item 17),
//! the pure half of the Mac's source list: the system tells the processes
//! that have an audio object (a browser's sound comes from a helper
//! process, not from the browser's own), the workspace tells the
//! applications that run, and this matches the two. No system call here, so
//! it is tested everywhere; `macos_source.rs` feeds it.

use verso_contract::{AudioSource, AudioSourceKind, SOURCE_NAME_MOST, name_ok};

/// The id of "everything this computer plays".
pub const SYSTEM_ID: &str = "system";

/// The prefix of an application's id; the rest is its bundle identifier.
pub const APP_PREFIX: &str = "app:";

/// A process the audio system knows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioProc {
    /// Its object in the audio system, what a tap names.
    pub object: u32,
    pub pid: i32,
    pub bundle_id: String,
}

/// An application that runs, as the workspace lists it (the ones with a
/// window and a Dock icon).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunApp {
    pub pid: i32,
    pub bundle_id: String,
    /// The name the person knows it by.
    pub name: String,
}

/// An application and the audio objects that are its.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Group {
    pub bundle_id: String,
    pub name: String,
    pub objects: Vec<u32>,
}

/// Whether `p` is `app`'s: the same process, the same bundle, or a helper
/// whose bundle identifier extends the application's
/// (`com.google.Chrome.helper` for `com.google.Chrome`).
fn belongs(p: &AudioProc, app: &RunApp) -> bool {
    p.pid == app.pid
        || (!app.bundle_id.is_empty()
            && (p.bundle_id == app.bundle_id
                || p.bundle_id
                    .strip_prefix(app.bundle_id.as_str())
                    .is_some_and(|rest| rest.starts_with('.'))))
}

/// The applications that have audio objects, by display name, without
/// `own` (Verso itself: the person shares other things). A process goes to
/// the most specific application that claims it. Sorted by name.
#[must_use]
pub fn group(procs: &[AudioProc], apps: &[RunApp], own_pid: i32, own_bundle: &str) -> Vec<Group> {
    let mut groups: Vec<Group> = Vec::new();
    for p in procs {
        let best = apps
            .iter()
            .filter(|a| belongs(p, a))
            .max_by_key(|a| (a.pid == p.pid, a.bundle_id.len()));
        let Some(app) = best else { continue };
        if app.pid == own_pid || (!own_bundle.is_empty() && app.bundle_id == own_bundle) {
            continue;
        }
        match groups.iter_mut().find(|g| g.bundle_id == app.bundle_id) {
            Some(g) => g.objects.push(p.object),
            None => groups.push(Group {
                bundle_id: app.bundle_id.clone(),
                name: clean(&app.name),
                objects: vec![p.object],
            }),
        }
    }
    groups.retain(|g| name_ok(&g.name));
    groups.sort_by_key(|g| g.name.to_lowercase());
    groups
}

/// A name the contract accepts: control characters out, cut to length.
fn clean(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_control())
        .take(SOURCE_NAME_MOST)
        .collect::<String>()
        .trim()
        .to_owned()
}

/// The list the window shows: the system first, then the applications.
#[must_use]
pub fn sources(groups: &[Group]) -> Vec<AudioSource> {
    let mut out = vec![AudioSource {
        id: SYSTEM_ID.to_owned(),
        name: "Everything this computer plays".to_owned(),
        kind: AudioSourceKind::System,
    }];
    out.extend(groups.iter().map(|g| AudioSource {
        id: format!("{APP_PREFIX}{}", g.bundle_id),
        name: g.name.clone(),
        kind: AudioSourceKind::App,
    }));
    out
}

/// The audio objects that are `own_pid`'s or descend from it (by the parent
/// of `parent_of`), which "everything" leaves out: Verso's dice and chimes
/// are not sent back to the table.
#[must_use]
pub fn own_objects(
    procs: &[AudioProc],
    own_pid: i32,
    parent_of: impl Fn(i32) -> Option<i32>,
) -> Vec<u32> {
    procs
        .iter()
        .filter(|p| {
            let mut at = p.pid;
            // A bounded climb: a loop in the table cannot hold us.
            for _ in 0..64 {
                if at == own_pid {
                    return true;
                }
                match parent_of(at) {
                    Some(up) if up > 1 && up != at => at = up,
                    _ => return false,
                }
            }
            false
        })
        .map(|p| p.object)
        .collect()
}

/// The bundle identifier an application id names, or `None`.
#[must_use]
pub fn bundle_of(id: &str) -> Option<&str> {
    id.strip_prefix(APP_PREFIX).filter(|b| !b.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(object: u32, pid: i32, bundle: &str) -> AudioProc {
        AudioProc {
            object,
            pid,
            bundle_id: bundle.to_owned(),
        }
    }

    fn app(pid: i32, bundle: &str, name: &str) -> RunApp {
        RunApp {
            pid,
            bundle_id: bundle.to_owned(),
            name: name.to_owned(),
        }
    }

    #[test]
    fn helpers_belong_to_their_application_and_apps_are_sorted_by_name() {
        let procs = [
            proc(10, 100, "com.spotify.client"),
            proc(11, 201, "com.google.Chrome.helper"),
            proc(12, 202, "com.google.Chrome.helper.Renderer"),
            proc(13, 300, "com.apple.Music"),
        ];
        let apps = [
            app(100, "com.spotify.client", "Spotify"),
            app(200, "com.google.Chrome", "Google Chrome"),
            app(300, "com.apple.Music", "Music"),
            app(400, "com.apple.Notes", "Notes"),
        ];
        let groups = group(&procs, &apps, 1, "com.versomd.app");
        let names: Vec<_> = groups.iter().map(|g| g.name.as_str()).collect();
        assert_eq!(names, ["Google Chrome", "Music", "Spotify"]);
        assert_eq!(groups[0].objects, [11, 12]);
    }

    #[test]
    fn a_bundle_that_only_starts_the_same_does_not_belong() {
        let procs = [proc(1, 5, "com.google.ChromeRemote")];
        let apps = [app(6, "com.google.Chrome", "Google Chrome")];
        assert!(group(&procs, &apps, 1, "").is_empty());
    }

    #[test]
    fn verso_itself_is_not_offered_and_a_process_without_an_app_is_left_out() {
        let procs = [
            proc(1, 50, "com.versomd.app"),
            proc(2, 51, "com.apple.coreaudiod"),
        ];
        let apps = [app(50, "com.versomd.app", "Verso")];
        assert!(group(&procs, &apps, 50, "com.versomd.app").is_empty());
        assert!(group(&procs, &apps, 1, "com.versomd.app").is_empty());
    }

    #[test]
    fn the_list_starts_with_everything_and_names_apps_by_bundle() {
        let g = [Group {
            bundle_id: "com.spotify.client".into(),
            name: "Spotify".into(),
            objects: vec![1],
        }];
        let list = sources(&g);
        assert_eq!(list[0].id, "system");
        assert_eq!(list[0].kind, AudioSourceKind::System);
        assert_eq!(list[1].id, "app:com.spotify.client");
        assert_eq!(list[1].kind, AudioSourceKind::App);
        assert!(list.iter().all(|s| name_ok(&s.name)));
        assert_eq!(
            bundle_of("app:com.spotify.client"),
            Some("com.spotify.client")
        );
        assert_eq!(bundle_of("app:"), None);
        assert_eq!(bundle_of("system"), None);
    }

    #[test]
    fn a_display_name_is_made_fit_for_the_contract() {
        let procs = [proc(1, 5, "x.y")];
        let long = format!("A\u{7}{}", "b".repeat(200));
        let apps = [app(5, "x.y", &long)];
        let g = group(&procs, &apps, 1, "");
        assert_eq!(g.len(), 1);
        assert!(name_ok(&g[0].name));
        assert!(!g[0].name.contains('\u{7}'));
    }

    #[test]
    fn what_verso_started_is_found_down_the_parents() {
        // 7 is Verso; 70 its child; 700 its grandchild; 9 another tree.
        let procs = [
            proc(1, 7, "a"),
            proc(2, 70, "b"),
            proc(3, 700, "c"),
            proc(4, 9, "d"),
        ];
        let parent = |pid: i32| match pid {
            70 => Some(7),
            700 => Some(70),
            9 => Some(1),
            _ => None,
        };
        assert_eq!(own_objects(&procs, 7, parent), [1, 2, 3]);
        // A loop in the table ends.
        assert!(own_objects(&procs, 1234, |pid| Some(pid + 1)).is_empty());
    }
}
