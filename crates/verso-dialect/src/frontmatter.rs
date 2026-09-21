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
use saphyr_parser::{Event, Parser, Tag};
use std::borrow::Cow;

use crate::position::Span;

/// Deepest nesting accepted in a frontmatter (a scalar under 64 collections
/// is at depth 65 and refused), and the largest number of nodes in the
/// tree the loader would build, counted **after** aliases are expanded and
/// with one extra node per value tagged outside the YAML core schema.
///
/// `Yaml::load_from_str` goes through `saphyr_parser`'s loading driver,
/// which recurses once per level, and its loader expands an alias by cloning
/// the anchored node; a chain of aliases makes a tree far deeper and larger
/// than the text that describes it. Either shape overflows the stack or the
/// allocator and aborts the process — not a panic, nothing catches it. Q18,
/// property 1, says `parse` returns for every input, so both quantities are
/// measured on the event stream, which is iterative, before any tree exists.
/// Real frontmatters are one or two levels deep and a few dozen nodes. The
/// numbers are provisional: the limits of Q17 are the maintainer's to set.
pub(crate) const MAX_YAML_DEPTH: usize = 64;
pub(crate) const MAX_YAML_NODES: usize = 10_000;

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

/// Walk the event stream and refuse a document whose *expanded* tree would
/// be deeper than [`MAX_YAML_DEPTH`] or hold more than [`MAX_YAML_NODES`]
/// nodes. Every open collection is a frame on an explicit stack; when it
/// closes, its height (levels below it) and size (nodes in it) are known,
/// and if it carried an anchor they are recorded, so that an alias to it is
/// charged the same height and size at the point where it appears — which
/// is what the loader will build there by cloning. A scan error is reported
/// as such; the loader would report the same one.
fn check_depth(text: &str) -> Result<(), String> {
    // Every collection still open, innermost last, and the levels they
    // occupy in the tree: one each, plus one for a tag wrapper.
    let mut open: Vec<Frame> = Vec::new();
    let mut open_depth = 0usize;
    // Height and size of each anchored node, by anchor id.
    let mut anchors: Vec<(usize, Frame)> = Vec::new();
    let mut total_nodes = 0usize;

    // A node is closed: charge it to the document, then fold it into its
    // parent. `charged` is what it adds: itself and its tag wrapper for a
    // node the text spells out (its children charged themselves when they
    // closed); the whole recorded size for an alias, which the loader clones.
    // Duplicate mapping keys are counted although the loader keeps one: the
    // pre-pass errs on the strict side there, never on the loose one.
    let close = |open: &mut Vec<Frame>,
                 open_depth: usize,
                 anchors: &mut Vec<(usize, Frame)>,
                 total_nodes: &mut usize,
                 node: Frame,
                 charged: usize|
     -> Result<(), String> {
        *total_nodes += charged;
        if *total_nodes > MAX_YAML_NODES {
            return Err(format!(
                "frontmatter expands to more than {MAX_YAML_NODES} nodes"
            ));
        }
        // Levels of the ancestors, plus this node's own levels.
        if open_depth + node.levels() > MAX_YAML_DEPTH {
            return Err(format!(
                "frontmatter nested deeper than {MAX_YAML_DEPTH} levels"
            ));
        }
        if node.anchor != 0 {
            anchors.push((node.anchor, node));
        }
        if let Some(parent) = open.last_mut() {
            parent.height = parent.height.max(node.levels());
            parent.size += node.size;
        }
        Ok(())
    };

    // A tag outside the YAML core schema makes the loader wrap the node in
    // one more `Yaml::Tagged` level: one extra node, one extra level.
    let wrapper_of =
        |tag: Option<Cow<'_, Tag>>| usize::from(tag.is_some_and(|t| !t.is_yaml_core_schema()));

    for event in Parser::new_from_str(text) {
        let (event, _) = event.map_err(|e| e.to_string())?;
        match event {
            Event::SequenceStart(anchor, tag) | Event::MappingStart(anchor, tag) => {
                let wrapper = wrapper_of(tag);
                if open_depth + 1 + wrapper > MAX_YAML_DEPTH {
                    return Err(format!(
                        "frontmatter nested deeper than {MAX_YAML_DEPTH} levels"
                    ));
                }
                open_depth += 1 + wrapper;
                open.push(Frame {
                    anchor,
                    wrapper,
                    height: 0,
                    size: 1 + wrapper,
                });
            }
            Event::SequenceEnd | Event::MappingEnd => {
                let Some(node) = open.pop() else {
                    return Err("frontmatter: unbalanced collection".to_owned());
                };
                open_depth -= 1 + node.wrapper;
                // The collection itself and its wrapper; the children
                // charged themselves when they closed.
                let charged = 1 + node.wrapper;
                close(
                    &mut open,
                    open_depth,
                    &mut anchors,
                    &mut total_nodes,
                    node,
                    charged,
                )?;
            }
            Event::Scalar(_, _, anchor, tag) => {
                let wrapper = wrapper_of(tag);
                let node = Frame {
                    anchor,
                    wrapper,
                    height: 0,
                    size: 1 + wrapper,
                };
                close(
                    &mut open,
                    open_depth,
                    &mut anchors,
                    &mut total_nodes,
                    node,
                    node.size,
                )?;
            }
            Event::Alias(id) => {
                let node = anchors.iter().rev().find(|(a, _)| *a == id).map_or(
                    Frame {
                        anchor: 0,
                        wrapper: 0,
                        height: 0,
                        size: 1,
                    },
                    |(_, node)| Frame { anchor: 0, ..*node },
                );
                // The loader clones the whole anchored node here.
                close(
                    &mut open,
                    open_depth,
                    &mut anchors,
                    &mut total_nodes,
                    node,
                    node.size,
                )?;
            }
            _ => {}
        }
    }
    Ok(())
}

/// What the pre-pass knows about one node, after alias expansion: whether a
/// tag wraps it, the levels below it, and the nodes in it (itself, its
/// wrapper if any, and everything under it).
#[derive(Clone, Copy)]
struct Frame {
    anchor: usize,
    wrapper: usize,
    height: usize,
    size: usize,
}

impl Frame {
    /// Levels this node occupies: its wrapper, itself, and what is below.
    fn levels(&self) -> usize {
        self.wrapper + 1 + self.height
    }
}

/// Recursive, and safe to be: the depth and size of the tree, aliases
/// expanded, were bounded by [`check_depth`] before `saphyr` built it.
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
        // 4 000 levels of block sequence overflow the loading driver; the
        // event pre-pass refuses it and parse_yaml returns instead of aborting.
        let deep = format!("{}x\n", "- ".repeat(4_000));
        let error = parse_yaml(&deep).unwrap_err();
        assert!(error.contains("deeper than"), "{error}");
        let deep_map = "a:\n".to_owned()
            + &(1..=MAX_YAML_DEPTH + 1)
                .map(|i| format!("{}b{i}:\n", " ".repeat(i)))
                .collect::<String>();
        assert!(parse_yaml(&deep_map).is_err());
        // The depth counts the node itself: 63 sequences and the scalar
        // under them are 64 levels and pass; 64 sequences do not.
        assert!(parse_yaml(&format!("{}x\n", "- ".repeat(MAX_YAML_DEPTH - 1))).is_ok());
        assert!(parse_yaml(&format!("{}x\n", "- ".repeat(MAX_YAML_DEPTH))).is_err());
        // Flow style already had saphyr's own limit; still an error, not an abort.
        assert!(parse_yaml(&"[".repeat(10_000)).is_err());
    }

    #[test]
    fn aliases_are_charged_what_they_expand_to() {
        // A chain of aliases: event depth 2 everywhere, expanded depth n + 1.
        let chain = |n: usize| {
            let mut text = "a0: &a0 [x]\n".to_owned();
            for i in 1..=n {
                text.push_str(&format!("a{i}: &a{i} [*a{}]\n", i - 1));
            }
            text
        };
        assert!(parse_yaml(&chain(MAX_YAML_DEPTH - 3)).is_ok());
        let error = parse_yaml(&chain(1_000)).unwrap_err();
        assert!(error.contains("deeper than"), "{error}");
        // Fan-out: 347 bytes that expand to millions of nodes.
        let mut fan = "a0: &a0 [x]\n".to_owned();
        for i in 1..=7 {
            let prev = format!("*a{}", i - 1);
            fan.push_str(&format!("a{i}: &a{i} [{}]\n", [prev.as_str(); 9].join(",")));
        }
        let error = parse_yaml(&fan).unwrap_err();
        assert!(error.contains("more than"), "{error}");
        // The budget counts nodes, not nesting: a flat mapping of 4 000
        // keys is 8 001 nodes and passes; 5 000 keys is 10 001 and does not.
        let flat = |n: usize| (0..n).map(|i| format!("k{i}: v\n")).collect::<String>();
        assert!(parse_yaml(&flat(4_000)).is_ok());
        assert!(parse_yaml(&flat(5_000)).unwrap_err().contains("more than"));
        // A tag wraps the node in one more level, which is charged.
        assert!(parse_yaml(&format!("{}x{}\n", "!t [".repeat(40), "]".repeat(40))).is_err());
        assert!(parse_yaml(&format!("{}x{}\n", "[".repeat(40), "]".repeat(40))).is_ok());
        // An ordinary alias still expands, as before.
        let value = parse_yaml("base: &b [1, 2]\ncopy: *b\n").unwrap();
        let Value::Mapping(map) = value else { panic!() };
        assert_eq!(map[0].1, map[1].1);
    }

    /// Depth and node count of the tree `saphyr` actually builds, so that the
    /// pre-pass can be checked against the thing it models.
    fn measure(yaml: &Yaml<'_>) -> (usize, usize) {
        match yaml {
            Yaml::Sequence(items) => {
                let (d, n) = items
                    .iter()
                    .map(measure)
                    .fold((0, 0), |a, b| (a.0.max(b.0), a.1 + b.1));
                (1 + d, 1 + n)
            }
            Yaml::Mapping(map) => {
                let (d, n) = map
                    .iter()
                    .flat_map(|(k, v)| [measure(k), measure(v)])
                    .fold((0, 0), |a, b| (a.0.max(b.0), a.1 + b.1));
                (1 + d, 1 + n)
            }
            Yaml::Tagged(_, inner) => {
                let (d, n) = measure(inner);
                (1 + d, 1 + n)
            }
            _ => (1, 1),
        }
    }

    #[test]
    fn the_pre_pass_models_the_loaded_tree() {
        // Shapes mixing tags, anchors, aliases, flow and block style; for each
        // one the pre-pass must accept exactly what the loaded tree would fit.
        // The one known over-count is a duplicate mapping key, which the
        // loader collapses and the pre-pass charges: strict, never loose.
        let shapes = [
            "a: 1\n".to_owned(),
            "!t [ !t [ x ] ]\n".to_owned(),
            "a: !t 1\nb: !!str 2\n".to_owned(),
            "base: &b [1, [2, [3]]]\ncopy: *b\nagain: [*b, *b]\n".to_owned(),
            "x: &x !t [ &y !u { k: !v [1] } ]\ny: [*x, *y]\n".to_owned(),
            "? [a, b]\n: c\n".to_owned(),
            "a: &a [*a, *a]\n".to_owned(),
            format!("{}x{}\n", "!t [".repeat(31), "]".repeat(31)),
            format!("{}x{}\n", "!t [".repeat(32), "]".repeat(32)),
            format!("{}x\n", "- ".repeat(63)),
            format!("{}x\n", "- ".repeat(64)),
        ];
        for text in &shapes {
            let tree = Yaml::load_from_str(text).unwrap();
            let (depth, nodes) = tree
                .iter()
                .map(measure)
                .fold((0, 0), |a, b| (a.0.max(b.0), a.1 + b.1));
            let fits = depth <= MAX_YAML_DEPTH && nodes <= MAX_YAML_NODES;
            assert_eq!(
                check_depth(text).is_ok(),
                fits,
                "{text:?}: tree depth {depth}, nodes {nodes}"
            );
        }
    }

    #[test]
    fn nan_equals_itself() {
        let value = parse_yaml("x: .nan\n").unwrap();
        assert_eq!(value, value.clone());
    }
}
