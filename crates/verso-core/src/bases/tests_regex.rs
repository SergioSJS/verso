// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Regular expressions in a base's formulas (ADR 0094 items 1 to 5): each
//! answer here is what JavaScript gives for the same call — Obsidian's
//! "Functions" page says its functions follow JavaScript, and MDN is its
//! reference — and every pattern stays within linear time and the query's
//! budget, on a server too.

use std::time::{Duration, Instant};

use verso_dialect::bases::parse_base;

use super::tests::{eval_base, fixture, query, resolve_name};
use super::*;

/// The value of `expr` as a formula, for the note Grom.
fn formula(expr: &str) -> Cell {
    let yaml = format!(
        "formulas:\n  f: |-\n    {expr}\nfilters: file.name == \"Grom.md\"\nviews:\n  - type: table\n    name: T\n    order: [formula.f]\n"
    );
    let r = eval_base(&yaml, &query(None));
    r.groups[0].rows[0].cells[0].clone()
}

fn text(s: &str) -> Cell {
    Cell::Text(s.to_owned())
}

fn error_of(c: &Cell) -> (EvalErrorKind, String) {
    match c {
        Cell::Error(e) => (e.kind, e.name.clone()),
        other => panic!("not an error: {other:?}"),
    }
}

#[test]
fn the_examples_of_the_help_page() {
    // "`/abc/.matches("abcde")` returns `true`" (Functions, regexp).
    assert_eq!(formula(r#"/abc/.matches("abcde")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/abc/.matches("ab")"#), Cell::Bool(false));
    // replace with a pattern: the first match, or every one with `g`.
    assert_eq!(formula(r#""a-b-c".replace(/-/, "+")"#), text("a+b-c"));
    assert_eq!(formula(r#""a-b-c".replace(/-/g, "+")"#), text("a+b+c"));
    // "you can reference capture groups in `replacement` using `$1`, `$2`".
    assert_eq!(
        formula(r#""John Smith".replace(/(\w+)\s(\w+)/, "$2, $1")"#),
        text("Smith, John")
    );
    // split with a pattern, and a limit.
    assert_eq!(
        formula(r#""a1b22c".split(/\d+/)"#),
        Cell::List(vec![text("a"), text("b"), text("c")])
    );
    assert_eq!(
        formula(r#""a,b,c".split(/,/, 2)"#),
        Cell::List(vec![text("a"), text("b")])
    );
}

#[test]
fn the_replacement_as_mdn_gives_it() {
    assert_eq!(formula(r#""abc".replace(/b/, "[$&]")"#), text("a[b]c"));
    assert_eq!(formula(r#""abc".replace(/b/, "$$")"#), text("a$c"));
    assert_eq!(formula(r#""abc".replace(/b/, "$`")"#), text("aac"));
    assert_eq!(formula(r#""abc".replace(/b/, "$'")"#), text("acc"));
    // `$10` with one group is `$1` then "0"; `$2` with one group and `$0`
    // are themselves.
    assert_eq!(formula(r#""ab".replace(/(a)/, "$10")"#), text("a0b"));
    assert_eq!(formula(r#""ab".replace(/(a)/, "$2")"#), text("$2b"));
    assert_eq!(formula(r#""ab".replace(/a/, "$0")"#), text("$0b"));
    // A group that took part in no match is empty.
    assert_eq!(formula(r#""b".replace(/(a)?b/, "[$1]")"#), text("[]"));
    // Twelve groups: `$12` is the twelfth.
    assert_eq!(
        formula(r#""abcdefghijkl".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)/, "$12$1")"#),
        text("la")
    );
    assert_eq!(
        formula(r#""2026-10".replace(/(?<y>\d+)-(?<m>\d+)/, "$<m>/$<y>")"#),
        text("10/2026")
    );
    // Empty matches, everywhere, as JavaScript walks them.
    assert_eq!(formula(r#""baaac".replace(/a*/g, "-")"#), text("-b--c-"));
    assert_eq!(formula(r#""abc".replace(/x*/g, "-")"#), text("-a-b-c-"));
}

#[test]
fn split_as_javascript_splits() {
    // Captured groups go into the list, and one that took part in no
    // match is null there.
    assert_eq!(
        formula(r#""a1b".split(/(\d)/)"#),
        Cell::List(vec![text("a"), text("1"), text("b")])
    );
    assert_eq!(formula(r#""ab".split(/(x)?b/).length"#), Cell::Number(3.0));
    assert_eq!(
        formula(r#""abc".split(/(?:)/)"#),
        Cell::List(vec![text("a"), text("b"), text("c")])
    );
    assert_eq!(
        formula(r#""abc".split(/b*/)"#),
        Cell::List(vec![text("a"), text("c")])
    );
    // An empty text: one empty piece, or none when the pattern matches it.
    assert_eq!(formula(r#""".split(/x/).length"#), Cell::Number(1.0));
    assert_eq!(formula(r#""".split(/x*/).length"#), Cell::Number(0.0));
    assert_eq!(formula(r#""a,b".split(/,/, 0).length"#), Cell::Number(0.0));
}

#[test]
fn flags_and_what_javascript_means_where_the_engines_differ() {
    assert_eq!(formula(r#"/ABC/i.matches("xabcx")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/^b/.matches("a\nb")"#), Cell::Bool(false));
    assert_eq!(formula(r#"/^b/m.matches("a\nb")"#), Cell::Bool(true));
    assert_eq!(
        formula(r#"/foo$/m.matches("foo\r\nbar")"#),
        Cell::Bool(true)
    );
    assert_eq!(formula(r#"/a.b/.matches("a\nb")"#), Cell::Bool(false));
    assert_eq!(formula(r#"/a.b/.matches("a\rb")"#), Cell::Bool(false));
    assert_eq!(formula(r#"/a.b/s.matches("a\nb")"#), Cell::Bool(true));
    // `\d`, `\w` and `\b` are ASCII, as in JavaScript.
    assert_eq!(formula(r#"/\d/.matches("٣")"#), Cell::Bool(false));
    assert_eq!(formula(r#"/\w/.matches("é")"#), Cell::Bool(false));
    assert_eq!(formula(r#"/a\b/.matches("aé")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/\s/.matches(" ")"#), Cell::Bool(true));
    // A class: ranges, a class escape inside, the literal `-` and `[`.
    assert_eq!(
        formula(r#"/^[a-c\d-]+$/.matches("ab-3")"#),
        Cell::Bool(true)
    );
    assert_eq!(formula(r#"/[[]/.matches("x[")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/[^]/.matches("\n")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/[]/.matches("abc")"#), Cell::Bool(false));
    // A brace that does not make a repetition is itself.
    assert_eq!(formula(r#"/a{/.matches("a{")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/a{2}/.matches("aa")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/A/.matches("A")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/\u{1F600}/u.matches("😀")"#), Cell::Bool(true));
    assert_eq!(formula(r#"/\p{L}/u.matches("é")"#), Cell::Bool(true));
    // `y`, `d` and `v` are named, never ignored.
    for flag in ["y", "d", "v"] {
        let (kind, name) = error_of(&formula(&format!(r#"/a/{flag}.matches("a")"#)));
        assert_eq!(kind, EvalErrorKind::RegexUnsupported);
        assert_eq!(name, format!("flag {flag}"));
    }
}

#[test]
fn what_the_engine_lacks_is_an_error_that_names_it() {
    for (pattern, feature) in [
        (r"(?<=a)b", "lookbehind"),
        (r"(?<!a)b", "lookbehind"),
        (r"a(?=b)", "lookahead"),
        (r"a(?!b)", "lookahead"),
        (r"(a)\1", "backreference"),
        (r"(?<x>a)\k<x>", "backreference"),
    ] {
        let c = formula(&format!(r#"/{pattern}/.matches("ab")"#));
        assert_eq!(
            error_of(&c),
            (EvalErrorKind::RegexUnsupported, feature.to_owned()),
            "{pattern}"
        );
    }
}

#[test]
fn an_invalid_pattern_is_an_error_and_a_line_above_the_view() {
    let r = eval_base(
        "formulas:\n  r: '\"abc\".replace(/a(/, \"x\")'\nfilters: file.name == \"Grom.md\"\nviews:\n  - type: table\n    name: T\n    order: [formula.r]\n",
        &query(None),
    );
    let (kind, name) = error_of(&r.groups[0].rows[0].cells[0]);
    assert_eq!(kind, EvalErrorKind::RegexInvalid);
    assert_eq!(name, "/a(/");
    assert_eq!(
        r.problems,
        vec![Problem {
            kind: ProblemKind::Evaluation,
            detail: "formula.r".into(),
            error: Some(EvalError {
                kind: EvalErrorKind::RegexInvalid,
                name: "/a(/".into()
            }),
        }]
    );
    // An unknown flag too.
    let (kind, _) = error_of(&formula(r#"/a/q.matches("a")"#));
    assert_eq!(kind, EvalErrorKind::RegexInvalid);
}

#[test]
fn a_pattern_where_the_method_takes_a_text_is_an_error() {
    for method in [
        "contains",
        "startsWith",
        "endsWith",
        "containsAny",
        "containsAll",
    ] {
        let c = formula(&format!(r#""abc".{method}(/b/)"#));
        assert_eq!(error_of(&c), (EvalErrorKind::Regex, method.to_owned()));
    }
    let (kind, name) = error_of(&formula(r#"/a/.test("a")"#));
    assert_eq!(
        (kind, name.as_str()),
        (EvalErrorKind::UnknownMethod, "test")
    );
}

#[test]
fn patterns_that_backtrack_for_ever_elsewhere_finish_here() {
    // `(a+)+$` over thirty thousand a's and a stop: a backtracking engine
    // takes 2^30000 steps; this one reads the text once.
    for pattern in [
        r"(a+)+$",
        r"(a|aa)+$",
        r"^(a|a?)+$",
        r"(.*a){12}$",
        r"(x+x+)+y",
    ] {
        let started = Instant::now();
        let c = formula(&format!(r#"/{pattern}/.matches("a".repeat(30000) + "!")"#));
        assert_eq!(c, Cell::Bool(false), "{pattern}");
        assert!(
            started.elapsed() < Duration::from_secs(20),
            "{pattern}: {:?}",
            started.elapsed()
        );
    }
}

#[test]
fn an_oversized_pattern_is_refused() {
    // Past 1,000 characters.
    let long = "a".repeat(1001);
    let (kind, name) = error_of(&formula(&format!(r#"/{long}/.matches("a")"#)));
    assert_eq!(kind, EvalErrorKind::RegexTooLarge);
    assert!(name.starts_with("/aaa"), "{name}");
    assert!(name.chars().count() < 100, "{name}");
    // Within the length, past the compiled size.
    for pattern in [
        r"(?:a{1000}){1000}",
        r"\w{1000}\w{1000}\w{1000}\p{L}{999}",
        r"((((a{100}){100}){100}){100})",
    ] {
        let (kind, _) = error_of(&formula(&format!(r#"/{pattern}/u.matches("a")"#)));
        assert_eq!(kind, EvalErrorKind::RegexTooLarge, "{pattern}");
    }
}

#[test]
fn a_pattern_is_compiled_once_per_query() {
    super::pattern::COMPILED.with(|c| c.set(0));
    let r = eval_base(
        "formulas:\n  r: '/a/.matches(file.name)'\nviews:\n  - type: table\n    name: T\n    order: [formula.r]\n",
        &query(None),
    );
    assert!(r.total > 3);
    assert_eq!(super::pattern::COMPILED.with(std::cell::Cell::get), 1);
}

#[test]
fn matching_is_charged_to_the_budget() {
    let f = fixture();
    let resolver = |_: &str, t: &str| resolve_name(t);
    let notes = f.notes.iter().map(|(k, v)| (k.clone(), v)).collect();
    let facts = Facts::new(f.files.clone(), notes, f.links.clone(), &resolver);
    let base = |n: usize| {
        parse_base(&format!(
            "formulas:\n  r: '\"a\".repeat({n}).replace(/a/g, \"b\").length'\nfilters: file.name == \"Grom.md\"\nviews:\n  - type: table\n    name: T\n    order: [formula.r]\n"
        ))
    };
    // Within the budget of a query, it is done.
    let r = run(&base(2000), &query(None), &facts);
    assert_eq!(r.problems, vec![]);
    assert_eq!(r.groups[0].rows[0].cells[0], Cell::Number(2000.0));
    // Each search is charged the text it may scan: a megabyte of matches
    // runs out of the whole budget, and stops at once.
    let started = Instant::now();
    let r = run(&base(1_000_000), &query(None), &facts);
    assert!(
        r.problems.iter().any(|p| p.kind == ProblemKind::Budget),
        "{:?}",
        r.problems
    );
    assert!(
        started.elapsed() < Duration::from_secs(20),
        "{:?}",
        started.elapsed()
    );
    // With a small budget, a smaller text stops too.
    let r = run_with(&base(2000), &query(None), &facts, 20_000);
    assert!(
        r.problems.iter().any(|p| p.kind == ProblemKind::Budget),
        "{:?}",
        r.problems
    );
}
