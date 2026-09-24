// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The values of the base language and what the operators do with them:
//! JavaScript's rules where "Functions" says the language follows them
//! (truthiness, `+` joining text), and the documented ones for dates,
//! durations, links and files.

use std::cmp::Ordering;

use super::time::{self, Duration};
use super::{Cell, EvalError, EvalErrorKind};

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum V {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    /// A wall-clock time (`time.rs`) and whether it carries a time of day.
    Date(i64, bool),
    Dur(Duration),
    List(Vec<V>),
    Obj(Vec<(String, V)>),
    /// A link: its target as written (a name or a path), the text to show,
    /// and the file it was read from, which relative targets start at.
    Link {
        target: String,
        display: Option<String>,
        from: String,
    },
    /// A file of the folder, by its path.
    File(String),
    Regex(String, String),
    Image(String),
    Icon(String),
    Html(String),
}

impl V {
    pub(crate) fn type_name(&self) -> &'static str {
        match self {
            V::Null => "null",
            V::Bool(_) => "boolean",
            V::Num(_) => "number",
            V::Str(_) => "string",
            V::Date(..) => "date",
            V::Dur(_) => "duration",
            V::List(_) => "list",
            V::Obj(_) => "object",
            V::Link { .. } => "link",
            V::File(_) => "file",
            V::Regex(..) => "regexp",
            V::Image(_) => "image",
            V::Icon(_) => "icon",
            V::Html(_) => "html",
        }
    }

    /// JavaScript's truthiness: `false`, `0`, `NaN`, `""` and `null` are
    /// false; every list and object is true, even empty.
    pub(crate) fn truthy(&self) -> bool {
        match self {
            V::Null => false,
            V::Bool(b) => *b,
            V::Num(n) => *n != 0.0 && !n.is_nan(),
            V::Str(s) => !s.is_empty(),
            _ => true,
        }
    }

    /// Empty as `isEmpty()` means it: nothing there.
    pub(crate) fn is_empty(&self) -> bool {
        match self {
            V::Null => true,
            V::Str(s) => s.is_empty(),
            V::List(l) => l.is_empty(),
            V::Obj(o) => o.is_empty(),
            _ => false,
        }
    }

    /// The text of a value, as `toString()` and `+` with a string give it.
    pub(crate) fn text(&self, lang: &str) -> String {
        match self {
            V::Null => String::new(),
            V::Bool(b) => b.to_string(),
            V::Num(n) => number_text(*n),
            V::Str(s) | V::Image(s) | V::Icon(s) | V::Html(s) => s.clone(),
            V::Date(ms, with_time) => time::format(
                *ms,
                if *with_time {
                    "YYYY-MM-DD HH:mm:ss"
                } else {
                    "YYYY-MM-DD"
                },
                lang,
            ),
            V::Dur(d) => number_text(d.ms + d.months * 30.0 * 86_400_000.0),
            V::List(items) => items
                .iter()
                .map(|v| v.text(lang))
                .collect::<Vec<_>>()
                .join(", "),
            V::Obj(entries) => {
                let inner: Vec<String> = entries
                    .iter()
                    .map(|(k, v)| format!("{k}: {}", v.text(lang)))
                    .collect();
                format!("{{{}}}", inner.join(", "))
            }
            V::Link {
                target, display, ..
            } => display.clone().unwrap_or_else(|| target.clone()),
            V::File(path) => path.clone(),
            V::Regex(p, f) => format!("/{p}/{f}"),
        }
    }
}

/// A number as JavaScript prints it: integers without a point, the rest
/// with the shortest text that reads back to the same number.
pub(crate) fn number_text(n: f64) -> String {
    if n.is_nan() {
        "NaN".to_owned()
    } else if n.is_infinite() {
        if n > 0.0 { "Infinity" } else { "-Infinity" }.to_owned()
    } else if n == n.trunc() && n.abs() < 1e21 {
        format!("{n:.0}")
    } else {
        n.to_string()
    }
}

/// A number from text, as `number()` reads it: surrounding space ignored,
/// the empty text refused.
pub(crate) fn parse_number(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<f64>().ok().filter(|n| n.is_finite())
}

/// The name of a link as it is compared and resolved: the target without
/// its `#heading` or `^block`, and without the brackets a string may
/// carry (`"[[Nota]]"`).
pub(crate) fn link_target(text: &str) -> String {
    let t = text.trim();
    let t = t
        .strip_prefix("[[")
        .and_then(|r| r.strip_suffix("]]"))
        .unwrap_or(t);
    let t = t.split('|').next().unwrap_or(t);
    t.split('#').next().unwrap_or(t).trim().to_owned()
}

/// A property's text read as a wikilink, `[[target|alias]]`, when it is
/// one and nothing else.
pub(crate) fn as_wikilink(text: &str) -> Option<(String, Option<String>)> {
    let inner = text.trim().strip_prefix("[[")?.strip_suffix("]]")?;
    if inner.contains("[[") || inner.contains("]]") || inner.is_empty() {
        return None;
    }
    match inner.split_once('|') {
        Some((t, a)) => Some((t.to_owned(), Some(a.to_owned()))),
        None => Some((inner.to_owned(), None)),
    }
}

/// How two values compare, for `<`, `>` and sorting, when they can be
/// compared: numbers, texts (as written), dates, durations of the same
/// kind, booleans; a text and a number by the number the text reads as;
/// a date and a text by the date the text reads as.
pub(crate) fn compare(a: &V, b: &V, offset: i32) -> Option<Ordering> {
    match (a, b) {
        (V::Num(x), V::Num(y)) => x.partial_cmp(y),
        (V::Str(x), V::Str(y)) => Some(x.cmp(y)),
        (V::Bool(x), V::Bool(y)) => Some(x.cmp(y)),
        (V::Date(x, _), V::Date(y, _)) => Some(x.cmp(y)),
        (V::Date(x, _), V::Str(s)) => time::parse_date(s, offset).map(|(y, _)| x.cmp(&y)),
        (V::Str(s), V::Date(y, _)) => time::parse_date(s, offset).map(|(x, _)| x.cmp(y)),
        (V::Dur(x), V::Dur(y)) if x.months == 0.0 && y.months == 0.0 => x.ms.partial_cmp(&y.ms),
        (V::Num(x), V::Str(s)) => parse_number(s).and_then(|y| x.partial_cmp(&y)),
        (V::Str(s), V::Num(y)) => parse_number(s).and_then(|x| x.partial_cmp(y)),
        _ => None,
    }
}

/// The order of a sort: values of different kinds by kind (numbers, dates,
/// texts, …), empty values last; within a kind, [`compare`], texts by
/// their lower case first so that `a` and `B` sort together.
pub(crate) fn sort_order(a: &V, b: &V, lang: &str) -> Ordering {
    fn rank(v: &V) -> u8 {
        match v {
            V::Num(_) => 0,
            V::Dur(_) => 1,
            V::Date(..) => 2,
            V::Bool(_) => 3,
            V::Str(_)
            | V::Link { .. }
            | V::File(_)
            | V::Image(_)
            | V::Icon(_)
            | V::Html(_)
            | V::Regex(..) => 4,
            V::List(_) | V::Obj(_) => 5,
            V::Null => 6,
        }
    }
    let (ra, rb) = (rank(a), rank(b));
    if ra != rb {
        return ra.cmp(&rb);
    }
    // An order with no exception, as sorting needs one: a number that is
    // not a number goes at an end, a duration by its length.
    let length = |d: &Duration| d.ms + d.months * 30.0 * 86_400_000.0;
    match (a, b) {
        (V::Num(x), V::Num(y)) => x.total_cmp(y),
        (V::Dur(x), V::Dur(y)) => length(x).total_cmp(&length(y)),
        (V::Date(x, _), V::Date(y, _)) => x.cmp(y),
        (V::Bool(x), V::Bool(y)) => x.cmp(y),
        (V::Null, V::Null) => Ordering::Equal,
        _ => {
            let (x, y) = (a.text(lang), b.text(lang));
            natural(&x.to_lowercase(), &y.to_lowercase()).then_with(|| x.cmp(&y))
        }
    }
}

/// Texts in natural order: runs of digits compare as numbers, so `Sessão
/// 2` comes before `Sessão 10`.
pub(crate) fn natural(a: &str, b: &str) -> Ordering {
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let mut n = String::new();
                while let Some(&c) = x.peek().filter(|c| c.is_ascii_digit()) {
                    n.push(c);
                    x.next();
                }
                let mut m = String::new();
                while let Some(&d) = y.peek().filter(|c| c.is_ascii_digit()) {
                    m.push(d);
                    y.next();
                }
                let (n, m) = (n.trim_start_matches('0'), m.trim_start_matches('0'));
                let order = n.len().cmp(&m.len()).then_with(|| n.cmp(m));
                if order != Ordering::Equal {
                    return order;
                }
            }
            (Some(c), Some(d)) => {
                if c != d {
                    return c.cmp(&d);
                }
                x.next();
                y.next();
            }
        }
    }
}

/// A value as a view shows it.
pub(crate) fn cell(v: &V, resolve: &mut dyn FnMut(&str, &str) -> Option<String>) -> Cell {
    match v {
        V::Null => Cell::Empty,
        V::Bool(b) => Cell::Bool(*b),
        V::Num(n) if n.is_finite() => Cell::Number(*n),
        V::Num(n) => Cell::Text(number_text(*n)),
        V::Str(s) if s.is_empty() => Cell::Empty,
        V::Str(s) => Cell::Text(s.clone()),
        V::Date(ms, with_time) => Cell::Date {
            ms: *ms,
            time: *with_time,
        },
        V::Dur(d) => Cell::Duration(d.ms + d.months * 30.0 * 86_400_000.0),
        V::List(items) => Cell::List(items.iter().map(|i| cell(i, resolve)).collect()),
        V::Obj(entries) => Cell::Object(
            entries
                .iter()
                .map(|(k, v)| (k.clone(), cell(v, resolve)))
                .collect(),
        ),
        V::Link {
            target,
            display,
            from,
        } => Cell::Link {
            path: resolve(from, target),
            target: target.clone(),
            display: display.clone(),
        },
        V::File(path) => Cell::File(path.clone()),
        V::Regex(p, f) => Cell::Text(format!("/{p}/{f}")),
        V::Image(s) => Cell::Image(s.clone()),
        V::Icon(s) => Cell::Icon(s.clone()),
        V::Html(s) => Cell::Html(s.clone()),
    }
}

/// An evaluation error as a cell shows it.
pub(crate) fn error_cell(e: &EvalError) -> Cell {
    Cell::Error(e.clone())
}

pub(crate) fn err(kind: EvalErrorKind, name: impl Into<String>) -> EvalError {
    EvalError {
        kind,
        name: name.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truth_and_text() {
        assert!(!V::Null.truthy());
        assert!(!V::Str(String::new()).truthy());
        assert!(V::List(vec![]).truthy());
        assert!(!V::Num(0.0).truthy());
        assert_eq!(V::Num(3.0).text("en"), "3");
        assert_eq!(V::Num(2.5).text("en"), "2.5");
        assert_eq!(
            V::List(vec![V::Num(1.0), V::Str("a".into())]).text("en"),
            "1, a"
        );
    }

    #[test]
    fn links_in_properties() {
        assert_eq!(
            as_wikilink("[[Nota|alias]]"),
            Some(("Nota".into(), Some("alias".into())))
        );
        assert_eq!(as_wikilink("[[a]] e [[b]]"), None);
        assert_eq!(as_wikilink("texto"), None);
        assert_eq!(link_target("[[Pasta/Nota#Título|x]]"), "Pasta/Nota");
    }

    #[test]
    fn natural_order_and_sorting() {
        assert_eq!(natural("Sessão 2", "Sessão 10"), Ordering::Less);
        assert_eq!(natural("a", "a"), Ordering::Equal);
        let mut v = [
            V::Null,
            V::Str("b".into()),
            V::Num(2.0),
            V::Str("A".into()),
            V::Num(1.0),
        ];
        v.sort_by(|a, b| sort_order(a, b, "en"));
        assert_eq!(
            v,
            [
                V::Num(1.0),
                V::Num(2.0),
                V::Str("A".into()),
                V::Str("b".into()),
                V::Null
            ]
        );
    }

    #[test]
    fn comparisons_across_kinds() {
        assert_eq!(
            compare(&V::Num(3.0), &V::Str("10".into()), 0),
            Some(Ordering::Less)
        );
        assert_eq!(compare(&V::Str("x".into()), &V::Num(1.0), 0), None);
        let d = V::Date(time::from_parts(2024, 1, 2, 0, 0, 0, 0), false);
        assert_eq!(
            compare(&d, &V::Str("2024-01-01".into()), 0),
            Some(Ordering::Greater)
        );
    }
}
