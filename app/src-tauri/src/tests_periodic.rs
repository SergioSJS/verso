// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Two devices that made the same periodic note apart, each from the
//! same filled template (ADR 0093 item 12, revising ADR 0079 item 8): the
//! template is the base, and both sides' additions are joined — on both
//! devices and on the server, with no copy. A note filled from the
//! template at another time, or one a device made without telling sync
//! it came from a template, keeps the copy, as before.

use super::tests_sync::{changed, copy_of, device, files, serve, sync, text, write};
use super::*;

const WEEK: &str = "Diário/2026-W42.md";
const TEMPLATE: &str = "---\ndate: 2026-10-11\n---\n# 2026-W42\n\n## Metas\n";

#[test]
fn the_same_periodic_note_made_on_two_devices_offline_is_joined_over_its_template() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Leia.md", "# Leia\n")]);
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);

    // Each makes the week's note from the template, the server out of
    // reach, and writes under it.
    let from_a = format!("{TEMPLATE}- de A\n");
    let from_b = format!("{TEMPLATE}- de B\n");
    write(&a, WEEK, from_a.as_bytes());
    a.s.made_from_template(WEEK, TEMPLATE);
    write(&b, WEEK, from_b.as_bytes());
    b.s.made_from_template(WEEK, TEMPLATE);

    // Back: A arrives first, B finds A's and joins them.
    sync(&a);
    sync(&b);
    let both = format!("{TEMPLATE}- de A\n- de B\n");
    assert_eq!(text(&b, WEEK).as_deref(), Some(both.as_str()));
    changed(&a, &[]);
    sync(&a);
    assert_eq!(text(&a, WEEK).as_deref(), Some(both.as_str()));
    for d in [&a, &b] {
        let names = files(d);
        assert!(
            !names.iter().any(|p| super::sync::is_conflict_copy(p)),
            "{names:?}"
        );
    }
    let log = lock(&b.shown).last().cloned().unwrap().log;
    assert!(
        log.iter().any(|e| e.what == "merged" && e.path == WEEK),
        "{log:?}"
    );
    // The template base is dropped once the base has the path.
    let state = verso_core::sync::load(b.ctx.config.as_deref(), &b.key)
        .unwrap()
        .unwrap();
    assert!(state.made.is_empty(), "{:?}", state.made);
}

#[test]
fn a_device_that_made_it_and_wrote_nothing_takes_the_others_lines() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Leia.md", "# Leia\n")]);
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    let from_a = format!("{TEMPLATE}- de A\n");
    write(&a, WEEK, from_a.as_bytes());
    a.s.made_from_template(WEEK, TEMPLATE);
    write(&b, WEEK, TEMPLATE.as_bytes());
    b.s.made_from_template(WEEK, TEMPLATE);
    sync(&a);
    sync(&b);
    assert_eq!(text(&b, WEEK).as_deref(), Some(from_a.as_str()));
    assert!(!files(&b).iter().any(|p| super::sync::is_conflict_copy(p)));
}

#[test]
fn another_filling_of_the_template_or_no_template_keeps_the_copy() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[("Leia.md", "# Leia\n")]);
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    // B filled the template a day later (`{{date:…}}` of the moment it
    // was made): another text, not A's base.
    let later = TEMPLATE.replace("2026-10-11", "2026-10-12");
    write(&a, WEEK, format!("{TEMPLATE}- de A\n").as_bytes());
    a.s.made_from_template(WEEK, TEMPLATE);
    write(&b, WEEK, format!("{later}- de B\n").as_bytes());
    b.s.made_from_template(WEEK, &later);
    sync(&a);
    sync(&b);
    assert_eq!(
        text(&b, WEEK).as_deref(),
        Some(format!("{TEMPLATE}- de A\n").as_str())
    );
    let copy = copy_of(&b, WEEK);
    assert_eq!(
        text(&b, &copy).as_deref(),
        Some(format!("{later}- de B\n").as_str())
    );

    // A note both made with no word to sync of a template: a copy too.
    let month = "Diário/2026-10.md";
    write(&a, month, b"# 2026-10\n\n- de A\n");
    write(&b, month, b"# 2026-10\n\n- de B\n");
    sync(&a);
    sync(&b);
    assert_eq!(text(&b, month).as_deref(), Some("# 2026-10\n\n- de A\n"));
    let copy = copy_of(&b, month);
    assert_eq!(text(&b, &copy).as_deref(), Some("# 2026-10\n\n- de B\n"));
}
