// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Linux resolver files, read for `dns.rs` (ADR 0097). This is the one
//! file of the desktop crate besides `update.rs` and `log.rs` that uses
//! `std::fs`, and what it reads is the system's own network configuration,
//! never a file of any folder; `scripts/check.sh` and the CI workflow
//! exempt exactly this file. The exception awaits the maintainer's
//! ratification (ADR 0097, Status).

/// The text of the files that name the machine's DNS servers, joined; empty
/// where there are none (macOS and Windows ask their own tools instead).
pub(crate) fn read() -> String {
    // With systemd-resolved, /etc/resolv.conf names only its stub; the real
    // upstreams are in the second file.
    ["/etc/resolv.conf", "/run/systemd/resolve/resolv.conf"]
        .iter()
        .filter_map(|f| std::fs::read_to_string(f).ok())
        .collect::<Vec<_>>()
        .join("\n")
}
