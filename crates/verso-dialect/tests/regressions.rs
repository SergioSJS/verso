// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Inputs that once broke `parse`, kept as plain tests so that they cannot
//! come back silently. Each one says where it came from.

use verso_dialect::parse;

/// Review of PR #7, finding 1: 4 000 nested block sequences in the
/// frontmatter overflowed the stack inside the YAML loader and aborted the
/// process. `parse` must return (Q18, property 1); the frontmatter is
/// reported with an error, not dropped.
#[test]
fn deeply_nested_frontmatter_returns_an_error_not_an_abort() {
    let source = format!("---\n{}x\n---\nbody [[a]]\n", "- ".repeat(4_000));
    let document = parse(&source);
    let frontmatter = document.frontmatter.expect("the block is still reported");
    assert_eq!(frontmatter.span.start, 0);
    assert!(frontmatter.values.is_err());
    assert_eq!(document.links.len(), 1, "the body is still parsed");
}

/// `pulldown-cmark` 0.13.4 panics on a list item holding a link reference
/// definition followed by a line of tabs (upstream issue #1129; fixed on
/// upstream `main`, not released on 2026-09-21). Found by the CI fuzz job on
/// `main` after PR #7. Ignored until the base is updated: the fuzz seed
/// `fuzz/seeds/list-refdef-tabs.md` keeps the fuzz job red meanwhile.
#[test]
#[ignore = "pulldown-cmark 0.13.4 panics here (upstream #1129); fixed upstream, unreleased"]
fn list_item_with_reference_definition_and_tab_line() {
    let _ = parse("- [a]:b\n\t\t");
}
