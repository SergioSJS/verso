// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The contract's version (ADR 0073 item 2, revised 2026-11-02): an
//! integer that a desktop app and a server of another release compare,
//! instead of the hash of the generated bindings — a comment in those
//! bindings changed the hash and stopped every sync. The contract changes
//! only by adding (a new optional field, a new command); a change that
//! breaks one side bumps the number, and each side takes the other's
//! number and the one before (the maintainer, 2026-11-02, *"Versão +
//! janela N/N-1"*). The hash stays, for the log only.

/// This build's contract version.
pub const VERSION: u32 = 1;

/// Whether a side of contract `ours` and one of `theirs` take each other:
/// the same version or the one before, either way. A side that says no
/// version (a release before 0.8.5) speaks version 0.
#[must_use]
pub const fn takes(ours: u32, theirs: u32) -> bool {
    ours.abs_diff(theirs) <= 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_version_and_the_one_before_either_way() {
        assert!(takes(VERSION, VERSION));
        assert!(takes(2, 1) && takes(1, 2));
        assert!(!takes(3, 1) && !takes(1, 3));
        // A release before the number: version 0, the one before the first.
        assert!(takes(1, 0));
    }
}
