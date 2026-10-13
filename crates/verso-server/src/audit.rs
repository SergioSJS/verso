// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The audit log expires (ADR 0083 item 10, finding F21): a row older than
//! `VERSO_AUDIT_DAYS` (365 by default, 0 for never) is deleted by a sweep
//! at start and once a day, beside the trash's. Time is the only thing
//! that removes a row: no route, command or setting triggers the sweep or
//! names a row to delete, so it is no way to erase what someone did
//! yesterday. A sweep that removed rows says how many in the log.

use std::sync::Arc;
use std::time::Duration;

use crate::db::Db;
use crate::state::Server;

/// How often the audit log is swept.
const DAILY: Duration = Duration::from_secs(24 * 60 * 60);

const DAY: i64 = 24 * 60 * 60;

/// The moment before which a row goes, for a retention of `days` at
/// `now`; `None` when rows are kept for ever.
#[must_use]
pub fn cutoff(days: u32, now: i64) -> Option<i64> {
    (days > 0).then(|| now.saturating_sub(i64::from(days) * DAY))
}

/// The rows older than `days` at `now` deleted; how many.
pub fn sweep(db: &Db, days: u32, now: i64) -> Result<usize, String> {
    match cutoff(days, now) {
        Some(before) => db.expire_audit(before),
        None => Ok(0),
    }
}

/// The audit log swept at start and once a day.
pub async fn daily(server: Arc<Server>) {
    loop {
        let s = Arc::clone(&server);
        let _ = tokio::task::spawn_blocking(move || {
            let days = s.config.audit_days;
            match sweep(&s.db, days, crate::db::now()) {
                Ok(0) => {}
                Ok(n) => crate::log::info(&format!(
                    "the audit log's sweep removed {n} rows older than {days} days (VERSO_AUDIT_DAYS)"
                )),
                Err(e) => crate::log::warn(&format!("the audit log's sweep: {e}")),
            }
        })
        .await;
        tokio::time::sleep(DAILY).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Audit;

    fn row(action: &str) -> Audit<'_> {
        Audit {
            actor: None,
            action,
            subject: None,
            folder: None,
            address: Some("10.0.0.2"),
            ok: false,
        }
    }

    /// A row older than the retention goes, a younger one stays, and 0
    /// keeps everything.
    #[test]
    fn a_row_older_than_the_retention_goes_and_a_younger_one_stays() {
        let db = Db::memory().unwrap();
        let now = crate::db::now();
        db.audit_at(now - 366 * DAY, &row("old")).unwrap();
        db.audit_at(now - 364 * DAY, &row("young")).unwrap();
        db.audit(&row("today")).unwrap();
        assert_eq!(sweep(&db, 0, now).unwrap(), 0);
        assert_eq!(db.audit_log(None, 10).unwrap().len(), 3);
        assert_eq!(sweep(&db, 365, now).unwrap(), 1);
        let left: Vec<String> = db
            .audit_log(None, 10)
            .unwrap()
            .into_iter()
            .map(|a| a.action)
            .collect();
        assert_eq!(left, ["today", "young"]);
        assert_eq!(sweep(&db, 365, now).unwrap(), 0);
        assert_eq!(cutoff(1, 10 * DAY), Some(9 * DAY));
        assert_eq!(cutoff(0, 10 * DAY), None);
    }
}
