// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;

const F: &str = "folder";
/// 2026-10-14 12:00 UTC, the tests' clock.
const NOW: i64 = 1_791_979_200_000;

fn me() -> Vec<Author> {
    vec![Author::new("account", "Ana")]
}

#[test]
fn equal_bytes_make_one_version_and_one_blob() {
    let mut s = Store::memory().unwrap();
    assert!(matches!(
        s.record(F, "a.md", b"one", NOW, &me(), Kind::Write)
            .unwrap(),
        Recorded::New(_)
    ));
    assert_eq!(
        s.record(F, "a.md", b"one", NOW + 1, &me(), Kind::Write)
            .unwrap(),
        Recorded::Same
    );
    s.record(F, "b.md", b"one", NOW, &me(), Kind::Write)
        .unwrap();
    let (count, _) = s.size(F).unwrap();
    assert_eq!(count, 2);
    let blobs: i64 = s
        .conn
        .query_row("SELECT count(*) FROM blobs", [], |r| r.get(0))
        .unwrap();
    assert_eq!(blobs, 1, "equal bytes are kept once (item 1)");
}

#[test]
fn reading_a_version_gives_exactly_its_bytes() {
    let mut s = Store::memory().unwrap();
    let bytes: Vec<u8> = (0..=255u8).cycle().take(70_000).collect();
    let Recorded::New(id) = s
        .record(F, "a.txt", &bytes, NOW, &me(), Kind::Write)
        .unwrap()
    else {
        panic!("a new version");
    };
    let (v, back) = s.read(F, id).unwrap().unwrap();
    assert_eq!(back, bytes);
    assert_eq!(v.size, 70_000);
    assert!(s.read("another", id).unwrap().is_none(), "a folder's own");
}

#[test]
fn a_rooms_writes_coalesce_for_ten_minutes_and_name_every_author() {
    let mut s = Store::memory().unwrap();
    let ana = [Author::new("account", "Ana")];
    let bia = [Author::new("account", "Bia")];
    s.record(F, "n.md", b"a\n", NOW, &ana, Kind::Room).unwrap();
    let merged = s
        .record(F, "n.md", b"a\nb\n", NOW + 60_000, &bia, Kind::Room)
        .unwrap();
    assert!(matches!(merged, Recorded::Merged(_)));
    s.record(F, "n.md", b"a\nb\nc\n", NOW + 9 * 60_000, &ana, Kind::Room)
        .unwrap();
    let l = s.versions(F, "n.md").unwrap();
    assert_eq!(l.versions.len(), 1);
    assert_eq!(l.versions[0].authors.len(), 2);
    // Past ten minutes of the first write: a new version.
    s.record(
        F,
        "n.md",
        b"a\nb\nc\nd\n",
        NOW + 11 * 60_000,
        &ana,
        Kind::Room,
    )
    .unwrap();
    let l = s.versions(F, "n.md").unwrap();
    assert_eq!(l.versions.len(), 2);
    assert_eq!((l.versions[0].added, l.versions[0].removed), (1, 0));
    // Only the newest bytes of a coalesced version are kept.
    let blobs: i64 = s
        .conn
        .query_row("SELECT count(*) FROM blobs", [], |r| r.get(0))
        .unwrap();
    assert_eq!(blobs, 2);
}

#[test]
fn a_write_that_is_not_an_edit_never_coalesces() {
    let mut s = Store::memory().unwrap();
    s.record(F, "n.md", b"a", NOW, &me(), Kind::Room).unwrap();
    s.record(F, "n.md", b"b", NOW + 1, &me(), Kind::Restore)
        .unwrap();
    s.record(F, "n.md", b"c", NOW + 2, &me(), Kind::Room)
        .unwrap();
    assert_eq!(s.versions(F, "n.md").unwrap().versions.len(), 3);
}

#[test]
fn a_rename_keeps_the_history_and_a_deletion_leaves_it_reachable() {
    let mut s = Store::memory().unwrap();
    s.record(F, "a/n.md", b"1", NOW, &me(), Kind::Write)
        .unwrap();
    s.record(F, "a/n.md", b"2", NOW + 1, &me(), Kind::Write)
        .unwrap();
    s.moved(F, "a", "b", NOW + 2).unwrap();
    assert!(s.versions(F, "a/n.md").unwrap().versions.is_empty());
    let l = s.versions(F, "b/n.md").unwrap();
    assert_eq!(l.versions.len(), 2, "a version follows its file (item 9)");
    s.gone(F, "b/n.md", NOW + 3).unwrap();
    let l = s.versions(F, "b/n.md").unwrap();
    assert_eq!(l.gone, Some(NOW + 3));
    assert_eq!(l.versions.len(), 2);
    // A new file of the same name starts its own line.
    s.record(F, "b/n.md", b"new", NOW + 4, &me(), Kind::Write)
        .unwrap();
    let l = s.versions(F, "b/n.md").unwrap();
    assert_eq!((l.gone, l.versions.len()), (None, 1));
}

#[test]
fn deleting_a_version_frees_its_bytes_once_unused() {
    let mut s = Store::memory().unwrap();
    let Recorded::New(a) = s.record(F, "n.md", b"x", NOW, &me(), Kind::Write).unwrap() else {
        panic!()
    };
    s.record(F, "n.md", b"y", NOW + 1, &me(), Kind::Write)
        .unwrap();
    assert!(s.delete(F, a).unwrap());
    assert!(!s.delete(F, a).unwrap());
    assert!(!s.delete("other", a).unwrap());
    let blobs: i64 = s
        .conn
        .query_row("SELECT count(*) FROM blobs", [], |r| r.get(0))
        .unwrap();
    assert_eq!(blobs, 1);
}

#[test]
fn thinning_keeps_a_day_then_one_an_hour_then_one_a_day() {
    // A version every ten minutes for 60 days.
    let step = 10 * 60 * 1000;
    let n = 60 * 24 * 6;
    let versions: Vec<(i64, i64)> = (0..n).map(|i| (i, NOW - i * step)).collect();
    let out: HashSet<i64> = thinning(&versions, NOW, 365, None).into_iter().collect();
    let kept: Vec<i64> = versions
        .iter()
        .filter(|(id, _)| !out.contains(id))
        .map(|(_, at)| NOW - at)
        .collect();
    let in_day = kept.iter().filter(|a| **a < DAY).count();
    let hourly = kept
        .iter()
        .filter(|a| **a >= DAY && **a < HOURLY_UNTIL)
        .count();
    let daily = kept.iter().filter(|a| **a >= HOURLY_UNTIL).count();
    assert_eq!(in_day, 144, "every version of the last day");
    assert!((29 * 24 - 1..=29 * 24 + 1).contains(&hourly), "{hourly}");
    assert!((29..=31).contains(&daily), "{daily}");
}

#[test]
fn thinning_drops_what_is_past_the_retention_but_never_the_newest() {
    let versions = [(1, NOW - 400 * DAY), (2, NOW - 500 * DAY)];
    assert_eq!(thinning(&versions, NOW, 365, None), vec![2]);
    assert!(thinning(&versions, NOW, 0, None).is_empty(), "0: no limit");
    // A deleted file's history goes once the retention passed since.
    assert_eq!(
        thinning(&versions, NOW, 365, Some(NOW - 366 * DAY)),
        vec![1, 2]
    );
    assert_eq!(thinning(&versions, NOW, 365, Some(NOW - DAY)), vec![2]);
}

#[test]
fn the_store_thins_with_a_moved_clock_and_the_quota_thins_early() {
    let mut s = Store::memory().unwrap();
    for i in 0..48 {
        let text = format!("version {i}\n").repeat(200);
        s.record(
            F,
            "n.md",
            text.as_bytes(),
            NOW + i * HOUR / 2,
            &me(),
            Kind::Write,
        )
        .unwrap();
    }
    // A day later every version is still within a day of... nothing: the
    // clock moves two days on.
    let t = s.thin(F, NOW + 3 * DAY, 365, None).unwrap();
    assert_eq!(t.count, 24, "one an hour");
    assert_eq!(t.removed, 24);
    let newest = s.versions(F, "n.md").unwrap().versions[0].clone();
    // A quota smaller than the history: only the newest is left.
    let t = s.thin(F, NOW + 3 * DAY, 365, Some(1)).unwrap();
    assert_eq!(t.count, 1);
    assert_eq!(t.early, 23);
    assert_eq!(s.versions(F, "n.md").unwrap().versions[0], newest);
}

#[test]
fn the_size_of_a_change_counts_lines() {
    assert_eq!(line_change(b"a\nb\nc\n", b"a\nc\nd\ne\n"), (2, 1));
    assert_eq!(line_change(b"", b"x"), (1, 0));
    assert_eq!(line_change(b"same", b"same"), (0, 0));
}

#[test]
fn authors_keep_no_separator_of_their_own() {
    let odd = [Author::new("device", "Mac\nde\u{1f}Ana")];
    let back = authors_of(&authors_text(&odd));
    assert_eq!(back, vec![Author::new("device", "Mac de Ana")]);
}

#[test]
fn verso_s_own_write_seen_first_by_the_watcher_keeps_its_author() {
    let mut s = Store::memory().unwrap();
    let outside = vec![Author::new("outside", "")];
    s.record(F, "a.md", b"one", NOW, &outside, Kind::Outside)
        .unwrap();
    // The write the watcher saw arrives a moment later with the same bytes.
    s.record(F, "a.md", b"one", NOW + 300, &me(), Kind::Write)
        .unwrap();
    let v = s.versions(F, "a.md").unwrap().versions;
    assert_eq!(v.len(), 1);
    assert_eq!(v[0].kind, Kind::Write);
    assert_eq!(v[0].authors, me());
    // Long after, the same bytes are an echo: the outside version stays.
    s.record(F, "b.md", b"two", NOW, &outside, Kind::Outside)
        .unwrap();
    s.record(F, "b.md", b"two", NOW + 60_000, &me(), Kind::Write)
        .unwrap();
    assert_eq!(
        s.versions(F, "b.md").unwrap().versions[0].kind,
        Kind::Outside
    );
}
