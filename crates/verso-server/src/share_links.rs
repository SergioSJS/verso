// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A rename made through a share keeps the owner's links outside it (ADR
//! 0081 item 11, decided 2026-10-12, "as Notion updates them"). The core
//! plans the rewrites over the owner's whole folder; the receiver's window
//! is shown, and writes, only the ones inside the share, and the server
//! writes the rest itself — the notes the receiver may not see, let alone
//! write. Each by the rules of a rewrite the window makes: over the
//! revision the plan read (invariant 11), atomically, never a note open
//! in a room (ADR 0073 item 7) nor one that changed since the plan, and
//! within the folder's quota (ADR 0077 item 5). The folder's change log
//! keeps each with the receiver as its author (item 9), the owner's
//! windows and devices hear of it as of any change made on the server
//! (ADR 0079 item 10), and the server's log says what was written and
//! what was not. Nothing of it crosses to the receiver: not a path, not a
//! count.

use serde_json::Value;
use verso_contract::ErrorKind;

use crate::db::covers;
use crate::scope::Scope;
use crate::state::Server;

/// A rewrite of a note outside the share: the plan's own, as the core
/// made it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outside {
    pub path: String,
    pub revision: String,
    pub after: String,
}

/// Why a note outside the share kept its links.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kept {
    /// Open in a room: someone is editing it now.
    Room,
    /// It changed on the disk since the plan read it (invariant 11).
    Changed,
    /// The folder's quota would be passed.
    Quota,
    /// The write failed; the reason is in the server's log.
    Failed,
}

impl Kept {
    const fn said(self) -> &'static str {
        match self {
            Self::Room => "open in a room",
            Self::Changed => "changed since the rename read it",
            Self::Quota => "over the folder's quota",
            Self::Failed => "not written",
        }
    }
}

/// What the server did with the notes outside the share.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Done {
    pub written: Vec<String>,
    pub kept: Vec<(String, Kept)>,
}

/// Take out of a rename's answer — its paths still the owner's — the
/// rewrites of notes outside the shared folder the receiver may write:
/// above it, beside it, and in the attachments folder shown read-only.
pub fn take_outside(scope: &Scope, answer: &mut Value) -> Vec<Outside> {
    let mut out = Vec::new();
    if let Some(list) = answer["rewrites"].as_array_mut() {
        list.retain(|w| {
            let path = w["path"].as_str().unwrap_or_default();
            if covers(&scope.root, path) {
                return true;
            }
            if let (Some(revision), Some(after)) = (w["revision"].as_str(), w["after"].as_str()) {
                out.push(Outside {
                    path: path.to_owned(),
                    revision: revision.to_owned(),
                    after: after.to_owned(),
                });
            }
            false
        });
    }
    out
}

/// Write the rewrites of the notes outside the share, for the account
/// `actor` (`by` is how the server's log names it) who renamed through the
/// share `share`. Runs on a blocking thread, outside the folder's sync
/// lock: the change log takes it.
pub fn apply(
    server: &Server,
    key: &str,
    (actor, by): (&str, &str),
    share: &str,
    rewrites: Vec<Outside>,
) -> Done {
    let mut done = Done::default();
    for w in rewrites {
        if server.rooms.has(key, &w.path) {
            done.kept.push((w.path, Kept::Room));
            continue;
        }
        let len = u64::try_from(w.after.len()).unwrap_or(u64::MAX);
        if crate::quota::check(server, key, &w.path, len).is_err() {
            done.kept.push((w.path, Kept::Quota));
            continue;
        }
        let (path, after, revision) = (w.path.clone(), w.after, w.revision);
        let written = server
            .service
            .with_key(key, move |ws| Ok(ws.write_text(&path, &after, &revision)?));
        match written {
            Ok(_) => done.written.push(w.path),
            Err(e) if e.kind == ErrorKind::Changed => done.kept.push((w.path, Kept::Changed)),
            Err(e) => {
                crate::log::warn(&format!(
                    "share {share}: the links of {} were not rewritten: {}",
                    w.path, e.message
                ));
                done.kept.push((w.path, Kept::Failed));
            }
        }
    }
    if !done.written.is_empty() {
        // The folder's log for sync, with its author (ADR 0081 item 9);
        // then the owner's windows, as after a device's change.
        crate::sync::reconcile_key(server, key, Some(actor), &done.written);
        crate::sync::told(server, key, &done.written, &[], &[]);
    }
    if !done.written.is_empty() || !done.kept.is_empty() {
        let kept: Vec<String> = done
            .kept
            .iter()
            .map(|(p, why)| format!("{p} ({})", why.said()))
            .collect();
        crate::log::info(&format!(
            "share {share}: a rename by {by} rewrote the links of {} note(s) outside the shared folder{}",
            done.written.len(),
            if kept.is_empty() {
                String::new()
            } else {
                format!("; kept as they were: {}", kept.join(", "))
            }
        ));
    }
    done
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn only_the_rewrites_outside_the_writable_share_are_taken() {
        let scope = Scope {
            share: "s".into(),
            key: "share-s".into(),
            name: "Mesa (Ana)".into(),
            root: "Mesa".into(),
            mount: Some(("Anexos".into(), "Anexos".into())),
            guard: None,
        };
        let w = |p: &str| json!({ "path": p, "revision": "r", "before": "b", "after": "a" });
        let mut answer = json!({ "path": "Mesa/x.md", "rewrites": [
            w("Mesa/a.md"), w("Segredo.md"), w("Mesa2/b.md"), w("Anexos/n.md"), w("Mesa/Sub/c.md")
        ] });
        let out = take_outside(&scope, &mut answer);
        let paths: Vec<&str> = out.iter().map(|o| o.path.as_str()).collect();
        assert_eq!(paths, ["Segredo.md", "Mesa2/b.md", "Anexos/n.md"]);
        assert_eq!(
            answer["rewrites"],
            json!([w("Mesa/a.md"), w("Mesa/Sub/c.md")])
        );
    }
}
