// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Linux resolver files, read for `dns.rs` (ADR 0097). This is the one
//! file of the desktop crate besides `update.rs` and `log.rs` that uses
//! `std::fs`, and what it reads is the system's own network configuration,
//! never a file of any folder; `scripts/check.sh` and the CI workflow
//! exempt exactly this file. The exception awaits the maintainer's
//! ratification (ADR 0097, Status).

/// The text of `/etc/resolv.conf` and of systemd-resolved's own
/// `/run/systemd/resolve/resolv.conf`, each empty where the file is not
/// there (macOS and Windows ask their own tools instead).
pub(crate) fn read() -> (String, String) {
    let get = |f| std::fs::read_to_string(f).unwrap_or_default();
    (
        get("/etc/resolv.conf"),
        get("/run/systemd/resolve/resolv.conf"),
    )
}
