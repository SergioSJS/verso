// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! How much disk a folder's version history takes (ADR 0091, "disk growth
//! bounded and measured"): a synthetic vault of the benchmark's shape, its
//! notes kept as found, then two months of editing with the clock moved a
//! day at a time — fifty notes a day, each written every six minutes for
//! two hours as a room writes —, thinned daily, then a year and more with
//! nothing written. Ignored by default (a minute or two); run with
//! `cargo test -p verso-bench --release --test history_growth -- --ignored --nocapture`.

use verso_core::Workspace;
use verso_core::history::{DAY, Kind, Store};

const NOTES: usize = 5_000;
const FOLDER: &str = "f";

fn mib(b: u64) -> f64 {
    b as f64 / (1024.0 * 1024.0)
}

#[test]
#[ignore = "a measurement: run by hand, see the module's doc"]
fn the_history_of_a_large_vault_stays_bounded() {
    let dir = tempfile::tempdir().unwrap();
    let vault = verso_bench::generate::generate(
        dir.path(),
        &verso_bench::generate::Shape {
            notes: NOTES,
            seed: 91,
        },
    )
    .unwrap();
    let config = tempfile::tempdir().unwrap();
    let mut ws = Workspace::open(dir.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let notes = ws.notes().unwrap();
    let mut store = Store::open(&config.path().join("history.sqlite")).unwrap();
    let start: i64 = 1_791_979_200_000;
    let mut text_bytes = 0u64;
    let mut texts: Vec<(String, String)> = Vec::new();
    for n in &notes {
        // A placeholder of the generator's (one in a hundred) has no text.
        let Ok(read) = ws.read_note(n) else {
            continue;
        };
        let t = read.text;
        text_bytes += t.len() as u64;
        store
            .record(FOLDER, n, t.as_bytes(), start, &[], Kind::Found)
            .unwrap();
        texts.push((n.clone(), t));
    }
    let (count, seeded) = store.size(FOLDER).unwrap();
    eprintln!(
        "vault: {} notes, {:.1} MiB of text; history as found: {count} versions, {:.1} MiB ({:.0}% of the text)",
        vault.notes,
        mib(text_bytes),
        mib(seeded),
        100.0 * seeded as f64 / text_bytes as f64
    );
    let mut peak = seeded;
    let mut versions = 0u64;
    let six_minutes = 6 * 60 * 1000;
    for day in 1..=60i64 {
        let morning = start + day * DAY + 9 * 60 * 60 * 1000;
        for k in 0..50usize {
            let i = (day as usize * 50 + k) * 7 % texts.len();
            let (path, text) = &mut texts[i];
            for w in 0..20i64 {
                text.push_str(&format!(
                    "Dia {day}, escrita {w}: a sessão seguiu, e alguém anotou mais uma linha do que aconteceu.\n"
                ));
                store
                    .record(
                        FOLDER,
                        path,
                        text.as_bytes(),
                        morning + w * six_minutes,
                        &[verso_core::history::Author::new("account", "Ana")],
                        Kind::Room,
                    )
                    .unwrap();
            }
        }
        let t = store
            .thin(FOLDER, start + (day + 1) * DAY, 365, None)
            .unwrap();
        peak = peak.max(t.size);
        versions = t.count;
        if day == 1 || day == 30 || day == 60 {
            eprintln!("day {day}: {} versions, {:.1} MiB", t.count, mib(t.size));
        }
    }
    let later = store
        .thin(FOLDER, start + 61 * DAY + 400 * DAY, 365, None)
        .unwrap();
    eprintln!(
        "peak {:.1} MiB; after a year and more with nothing written: {} versions, {:.1} MiB",
        mib(peak),
        later.count,
        mib(later.size)
    );
    // The database file itself: SQLite reuses the pages thinning frees and
    // does not give them back, so the file stays at its peak.
    drop(store);
    let file: u64 = ["history.sqlite", "history.sqlite-wal"]
        .iter()
        .filter_map(|f| std::fs::metadata(config.path().join(f)).ok())
        .map(|m| m.len())
        .sum();
    eprintln!("the database file on disk: {:.1} MiB", mib(file));
    // Bounded: every file keeps its newest version; the rest went.
    assert_eq!(later.count as usize, texts.len());
    assert!(versions > later.count);
    // Deflated, with each version kept once: well under the text's twice.
    assert!(
        peak < 2 * text_bytes,
        "peak {peak} for {text_bytes} of text"
    );
}
