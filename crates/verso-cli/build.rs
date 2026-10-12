// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The commit `verso --version` names (ADR 0051): `VERSO_COMMIT` when the
//! build is given one, else git's short hash of HEAD, else "unknown" — a
//! build from a source archive has no repository. The same step as the
//! desktop host's (`app/src-tauri/build.rs`).

use std::process::Command;

fn main() {
    let commit = std::env::var("VERSO_COMMIT")
        .ok()
        .filter(|c| !c.is_empty())
        .or_else(|| git(&["rev-parse", "--short=7", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=VERSO_COMMIT={commit}");
    println!("cargo:rerun-if-env-changed=VERSO_COMMIT");
    println!("cargo:rerun-if-env-changed=VERSO_APP_NAME");
    // Built again when HEAD moves: this checkout's HEAD, and the branches
    // in the shared refs (a worktree keeps its HEAD apart; a packed ref has
    // no file of its own, and a path that may be absent would make Cargo
    // run this on every build).
    if let Some(dir) = git(&["rev-parse", "--absolute-git-dir"]) {
        println!("cargo:rerun-if-changed={dir}/HEAD");
    }
    if let Some(common) = git(&["rev-parse", "--path-format=absolute", "--git-common-dir"]) {
        println!("cargo:rerun-if-changed={common}/refs/heads");
    }
    // A commit on the checked-out branch rewrites the branch's own ref (a
    // file under refs/heads, or a line of packed-refs once the refs were
    // packed), never HEAD, and a directory's scan misses the packed form —
    // a beta reported the build before's hash on 2026-10-12. Git appends
    // to the logs of HEAD and of the branch at every move, whatever form
    // the ref is kept in: those are watched, each only when git says it
    // exists (`git reflog exists`), never by a stat of our own.
    let branch = git(&["rev-parse", "--symbolic-full-name", "HEAD"]);
    for name in std::iter::once("HEAD").chain(branch.as_deref()) {
        if git_ok(&["reflog", "exists", name]) {
            let log = format!("logs/{name}");
            if let Some(path) = git(&["rev-parse", "--path-format=absolute", "--git-path", &log]) {
                println!("cargo:rerun-if-changed={path}");
            }
        }
    }
}

/// Whether a git command succeeds (an answer with no output, such as
/// `git reflog exists`); false when git is missing or says no.
fn git_ok(args: &[&str]) -> bool {
    std::process::Command::new("git")
        .args(args)
        .output()
        .is_ok_and(|out| out.status.success())
}

/// A git command's output, trimmed; `None` when git is missing or fails.
fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8(out.stdout).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}
