// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A base: the YAML of a `.base` file, or of a fenced block whose language is
//! `base` inside a note, in the syntax Obsidian documents ("Bases syntax",
//! `obsidian.md/help/bases/syntax`): `filters`, `formulas`, `properties`,
//! `summaries` and `views` (ADR 0053).
//!
//! This module reads the text into a [`Base`] and nothing else: it keeps
//! what it does not interpret — a view's own settings, such as a table's
//! column widths or a card's image — as written, for the caller, and
//! reports what it could not read as problems instead of failing the whole
//! base, so that one bad view does not hide the others. Evaluating the base
//! over the folder is `verso-core`'s.

mod expr;

pub use expr::{
    BinaryOp, Expr, ExprError, ExprErrorKind, MAX_DEPTH, MAX_EXPRESSION_LEN, UnaryOp,
    parse_expression,
};

use crate::frontmatter::{Value, parse_yaml};

/// Largest base read, in bytes. The YAML inside is bounded again by the
/// frontmatter's limits (depth and nodes, spec Q17).
pub const MAX_BASE_LEN: usize = 512 * 1024;

/// A base, as written.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Base {
    /// Conditions every view applies.
    pub filters: Option<Filter>,
    /// Formula properties: name and expression text, in the order written.
    pub formulas: Vec<(String, String)>,
    /// Per-property settings, by property id (`status`, `note.status`,
    /// `file.ext`, `formula.price`), in the order written.
    pub properties: Vec<(String, PropertySettings)>,
    /// Custom summary formulas: name and expression text.
    pub summaries: Vec<(String, String)>,
    pub views: Vec<View>,
    /// What could not be read, in document order. The rest of the base
    /// stands.
    pub problems: Vec<BaseProblem>,
}

/// What a base says about one property.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PropertySettings {
    /// The name shown in the views, instead of the property's own.
    pub display_name: Option<String>,
}

/// A condition: a statement, or `and`, `or` and `not` over conditions.
#[derive(Debug, Clone, PartialEq)]
pub enum Filter {
    /// Every condition holds.
    And(Vec<Filter>),
    /// Some condition holds.
    Or(Vec<Filter>),
    /// No condition holds.
    Not(Vec<Filter>),
    /// An expression, as written.
    Statement(String),
}

/// One view of a base.
#[derive(Debug, Clone, PartialEq)]
pub struct View {
    /// `type`: `table`, `cards`, `list`, `kanban`, `map`, `calendar`, or a
    /// plugin's own.
    pub kind: String,
    /// `name`: shown in the view menu; names the view in `![[x.base#Name]]`.
    pub name: String,
    pub limit: Option<u64>,
    /// This view's own conditions, applied with the base's.
    pub filters: Option<Filter>,
    pub group_by: Option<Order>,
    /// `order`: the properties shown, in their order.
    pub order: Vec<String>,
    /// `sort`: most significant first.
    pub sort: Vec<Order>,
    /// `summaries`: property id and summary name.
    pub summaries: Vec<(String, String)>,
    /// Every other key of the view, as written: a layout's own settings.
    pub settings: Vec<(String, Value)>,
}

/// A property and a direction, for `groupBy` and each entry of `sort`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Order {
    pub property: String,
    pub descending: bool,
}

/// Something in a base that could not be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BaseProblem {
    /// The text is not YAML, or not a mapping at its top: nothing is read.
    Yaml(String),
    /// Longer than [`MAX_BASE_LEN`]: nothing is read.
    TooLong,
    /// A key whose value has the wrong shape, named by its path in the
    /// YAML (`views[2].sort`): skipped.
    Shape(String),
}

impl std::fmt::Display for BaseProblem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BaseProblem::Yaml(m) => write!(f, "not a base: {m}"),
            BaseProblem::TooLong => write!(f, "base longer than {MAX_BASE_LEN} bytes"),
            BaseProblem::Shape(at) => write!(f, "`{at}` has an unexpected shape"),
        }
    }
}

/// Read `text` as a base. Never fails: a text that is not a base gives an
/// empty one with the reason among its problems.
#[must_use]
pub fn parse_base(text: &str) -> Base {
    let mut base = Base::default();
    if text.len() > MAX_BASE_LEN {
        base.problems.push(BaseProblem::TooLong);
        return base;
    }
    let root = match parse_yaml(text) {
        Ok(Value::Mapping(map)) => map,
        // An empty file is an empty base: every file of the folder, one
        // default view — which is the caller's to supply.
        Ok(Value::Null) => return base,
        Ok(_) => {
            base.problems.push(BaseProblem::Yaml(
                "the top level is not a mapping".to_owned(),
            ));
            return base;
        }
        Err(m) => {
            base.problems.push(BaseProblem::Yaml(m));
            return base;
        }
    };
    for (key, value) in root {
        match key.as_str() {
            "filters" => base.filters = filter(&value, "filters", &mut base.problems),
            "formulas" => base.formulas = strings(&value, "formulas", &mut base.problems),
            "summaries" => base.summaries = strings(&value, "summaries", &mut base.problems),
            "properties" => base.properties = properties(&value, &mut base.problems),
            "views" => match value {
                Value::Sequence(items) => {
                    for (i, item) in items.iter().enumerate() {
                        if let Some(v) = view(item, i, &mut base.problems) {
                            base.views.push(v);
                        }
                    }
                }
                Value::Null => {}
                _ => base.problems.push(BaseProblem::Shape("views".to_owned())),
            },
            // Anything else at the top is someone else's: kept out of the
            // way, not a problem.
            _ => {}
        }
    }
    base
}

/// A scalar as the text it stands for: filters and formulas are strings in
/// the documentation, but YAML reads `true` or `3` unquoted as others.
fn scalar_text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Integer(i) => Some(i.to_string()),
        Value::Float(f) => Some(f.to_string()),
        Value::Null | Value::Sequence(_) | Value::Mapping(_) => None,
    }
}

fn filter(value: &Value, at: &str, problems: &mut Vec<BaseProblem>) -> Option<Filter> {
    if let Some(s) = scalar_text(value) {
        // `filters:` with nothing after it is YAML's empty value, which the
        // reader gives as an empty string: no filter, as null is.
        return (!s.trim().is_empty()).then_some(Filter::Statement(s));
    }
    let Value::Mapping(map) = value else {
        if !matches!(value, Value::Null) {
            problems.push(BaseProblem::Shape(at.to_owned()));
        }
        return None;
    };
    // One of `and`, `or`, `not` per object, the documentation says; an
    // object with several is read as all of them holding.
    let mut parts = Vec::new();
    for (key, inner) in map {
        let here = format!("{at}.{key}");
        let items: Vec<Filter> = match inner {
            Value::Sequence(items) => items
                .iter()
                .enumerate()
                .filter_map(|(i, item)| filter(item, &format!("{here}[{i}]"), problems))
                .collect(),
            Value::Null => Vec::new(),
            other => filter(other, &here, problems).into_iter().collect(),
        };
        match key.as_str() {
            "and" => parts.push(Filter::And(items)),
            "or" => parts.push(Filter::Or(items)),
            "not" => parts.push(Filter::Not(items)),
            _ => problems.push(BaseProblem::Shape(here)),
        }
    }
    match parts.len() {
        0 => None,
        1 => parts.pop(),
        _ => Some(Filter::And(parts)),
    }
}

/// A mapping of names to expression texts (`formulas`, `summaries`).
fn strings(value: &Value, at: &str, problems: &mut Vec<BaseProblem>) -> Vec<(String, String)> {
    match value {
        Value::Mapping(map) => map
            .iter()
            .filter_map(|(k, v)| match scalar_text(v) {
                Some(s) => Some((k.clone(), s)),
                None => {
                    if !matches!(v, Value::Null) {
                        problems.push(BaseProblem::Shape(format!("{at}.{k}")));
                    }
                    None
                }
            })
            .collect(),
        Value::Null => Vec::new(),
        _ => {
            problems.push(BaseProblem::Shape(at.to_owned()));
            Vec::new()
        }
    }
}

fn properties(value: &Value, problems: &mut Vec<BaseProblem>) -> Vec<(String, PropertySettings)> {
    let Value::Mapping(map) = value else {
        if !matches!(value, Value::Null) {
            problems.push(BaseProblem::Shape("properties".to_owned()));
        }
        return Vec::new();
    };
    map.iter()
        .map(|(id, settings)| {
            let display_name = match settings {
                Value::Mapping(s) => s
                    .iter()
                    .find(|(k, _)| k == "displayName")
                    .and_then(|(_, v)| scalar_text(v)),
                _ => None,
            };
            (id.clone(), PropertySettings { display_name })
        })
        .collect()
}

fn order(value: &Value) -> Option<Order> {
    if let Some(property) = scalar_text(value) {
        return Some(Order {
            property,
            descending: false,
        });
    }
    let Value::Mapping(map) = value else {
        return None;
    };
    let property = map
        .iter()
        .find(|(k, _)| k == "property")
        .and_then(|(_, v)| scalar_text(v))?;
    let descending = map
        .iter()
        .find(|(k, _)| k == "direction")
        .and_then(|(_, v)| scalar_text(v))
        .is_some_and(|d| d.eq_ignore_ascii_case("desc"));
    Some(Order {
        property,
        descending,
    })
}

fn view(value: &Value, i: usize, problems: &mut Vec<BaseProblem>) -> Option<View> {
    let at = format!("views[{i}]");
    let Value::Mapping(map) = value else {
        problems.push(BaseProblem::Shape(at));
        return None;
    };
    let mut view = View {
        kind: String::new(),
        name: String::new(),
        limit: None,
        filters: None,
        group_by: None,
        order: Vec::new(),
        sort: Vec::new(),
        summaries: Vec::new(),
        settings: Vec::new(),
    };
    for (key, v) in map {
        let here = format!("{at}.{key}");
        match key.as_str() {
            "type" => view.kind = scalar_text(v).unwrap_or_default(),
            "name" => view.name = scalar_text(v).unwrap_or_default(),
            "limit" => match v {
                Value::Integer(n) if *n >= 0 => view.limit = u64::try_from(*n).ok(),
                Value::Null => {}
                _ => problems.push(BaseProblem::Shape(here)),
            },
            "filters" => view.filters = filter(v, &here, problems),
            "groupBy" => match order(v) {
                Some(o) => view.group_by = Some(o),
                None if matches!(v, Value::Null) => {}
                None => problems.push(BaseProblem::Shape(here)),
            },
            "order" => match v {
                Value::Sequence(items) => {
                    view.order = items.iter().filter_map(scalar_text).collect();
                }
                Value::Null => {}
                _ => problems.push(BaseProblem::Shape(here)),
            },
            "sort" => match v {
                Value::Sequence(items) => view.sort = items.iter().filter_map(order).collect(),
                Value::Null => {}
                _ => problems.push(BaseProblem::Shape(here)),
            },
            "summaries" => view.summaries = strings(v, &here, problems),
            _ => view.settings.push((key.clone(), v.clone())),
        }
    }
    if view.kind.is_empty() {
        problems.push(BaseProblem::Shape(format!("{at}.type")));
        return None;
    }
    Some(view)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The example of "Bases syntax", as the page gives it.
    const EXAMPLE: &str = r#"filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("book")
        - file.inFolder("Required Reading")
formulas:
  formatted_price: 'if(price, price.toFixed(2) + " dollars")'
  ppu: "(price / age).toFixed(2)"
properties:
  status:
    displayName: Status
  formula.formatted_price:
    displayName: "Price"
  file.ext:
    displayName: Extension
summaries:
  customAverage: 'values.mean().round(3)'
views:
  - type: table
    name: "My table"
    limit: 10
    groupBy:
      property: note.age
      direction: DESC
    filters:
      and:
        - 'status != "done"'
        - or:
            - "formula.ppu > 5"
            - "price > 2.1"
    order:
      - file.name
      - file.ext
      - note.age
      - formula.ppu
      - formula.formatted_price
    summaries:
      formula.ppu: Average
"#;

    #[test]
    fn the_documented_example_reads_whole() {
        let base = parse_base(EXAMPLE);
        assert_eq!(base.problems, vec![]);
        let st = |s: &str| Filter::Statement(s.to_owned());
        assert_eq!(
            base.filters,
            Some(Filter::Or(vec![
                st(r#"file.hasTag("tag")"#),
                Filter::And(vec![
                    st(r#"file.hasTag("book")"#),
                    st(r#"file.hasLink("Textbook")"#)
                ]),
                Filter::Not(vec![
                    st(r#"file.hasTag("book")"#),
                    st(r#"file.inFolder("Required Reading")"#)
                ]),
            ]))
        );
        assert_eq!(base.formulas.len(), 2);
        assert_eq!(
            base.formulas[1],
            ("ppu".to_owned(), "(price / age).toFixed(2)".to_owned())
        );
        assert_eq!(base.properties[1].0, "formula.formatted_price");
        assert_eq!(base.properties[1].1.display_name.as_deref(), Some("Price"));
        assert_eq!(
            base.summaries,
            vec![(
                "customAverage".to_owned(),
                "values.mean().round(3)".to_owned()
            )]
        );
        let v = &base.views[0];
        assert_eq!(
            (v.kind.as_str(), v.name.as_str(), v.limit),
            ("table", "My table", Some(10))
        );
        assert_eq!(
            v.group_by,
            Some(Order {
                property: "note.age".into(),
                descending: true
            })
        );
        assert_eq!(v.order.len(), 5);
        assert_eq!(
            v.summaries,
            vec![("formula.ppu".to_owned(), "Average".to_owned())]
        );
        assert!(v.settings.is_empty());
        for (_, text) in &base.formulas {
            assert!(parse_expression(text).is_ok(), "{text}");
        }
    }

    #[test]
    fn a_view_keeps_its_own_settings_and_its_sort() {
        let base = parse_base(
            "views:\n  - type: cards\n    name: Galeria\n    image: note.capa\n    cardSize: 230\n    sort:\n      - property: file.name\n        direction: ASC\n      - property: nível\n        direction: DESC\n",
        );
        let v = &base.views[0];
        assert_eq!(v.sort.len(), 2);
        assert!(v.sort[1].descending && v.sort[1].property == "nível");
        assert_eq!(
            v.settings,
            vec![
                ("image".to_owned(), Value::String("note.capa".into())),
                ("cardSize".to_owned(), Value::Integer(230)),
            ]
        );
    }

    #[test]
    fn what_cannot_be_read_is_reported_and_the_rest_stands() {
        let base = parse_base(
            "views:\n  - type: table\n    name: A\n    sort: 3\n  - name: sem tipo\n  - 7\n  - type: list\n    name: B\n",
        );
        assert_eq!(
            base.views
                .iter()
                .map(|v| v.name.as_str())
                .collect::<Vec<_>>(),
            vec!["A", "B"]
        );
        assert_eq!(
            base.problems,
            vec![
                BaseProblem::Shape("views[0].sort".into()),
                BaseProblem::Shape("views[1].type".into()),
                BaseProblem::Shape("views[2]".into()),
            ]
        );
        assert!(matches!(
            parse_base("- a\n- b\n").problems[0],
            BaseProblem::Yaml(_)
        ));
        assert!(matches!(
            parse_base("a: [\n").problems[0],
            BaseProblem::Yaml(_)
        ));
        assert_eq!(parse_base(""), Base::default());
        assert_eq!(
            parse_base(&"#".repeat(MAX_BASE_LEN + 1)).problems,
            vec![BaseProblem::TooLong]
        );
    }

    #[test]
    fn a_filter_may_be_one_statement_or_an_object_with_several_keys() {
        assert_eq!(
            parse_base("filters: status == 1\n").filters,
            Some(Filter::Statement("status == 1".into()))
        );
        assert_eq!(
            parse_base("filters: true\n").filters,
            Some(Filter::Statement("true".into()))
        );
        let base = parse_base("filters:\n  and:\n    - a\n  not:\n    - b\n");
        assert_eq!(
            base.filters,
            Some(Filter::And(vec![
                Filter::And(vec![Filter::Statement("a".into())]),
                Filter::Not(vec![Filter::Statement("b".into())]),
            ]))
        );
        let base = parse_base("filters:\n  xor:\n    - a\n");
        assert_eq!(
            base.problems,
            vec![BaseProblem::Shape("filters.xor".into())]
        );
    }

    /// `filters:` with nothing after it is no filter, as YAML reads an
    /// empty value (null), for the base and for a view: the folder page of
    /// a folder's root wrote it and showed "Expressão inválida: : empty
    /// expression" over 0 results (the re-test of 2026-11-04).
    #[test]
    fn an_empty_filter_is_no_filter() {
        let base = parse_base("filters:\nviews:\n  - type: table\n    filters:\n");
        assert_eq!(base.filters, None);
        assert_eq!(base.views[0].filters, None);
        assert_eq!(base.problems, vec![]);
        assert_eq!(parse_base("filters: \"\"\n").filters, None);
        assert_eq!(parse_base("filters: \"  \"\n").filters, None);
    }

    #[test]
    fn group_by_and_sort_accept_scalar_string_or_mapping() {
        let base = parse_base(
            "views:\n  - type: kanban\n    name: Status\n    groupBy: status\n    sort:\n      - file.name\n",
        );
        assert_eq!(base.problems, vec![]);
        let v = &base.views[0];
        assert_eq!(
            v.group_by,
            Some(Order {
                property: "status".to_string(),
                descending: false,
            })
        );
        assert_eq!(
            v.sort,
            vec![Order {
                property: "file.name".to_string(),
                descending: false,
            }]
        );
    }
}
