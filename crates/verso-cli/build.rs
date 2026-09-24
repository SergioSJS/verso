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
    // Built again when HEAD moves: the file HEAD names, and HEAD itself.
    if let Some(dir) = git(&["rev-parse", "--absolute-git-dir"]) {
        println!("cargo:rerun-if-changed={dir}/HEAD");
        if let Some(head) = git(&["symbolic-ref", "-q", "HEAD"]) {
            println!("cargo:rerun-if-changed={dir}/{head}");
        }
    }
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
