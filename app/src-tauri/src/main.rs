// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso-app [FOLDER]`: the window, on `FOLDER` when given;
//! `verso-app --export-bindings [FILE]` writes the TypeScript bindings and
//! exits.

// A window app on Windows, not a console one: without it, every launch of
// the installed app opened a terminal beside the window (seen 2026-10-08).
// Debug builds keep the console, for the messages a developer reads.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--export-bindings") {
        let out = args.get(1).map_or_else(
            || PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ui/src/bindings.ts"),
            PathBuf::from,
        );
        return match verso_app::export_bindings(&out) {
            Ok(()) => {
                eprintln!("verso-app: bindings written to {}", out.display());
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("verso-app: {e}");
                ExitCode::from(3)
            }
        };
    }
    // `verso-app <folder>`: open that folder (the CLI's `verso <folder>`).
    let folder = args
        .first()
        .filter(|a| !a.starts_with("--"))
        .map(PathBuf::from);
    match verso_app::run(folder) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("verso-app: {e}");
            ExitCode::from(1)
        }
    }
}
