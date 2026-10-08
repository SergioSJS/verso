// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What these tests do to the disk behind the code under test, through the
//! system's own tools: this crate's tests may not call `std::fs` (ADR 0026
//! rule 5, ADR 0029). One function per act, spelled for Unix and for
//! Windows, where the suite runs too (ADR 0069).

use std::path::Path;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

fn ran(command: &mut Command) -> bool {
    command.status().is_ok_and(|s| s.success())
}

/// `cmd /C <line>`, the line passed as written: Rust's own quoting is for
/// programs that parse their arguments as C does, which `cmd` does not.
#[cfg(windows)]
fn cmd(line: &str) -> bool {
    ran(Command::new("cmd").raw_arg(format!("/C {line}")))
}

/// A symlink at `at` to `target` (a directory when `dir`). On Windows,
/// Developer Mode lets an ordinary user make it.
pub fn symlink(target: &Path, at: &Path, dir: bool) {
    #[cfg(unix)]
    let made = {
        let _ = dir;
        ran(Command::new("ln").arg("-s").arg(target).arg(at))
    };
    #[cfg(windows)]
    let made = cmd(&format!(
        "mklink {}\"{}\" \"{}\"",
        if dir { "/D " } else { "" },
        at.display(),
        target.display()
    ));
    assert!(made, "symlink {} -> {}", at.display(), target.display());
}

/// Take away the right to list or read `dir`, or give it back.
pub fn unreadable(dir: &Path, unreadable: bool) {
    #[cfg(unix)]
    let done = ran(Command::new("chmod")
        .arg(if unreadable { "000" } else { "755" })
        .arg(dir));
    #[cfg(windows)]
    let done = deny(dir, unreadable, "RX");
    assert!(done, "unreadable({}, {unreadable})", dir.display());
}

/// Take away the right to add to `dir`, or give it back.
pub fn unwritable(dir: &Path, unwritable: bool) {
    #[cfg(unix)]
    let done = ran(Command::new("chmod")
        .arg(if unwritable { "500" } else { "700" })
        .arg(dir));
    #[cfg(windows)]
    let done = deny(dir, unwritable, "W");
    assert!(done, "unwritable({}, {unwritable})", dir.display());
}

/// An entry denying `rights` to Everyone (S-1-1-0) on `dir` and what it
/// holds, or every such entry removed. A deny entry binds administrators
/// too, as `chmod` binds a user who is not root.
#[cfg(windows)]
fn deny(dir: &Path, on: bool, rights: &str) -> bool {
    let mut icacls = Command::new("icacls");
    icacls.arg(dir);
    if on {
        icacls
            .arg("/deny")
            .arg(format!("*S-1-1-0:(OI)(CI)({rights})"));
    } else {
        icacls.arg("/remove:d").arg("*S-1-1-0");
    }
    ran(icacls.stdout(std::process::Stdio::null()))
}

/// Set `path`'s modification time to 2026-01-01 00:00, local time.
pub fn old_mtime(path: &Path) {
    #[cfg(unix)]
    let done = ran(Command::new("touch").args(["-t", "202601010000"]).arg(path));
    #[cfg(windows)]
    let done = ran(Command::new("powershell")
        .args(["-NoProfile", "-Command"])
        .arg(format!(
            "(Get-Item -LiteralPath '{}').LastWriteTime = [datetime]'2026-01-01T00:00:00'",
            path.display()
        )));
    assert!(done, "old_mtime({})", path.display());
}

/// Another program appends a line to `path` (Windows ends it with CRLF).
pub fn append_line(path: &Path, line: &str) -> bool {
    #[cfg(unix)]
    return ran(Command::new("sh")
        .arg("-c")
        .arg(format!("printf '{line}\\n' >> \"$0\""))
        .arg(path));
    #[cfg(windows)]
    return cmd(&format!("(echo {line})>>\"{}\"", path.display()));
}

/// Another program replaces `path`'s content with a line. On Windows the
/// `echo` is in parentheses: a line ending in a digit would otherwise make
/// `1>` a redirection of handle 1.
pub fn overwrite_line(path: &Path, line: &str) -> bool {
    #[cfg(unix)]
    return ran(Command::new("sh")
        .arg("-c")
        .arg(format!("printf '{line}\\n' > \"$0\""))
        .arg(path));
    #[cfg(windows)]
    return cmd(&format!("(echo {line})>\"{}\"", path.display()));
}
