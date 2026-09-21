// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The YAML frontmatter block (spec §5.1), read and never rewritten.
//!
//! The base parser hands the block over as one opaque range; this module
//! parses the YAML inside it into a [`Value`] tree of its own, so that the
//! public API does not depend on the YAML crate. Key order is kept as in the
//! file. The YAML dialect is 1.2 (core schema): `yes` is a string, `2024` is an
//! integer. Whether that is the final answer is spec Q24.

use saphyr::{LoadableYamlNode, Scalar, Yaml};
use saphyr_parser::{Event, Parser};

use crate::position::Span;

/// Deepest nesting of sequences and mappings accepted in a frontmatter.
///
/// `saphyr` builds its tree recursively, one stack frame per level, and a
/// block sequence a few thousand levels deep (an 8 KB file) overflows the
/// stack and aborts the process — not a panic, nothing catches it. Q18,
/// property 1, says `parse` returns for every input, so the depth is checked
/// on the event stream, which is iterative, before any tree exists. Real
/// frontmatters are one or two levels deep. The number is provisional: the
/// limits of Q17 are the maintainer's to set.
pub const MAX_YAML_DEPTH: usize = 64;

/// The frontmatter block: where it is and what it says.
#[derive(Debug, Clone, PartialEq)]
pub struct Frontmatter {
    /// Byte range from the opening `---` to the closing `---`, inclusive.
    pub span: Span,
    /// The interpreted values, or the YAML parser's message when the block is
    /// not valid YAML. An invalid block is still reported, with its span, so
    /// that the caller can show where the problem is.
    pub values: Result<Value, String>,
}

/// A YAML value, with mapping keys as strings in document order.
///
/// Floats compare by bit pattern, not by IEEE equality, so that a document
/// containing `.nan` still equals itself (Q18, property 2).
#[derive(Debug, Clone)]
pub enum Value {
    Null,
    Bool(bool),
    Integer(i64),
    Float(f64),
    String(String),
    Sequence(Vec<Value>),
    Mapping(Vec<(String, Value)>),
}

impl PartialEq for Value {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Null, Self::Null) => true,
            (Self::Bool(a), Self::Bool(b)) => a == b,
            (Self::Integer(a), Self::Integer(b)) => a == b,
            (Self::Float(a), Self::Float(b)) => a.to_bits() == b.to_bits(),
            (Self::String(a), Self::String(b)) => a == b,
            (Self::Sequence(a), Self::Sequence(b)) => a == b,
            (Self::Mapping(a), Self::Mapping(b)) => a == b,
            _ => false,
        }
    }
}

/// Parse the text between the `---` delimiters. Several documents in one
/// block (`---` separators inside it) are not a frontmatter Obsidian
/// documents; only the first is kept. An empty block is `Null`.
pub(crate) fn parse_yaml(text: &str) -> Result<Value, String> {
    check_depth(text)?;
    let mut documents = Yaml::load_from_str(text).map_err(|e| e.to_string())?;
    if documents.is_empty() {
        return Ok(Value::Null);
    }
    Ok(convert(documents.swap_remove(0)))
}

/// Walk the event stream and refuse a nesting deeper than
/// [`MAX_YAML_DEPTH`]. A scan error here is reported as such; the loader
/// would report the same one.
fn check_depth(text: &str) -> Result<(), String> {
    let mut depth = 0usize;
    for event in Parser::new_from_str(text) {
        let (event, _) = event.map_err(|e| e.to_string())?;
        match event {
            Event::SequenceStart(..) | Event::MappingStart(..) => {
                depth += 1;
                if depth > MAX_YAML_DEPTH {
                    return Err(format!(
                        "frontmatter nested deeper than {MAX_YAML_DEPTH} levels"
                    ));
                }
            }
            Event::SequenceEnd | Event::MappingEnd => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    Ok(())
}

/// Recursive, and safe to be: the depth of the tree was bounded by
/// [`check_depth`] before `saphyr` built it.
pub(crate) fn convert(yaml: Yaml<'_>) -> Value {
    match yaml {
        Yaml::Value(scalar) => scalar_value(scalar),
        Yaml::Representation(text, _, _) => Value::String(text.into_owned()),
        Yaml::Sequence(items) => Value::Sequence(items.into_iter().map(convert).collect()),
        Yaml::Mapping(map) => Value::Mapping(
            map.into_iter()
                .map(|(key, value)| (key_string(&key), convert(value)))
                .collect(),
        ),
        Yaml::Tagged(_, inner) => convert(*inner),
        Yaml::Alias(_) | Yaml::BadValue => Value::Null,
    }
}

fn scalar_value(scalar: Scalar<'_>) -> Value {
    match scalar {
        Scalar::Null => Value::Null,
        Scalar::Boolean(b) => Value::Bool(b),
        Scalar::Integer(i) => Value::Integer(i),
        Scalar::FloatingPoint(f) => Value::Float(f.into_inner()),
        Scalar::String(s) => Value::String(s.into_owned()),
    }
}

/// A mapping key as text. Scalar keys keep their text; a collection as a key
/// (legal YAML, absurd in a frontmatter) is rendered from its debug form so
/// that nothing is silently dropped.
fn key_string(key: &Yaml<'_>) -> String {
    match key {
        Yaml::Value(Scalar::String(s)) => s.to_string(),
        Yaml::Value(Scalar::Null) => "null".to_owned(),
        Yaml::Value(Scalar::Boolean(b)) => b.to_string(),
        Yaml::Value(Scalar::Integer(i)) => i.to_string(),
        Yaml::Value(Scalar::FloatingPoint(f)) => f.to_string(),
        Yaml::Representation(text, _, _) => text.to_string(),
        other => format!("{other:?}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(text: &str) -> Value {
        Value::String(text.to_owned())
    }

    #[test]
    fn spec_example_keeps_key_order() {
        let yaml = "title: Barão Vermelho\ntags: [npc, nobreza]\naliases:\n  - o barão\n  - Lorde Vermelho\n";
        let value = parse_yaml(yaml).unwrap();
        assert_eq!(
            value,
            Value::Mapping(vec![
                ("title".to_owned(), s("Barão Vermelho")),
                (
                    "tags".to_owned(),
                    Value::Sequence(vec![s("npc"), s("nobreza")])
                ),
                (
                    "aliases".to_owned(),
                    Value::Sequence(vec![s("o barão"), s("Lorde Vermelho")])
                ),
            ])
        );
    }

    #[test]
    fn yaml_1_2_core_schema() {
        let value = parse_yaml("a: yes\nb: 2024\nc: 1.5\nd: ~\ne: true\n").unwrap();
        assert_eq!(
            value,
            Value::Mapping(vec![
                ("a".to_owned(), s("yes")),
                ("b".to_owned(), Value::Integer(2024)),
                ("c".to_owned(), Value::Float(1.5)),
                ("d".to_owned(), Value::Null),
                ("e".to_owned(), Value::Bool(true)),
            ])
        );
    }

    #[test]
    fn invalid_yaml_is_an_error_not_a_panic() {
        assert!(parse_yaml("a: [unclosed\n").is_err());
        assert_eq!(parse_yaml("").unwrap(), Value::Null);
    }

    #[test]
    fn nesting_is_bounded_before_a_tree_exists() {
        // 4 000 levels of block sequence overflow saphyr's loader; the event
        // pre-pass refuses it and parse_yaml returns instead of aborting.
        let deep = format!("{}x\n", "- ".repeat(4_000));
        let error = parse_yaml(&deep).unwrap_err();
        assert!(error.contains("deeper than"), "{error}");
        let deep_map = "a:\n".to_owned()
            + &(1..=MAX_YAML_DEPTH + 1)
                .map(|i| format!("{}b{i}:\n", " ".repeat(i)))
                .collect::<String>();
        assert!(parse_yaml(&deep_map).is_err());
        // At the limit it still parses.
        let at_limit = format!("{}x\n", "- ".repeat(MAX_YAML_DEPTH));
        assert!(parse_yaml(&at_limit).is_ok());
        // Flow style already had saphyr's own limit; still an error, not an abort.
        assert!(parse_yaml(&"[".repeat(10_000)).is_err());
    }

    #[test]
    fn nan_equals_itself() {
        let value = parse_yaml("x: .nan\n").unwrap();
        assert_eq!(value, value.clone());
    }
}
