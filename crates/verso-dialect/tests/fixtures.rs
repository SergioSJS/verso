// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The behavior contract (ADR 0031): every fixture in `fixtures/` runs
//! through `parse` and its `expected.yaml` is checked against the report,
//! under the rules of spec §4 — an absent key asserts nothing; a present
//! list asserts the whole list, in order; an absent optional field asserts
//! that the field is absent; `pos` asserts only when written.
//!
//! The crate has no IO (ADR 0028), so the fixtures are embedded at compile
//! time with `include_str!` and listed by hand in `fixture_tests!` below.
//! `scripts/check-fixtures.sh` fails CI when a fixture directory is missing
//! from that list, so a fixture cannot exist and not run.
//!
//! `expected.yaml` is untouchable without the maintainer's approval. If a test
//! here fails, the code is wrong until the maintainer says otherwise
//! (CLAUDE.md §2.4).

use saphyr::{LoadableYamlNode, Scalar, Yaml};
use verso_dialect::{Document, Pos, Value, parse};

/// One line per fixture: test name => path under `fixtures/`.
macro_rules! fixture_tests {
    ($($name:ident => $path:literal),* $(,)?) => {
        $(
            #[test]
            fn $name() {
                check(
                    $path,
                    include_str!(concat!("../../../fixtures/", $path, "/input.md")),
                    include_str!(concat!("../../../fixtures/", $path, "/expected.yaml")),
                );
            }
        )*
    };
}

fixture_tests! {
    // Approved by the maintainer on 2026-09-21.
    code_no_link_in_code => "code/no-link-in-code",
    wikilink_alias => "wikilink/alias",
    wikilink_block_reference => "wikilink/block-reference",
    wikilink_heading => "wikilink/heading",
    wikilink_simple => "wikilink/simple",
    // AI drafts of this PR, awaiting approval (first line of each expected.yaml).
    block_definition => "block/definition",
    callout_simple => "callout/simple",
    embed_simple => "embed/simple",
    frontmatter_tags_aliases => "frontmatter/tags-aliases",
    heading_atx => "heading/atx",
    wikilink_accent_space => "wikilink/accent-space",
}

fn check(name: &str, input: &str, expected: &str) {
    let document = parse(input);
    let mut docs = match Yaml::load_from_str(expected) {
        Ok(docs) => docs,
        Err(error) => panic!("{name}: expected.yaml is not valid YAML: {error}"),
    };
    assert_eq!(docs.len(), 1, "{name}: expected.yaml holds one document");
    let Yaml::Mapping(top) = docs.swap_remove(0) else {
        panic!("{name}: expected.yaml is a mapping");
    };
    let mut failures = Vec::new();
    for (key, value) in &top {
        let key = key_str(key);
        let mut ctx = Ctx {
            name,
            path: key.clone(),
            failures: &mut failures,
        };
        match key.as_str() {
            "frontmatter" => check_frontmatter(&mut ctx, &document, value),
            "headings" => check_list(&mut ctx, value, &document.headings, check_heading),
            "links" => check_list(&mut ctx, value, &document.links, check_link),
            "embeds" => check_list(&mut ctx, value, &document.embeds, check_embed),
            "blocks" => check_list(&mut ctx, value, &document.blocks, check_block),
            "callouts" => check_list(&mut ctx, value, &document.callouts, check_callout),
            // Provenance, not behavior (spec §4.5); the lint script checks them.
            "observed" | "source" => {}
            other => ctx.fail(format!("unknown top-level key `{other}` (spec §4.1)")),
        }
    }
    assert!(
        failures.is_empty(),
        "fixture {name} disagrees with the parser:\n  {}\n\nreport: {document:#?}",
        failures.join("\n  ")
    );
}

struct Ctx<'a> {
    name: &'a str,
    path: String,
    failures: &'a mut Vec<String>,
}

impl Ctx<'_> {
    fn fail(&mut self, message: String) {
        self.failures.push(format!("{}: {message}", self.path));
    }

    fn at(&mut self, suffix: &str) -> Ctx<'_> {
        Ctx {
            name: self.name,
            path: format!("{}{suffix}", self.path),
            failures: self.failures,
        }
    }
}

fn key_str(key: &Yaml<'_>) -> String {
    match key {
        Yaml::Value(Scalar::String(s)) => s.to_string(),
        other => format!("{other:?}"),
    }
}

fn as_str<'a>(value: &'a Yaml<'_>) -> Option<&'a str> {
    match value {
        Yaml::Value(Scalar::String(s)) => Some(s),
        _ => None,
    }
}

fn as_int(value: &Yaml<'_>) -> Option<i64> {
    match value {
        Yaml::Value(Scalar::Integer(i)) => Some(*i),
        _ => None,
    }
}

/// A list key asserts the whole list: same length, same order.
fn check_list<T>(
    ctx: &mut Ctx<'_>,
    expected: &Yaml<'_>,
    actual: &[T],
    check_item: fn(&mut Ctx<'_>, &Yaml<'_>, &T),
) {
    let Yaml::Sequence(items) = expected else {
        ctx.fail("must be a list".to_owned());
        return;
    };
    if items.len() != actual.len() {
        ctx.fail(format!(
            "expected {} item(s), the parser found {}",
            items.len(),
            actual.len()
        ));
        return;
    }
    for (i, (item, found)) in items.iter().zip(actual).enumerate() {
        check_item(&mut ctx.at(&format!("[{i}]")), item, found);
    }
}

/// The fields of one item, each checked once; a field the schema knows but the
/// fixture omits asserts absence, except `pos` (spec §4.2, §4.3).
struct Fields<'a, 'y> {
    ctx: &'a mut Ctx<'y>,
    map: Vec<(String, &'a Yaml<'a>)>,
    seen: Vec<String>,
}

impl<'a, 'y> Fields<'a, 'y> {
    fn new(ctx: &'a mut Ctx<'y>, item: &'a Yaml<'a>) -> Option<Self> {
        let Yaml::Mapping(map) = item else {
            ctx.fail("item must be a mapping".to_owned());
            return None;
        };
        Some(Self {
            ctx,
            map: map.iter().map(|(k, v)| (key_str(k), v)).collect(),
            seen: Vec::new(),
        })
    }

    fn get(&mut self, field: &str) -> Option<&'a Yaml<'a>> {
        self.seen.push(field.to_owned());
        self.map.iter().find(|(k, _)| k == field).map(|(_, v)| *v)
    }

    fn text(&mut self, field: &str, actual: &str) {
        match self.get(field).map(as_str) {
            Some(Some(expected)) if expected == actual => {}
            Some(Some(expected)) => self
                .ctx
                .fail(format!("{field}: expected {expected:?}, got {actual:?}")),
            Some(None) => self.ctx.fail(format!("{field}: must be text")),
            None => self.ctx.fail(format!("{field}: required by the schema")),
        }
    }

    fn optional_text(&mut self, field: &str, actual: Option<&str>) {
        match (self.get(field).map(as_str), actual) {
            (None, None) => {}
            (Some(Some(expected)), Some(actual)) if expected == actual => {}
            (Some(Some(expected)), actual) => self
                .ctx
                .fail(format!("{field}: expected {expected:?}, got {actual:?}")),
            (Some(None), _) => self.ctx.fail(format!("{field}: must be text")),
            (None, Some(actual)) => self.ctx.fail(format!(
                "{field}: fixture asserts none, the parser found {actual:?}"
            )),
        }
    }

    fn int(&mut self, field: &str, actual: i64) {
        match self.get(field).map(as_int) {
            Some(Some(expected)) if expected == actual => {}
            Some(Some(expected)) => self
                .ctx
                .fail(format!("{field}: expected {expected}, got {actual}")),
            Some(None) => self.ctx.fail(format!("{field}: must be an integer")),
            None => self.ctx.fail(format!("{field}: required by the schema")),
        }
    }

    fn pos(&mut self, actual: Pos) {
        let Some(expected) = self.get("pos") else {
            return;
        };
        let Yaml::Mapping(map) = expected else {
            self.ctx.fail("pos: must be { line, col }".to_owned());
            return;
        };
        let mut line = None;
        let mut col = None;
        for (k, v) in map {
            match key_str(k).as_str() {
                "line" => line = as_int(v),
                "col" => col = as_int(v),
                other => self.ctx.fail(format!("pos: unknown key `{other}`")),
            }
        }
        let expected = (line, col);
        let actual = (Some(i64::from(actual.line)), Some(i64::from(actual.col)));
        if expected != actual {
            self.ctx.fail(format!(
                "pos: expected line {:?} col {:?}, got line {:?} col {:?}",
                expected.0, expected.1, actual.0, actual.1
            ));
        }
    }

    /// Call last: any field the fixture wrote that no check consumed is a
    /// schema violation, not a silent pass.
    fn finish(self) {
        for (field, _) in &self.map {
            if !self.seen.contains(field) {
                self.ctx
                    .fail(format!("{field}: not a field of this list (spec §4)"));
            }
        }
    }
}

fn check_link(ctx: &mut Ctx<'_>, item: &Yaml<'_>, link: &verso_dialect::Link) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    fields.text("target", &link.target);
    fields.optional_text("heading", link.heading.as_deref());
    fields.optional_text("block", link.block.as_deref());
    fields.optional_text("alias", link.alias.as_deref());
    // Markdown links (spec §5.13) are PROPOSED; only wikilinks exist here.
    fields.optional_text("syntax", None);
    fields.pos(link.pos);
    fields.finish();
}

fn check_embed(ctx: &mut Ctx<'_>, item: &Yaml<'_>, embed: &verso_dialect::Embed) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    fields.text("target", &embed.target);
    fields.optional_text("heading", embed.heading.as_deref());
    fields.optional_text("block", embed.block.as_deref());
    fields.optional_text("alias", embed.alias.as_deref());
    fields.optional_text("syntax", None);
    fields.pos(embed.pos);
    fields.finish();
}

fn check_heading(ctx: &mut Ctx<'_>, item: &Yaml<'_>, heading: &verso_dialect::Heading) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    fields.int("level", i64::from(heading.level));
    fields.text("text", &heading.text);
    fields.pos(heading.pos);
    fields.finish();
}

fn check_block(ctx: &mut Ctx<'_>, item: &Yaml<'_>, block: &verso_dialect::BlockId) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    fields.text("id", &block.id);
    fields.pos(block.pos);
    fields.finish();
}

fn check_callout(ctx: &mut Ctx<'_>, item: &Yaml<'_>, callout: &verso_dialect::Callout) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    fields.text("kind", &callout.kind);
    fields.optional_text("title", callout.title.as_deref());
    let fold = callout.fold.map(|f| match f {
        verso_dialect::Fold::Collapsed => "-",
        verso_dialect::Fold::Expanded => "+",
    });
    fields.optional_text("fold", fold);
    fields.pos(callout.pos);
    fields.finish();
}

/// `frontmatter:` asserts each listed key against the interpreted value;
/// keys the fixture does not list are not asserted (spec §4.1).
fn check_frontmatter(ctx: &mut Ctx<'_>, document: &Document, expected: &Yaml<'_>) {
    let Yaml::Mapping(expected) = expected else {
        ctx.fail("must be a mapping".to_owned());
        return;
    };
    let Some(frontmatter) = &document.frontmatter else {
        ctx.fail("the parser found no frontmatter".to_owned());
        return;
    };
    let actual = match &frontmatter.values {
        Ok(Value::Mapping(map)) => map,
        Ok(other) => {
            ctx.fail(format!("the parser read a {other:?}, not a mapping"));
            return;
        }
        Err(error) => {
            ctx.fail(format!("the parser could not read the YAML: {error}"));
            return;
        }
    };
    for (key, value) in expected {
        let key = key_str(key);
        let expected = to_value(value);
        match actual.iter().find(|(k, _)| *k == key) {
            Some((_, found)) if *found == expected => {}
            Some((_, found)) => ctx
                .at(&format!(".{key}"))
                .fail(format!("expected {expected:?}, got {found:?}")),
            None => ctx.at(&format!(".{key}")).fail("missing".to_owned()),
        }
    }
}

/// The fixture's YAML through the same interpretation the parser uses, so
/// that `tags: [npc, nobreza]` on both sides means the same thing.
fn to_value(yaml: &Yaml<'_>) -> Value {
    match yaml {
        Yaml::Value(Scalar::Null) => Value::Null,
        Yaml::Value(Scalar::Boolean(b)) => Value::Bool(*b),
        Yaml::Value(Scalar::Integer(i)) => Value::Integer(*i),
        Yaml::Value(Scalar::FloatingPoint(f)) => Value::Float(f.into_inner()),
        Yaml::Value(Scalar::String(s)) => Value::String(s.to_string()),
        Yaml::Representation(s, _, _) => Value::String(s.to_string()),
        Yaml::Sequence(items) => Value::Sequence(items.iter().map(to_value).collect()),
        Yaml::Mapping(map) => {
            Value::Mapping(map.iter().map(|(k, v)| (key_str(k), to_value(v))).collect())
        }
        Yaml::Tagged(_, inner) => to_value(inner),
        Yaml::Alias(_) | Yaml::BadValue => Value::Null,
    }
}
