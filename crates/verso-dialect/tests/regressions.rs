// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Inputs that once broke `parse`, kept as plain tests so that they cannot
//! come back silently. Each one says where it came from.

use verso_dialect::parse;

/// Review of PR #7, finding 1: 4 000 nested block sequences in the
/// frontmatter overflowed the stack inside the YAML loading driver and
/// aborted the process. Second reading, finding 1: a chain of 1 000 aliases
/// (event depth 2, expanded depth 1 001) did the same through our own
/// conversion, and a 347-byte alias fan-out exhausted memory. `parse` must
/// return (Q18, property 1); the frontmatter is reported with an error, not
/// dropped, and the body is still parsed.
#[test]
fn deeply_nested_frontmatter_returns_an_error_not_an_abort() {
    let check = |yaml: String| {
        let source = format!("---\n{yaml}---\nbody [[a]]\n");
        let document = parse(&source);
        let frontmatter = document.frontmatter.expect("the block is still reported");
        assert_eq!(frontmatter.span.start, 0);
        assert!(
            frontmatter.values.is_err(),
            "{}",
            source.chars().take(40).collect::<String>()
        );
        assert_eq!(document.links.len(), 1, "the body is still parsed");
    };
    check(format!("{}x\n", "- ".repeat(4_000)));
    let mut chain = "a0: &a0 [x]\n".to_owned();
    for i in 1..=1_000 {
        chain.push_str(&format!("a{i}: &a{i} [*a{}]\n", i - 1));
    }
    check(chain);
    let mut fan = "a0: &a0 [x]\n".to_owned();
    for i in 1..=7 {
        let prev = format!("*a{}", i - 1);
        fan.push_str(&format!("a{i}: &a{i} [{}]\n", [prev.as_str(); 9].join(",")));
    }
    check(fan);
}

/// `pulldown-cmark` 0.13.4 panics on a list item holding a link reference
/// definition followed by a line of tabs (upstream issue #1129; fixed on
/// upstream `main`, not released on 2026-09-21). Found by the CI fuzz job on
/// `main` after PR #7. Ignored until the base is updated; the input is not
/// a fuzz seed, because libFuzzer runs seeds smallest first and this one
/// would end every job before a single mutation (third reading, finding 1).
#[test]
#[ignore = "pulldown-cmark 0.13.4 panics here (upstream #1129); fixed upstream, unreleased"]
fn list_item_with_reference_definition_and_tab_line() {
    let _ = parse("- [a]:b\n\t\t");
}
