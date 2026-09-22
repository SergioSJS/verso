// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The recorded baseline (bench-decision §3.3, §4.3, §6.2): one entry per
//! (machine, generator version, size, operation), each carrying the
//! medians, the commit, the OS and when it was taken; versioned in git
//! beside the benchmark. A machine's numbers are compared only with that
//! machine's baseline, and a run compares only with the same generator
//! version. The tolerances are regression thresholds, not targets: ADR
//! 0039 stays `[OPEN]`.

use std::path::Path;

use serde::{Deserialize, Serialize};

/// Time regresses beyond this ratio of the baseline's median.
pub const TIME_TOLERANCE: f64 = 1.5;
/// Index size has no noise: a tight ratio.
pub const INDEX_TOLERANCE: f64 = 1.05;
/// Peak resident memory.
pub const RSS_TOLERANCE: f64 = 1.3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Entry {
    pub machine: String,
    pub os: String,
    pub generator: u32,
    pub size: usize,
    pub operation: String,
    pub median_ms: f64,
    pub peak_rss_bytes: Option<u64>,
    pub index_bytes: u64,
    pub commit: String,
    /// Seconds since the Unix epoch.
    pub recorded_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Baselines {
    pub entries: Vec<Entry>,
}

/// A measured value against its baseline: which metric, how far.
#[derive(Debug, PartialEq)]
pub struct Regression {
    pub metric: &'static str,
    pub now: f64,
    pub baseline: f64,
    pub tolerance: f64,
}

impl Baselines {
    /// Read the file; a missing file is an empty baseline.
    pub fn read(path: &Path) -> std::io::Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(text) => Ok(serde_json::from_str(&text)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e),
        }
    }

    pub fn write(&self, path: &Path) -> std::io::Result<()> {
        let mut text = serde_json::to_string_pretty(self)?;
        text.push('\n');
        std::fs::write(path, text)
    }

    pub fn find(
        &self,
        machine: &str,
        generator: u32,
        size: usize,
        operation: &str,
    ) -> Option<&Entry> {
        self.entries.iter().find(|e| {
            e.machine == machine
                && e.generator == generator
                && e.size == size
                && e.operation == operation
        })
    }

    /// Replace the entry with the same key, or add it.
    pub fn record(&mut self, entry: Entry) {
        self.entries.retain(|e| {
            !(e.machine == entry.machine
                && e.generator == entry.generator
                && e.size == entry.size
                && e.operation == entry.operation)
        });
        self.entries.push(entry);
        self.entries.sort_by(|a, b| {
            (&a.machine, a.generator, a.size, &a.operation).cmp(&(
                &b.machine,
                b.generator,
                b.size,
                &b.operation,
            ))
        });
    }
}

/// The regressions of `now` against `base`, if any (§4.3).
#[must_use]
pub fn compare(now: &Entry, base: &Entry) -> Vec<Regression> {
    let mut out = Vec::new();
    if now.median_ms > base.median_ms * TIME_TOLERANCE {
        out.push(Regression {
            metric: "median_ms",
            now: now.median_ms,
            baseline: base.median_ms,
            tolerance: TIME_TOLERANCE,
        });
    }
    // Comparison in f64: the sizes are bytes, far below 2^53.
    let (ni, bi) = (now.index_bytes as f64, base.index_bytes as f64);
    if ni > bi * INDEX_TOLERANCE {
        out.push(Regression {
            metric: "index_bytes",
            now: ni,
            baseline: bi,
            tolerance: INDEX_TOLERANCE,
        });
    }
    if let (Some(n), Some(b)) = (now.peak_rss_bytes, base.peak_rss_bytes) {
        let (n, b) = (n as f64, b as f64);
        if n > b * RSS_TOLERANCE {
            out.push(Regression {
                metric: "peak_rss_bytes",
                now: n,
                baseline: b,
                tolerance: RSS_TOLERANCE,
            });
        }
    }
    out
}
