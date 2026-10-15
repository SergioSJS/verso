// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which versions a thinning removes (ADR 0091 item 3, decided
//! 2026-10-14): every version kept for a day, one an hour for 30 days, one
//! a day after that up to the folder's retention; the newest version of a
//! file is never thinned away. A pure function of the versions and the
//! clock, so that its tests move the clock instead of waiting.

use std::collections::HashSet;

/// An hour, in milliseconds.
pub const HOUR: i64 = 60 * 60 * 1000;
/// A day, in milliseconds.
pub const DAY: i64 = 24 * HOUR;
/// Until when versions are kept one an hour; one a day after that.
pub const HOURLY_UNTIL: i64 = 30 * DAY;
/// How long a room's writes (and the editor's on the computer) fold into
/// one version (item 3: one version per ten minutes of editing).
pub const COALESCE: i64 = 10 * 60 * 1000;

/// The versions of one file to remove at `now`: `versions` are its
/// `(id, at)`, newest first, `at` in milliseconds; `days` the retention (0:
/// no limit); `gone` when the file was deleted, if it was.
///
/// The newest version stays while the file is there, whatever its age. A
/// deleted file's versions are reached from its entry in the trash (item
/// 9); once the retention has passed since the deletion, they all go —
/// nothing is left that would show them.
#[must_use]
pub fn thinning(versions: &[(i64, i64)], now: i64, days: u32, gone: Option<i64>) -> Vec<i64> {
    let limit = (days > 0).then(|| i64::from(days).saturating_mul(DAY));
    if let (Some(limit), Some(gone)) = (limit, gone)
        && now.saturating_sub(gone) >= limit
    {
        return versions.iter().map(|(id, _)| *id).collect();
    }
    let mut out = Vec::new();
    let mut hours: HashSet<i64> = HashSet::new();
    let mut days_seen: HashSet<i64> = HashSet::new();
    for (i, (id, at)) in versions.iter().enumerate() {
        let age = now.saturating_sub(*at);
        let hour = at.div_euclid(HOUR);
        let day = at.div_euclid(DAY);
        if i == 0 {
            hours.insert(hour);
            days_seen.insert(day);
            continue;
        }
        let keep = if limit.is_some_and(|l| age >= l) {
            false
        } else if age < DAY {
            true
        } else if age < HOURLY_UNTIL {
            hours.insert(hour)
        } else {
            days_seen.insert(day)
        };
        if keep {
            hours.insert(hour);
            days_seen.insert(day);
        } else {
            out.push(*id);
        }
    }
    out
}
