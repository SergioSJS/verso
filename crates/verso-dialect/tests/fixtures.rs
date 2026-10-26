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
    // All approved by the maintainer on 2026-09-21 (PR #1: the first five;
    // PR #7: the other six). The first line of each expected.yaml says so.
    code_no_link_in_code => "code/no-link-in-code",
    // AI draft of ADR 0088 (dice), awaiting approval (first line of its
    // expected.yaml).
    code_dice_inline => "code/dice-inline",
    wikilink_alias => "wikilink/alias",
    wikilink_block_reference => "wikilink/block-reference",
    wikilink_heading => "wikilink/heading",
    wikilink_simple => "wikilink/simple",
    block_definition => "block/definition",
    // AI draft of the Q3 PR, awaiting approval (first line of its expected.yaml).
    block_list_item => "block/list-item",
    block_after_a_block => "block/after-a-block",
    block_heading => "block/heading",
    block_duplicate => "block/duplicate",
    block_in_list => "block/in-list",
    block_in_quote => "block/in-quote",
    block_alone_top => "block/alone-top",
    block_two_alone => "block/two-alone",
    callout_simple => "callout/simple",
    // AI draft of ADR 0087 (secret blocks, spec Q9), awaiting approval
    // (first line of its expected.yaml).
    callout_secret => "callout/secret",
    callout_nested => "callout/nested",
    embed_simple => "embed/simple",
    frontmatter_tags_aliases => "frontmatter/tags-aliases",
    // AI draft of the board's PR, awaiting approval (first line of its
    // expected.yaml).
    frontmatter_property_links => "frontmatter/property-links",
    heading_atx => "heading/atx",
    heading_setext => "heading/setext",
    wikilink_accent_space => "wikilink/accent-space",
    // AI drafts of the typed note (ADR 0052), awaiting approval (first line
    // of each expected.yaml).
    schema_top_level => "schema/top-level",
    schema_nested_and_invalid => "schema/nested-and-invalid",
    schema_infobox => "schema/infobox",
    // AI draft of ADR 0089's prose (M6, the maintainer's answer of
    // 2026-10-14), awaiting approval (first line of its expected.yaml).
    prose_what_is_prose => "prose/what-is-prose",
    // AI drafts of the dialect questions Q22 and Q24 (decided 2026-10-21),
    // awaiting approval (first line of each expected.yaml).
    block_id_chars => "block/id-chars",
    frontmatter_bom => "frontmatter/bom",
    frontmatter_yaml_12 => "frontmatter/yaml-12",
    frontmatter_tags_number => "frontmatter/tags-number",
    frontmatter_tags_hash => "frontmatter/tags-hash",
    frontmatter_wikilink_values => "frontmatter/wikilink-values",
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
            "property_links" => check_list(
                &mut ctx,
                value,
                &document.property_links,
                check_property_link,
            ),
            "schemas" => check_list(&mut ctx, value, &document.schemas, check_schema),
            "prose" => {
                let runs = prose_runs(input);
                if let Yaml::Sequence(items) = value
                    && items.len() != runs.len()
                {
                    ctx.fail(format!(
                        "expected {} run(s), the parser found {}: {runs:#?}",
                        items.len(),
                        runs.len()
                    ));
                } else {
                    check_list(&mut ctx, value, &runs, check_prose);
                }
            }
            // The note as a reader of a UniVerso receives it (spec §4.1,
            // Q9; ADR 0087 item 3): the projection, byte for byte.
            "reader" => match value {
                Yaml::Value(Scalar::String(text)) => {
                    let projected = verso_dialect::project(input);
                    if projected != text.as_ref() {
                        ctx.fail(format!(
                            "the reader's text differs:\n--- expected\n{text}\n--- projection\n{projected}"
                        ));
                    }
                }
                _ => ctx.fail("`reader` is the projected text, a string".to_owned()),
            },
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

fn as_bool(value: &Yaml<'_>) -> Option<bool> {
    match value {
        Yaml::Value(Scalar::Boolean(b)) => Some(*b),
        _ => None,
    }
}

/// A `labels` map — language to text, in the order written — against what
/// the parser read; an absent map asserts none (spec §4.8).
fn check_labels(ctx: &mut Ctx<'_>, expected: Option<&Yaml<'_>>, actual: &[(String, String)]) {
    let wanted: Vec<(String, String)> = match expected {
        None => Vec::new(),
        Some(Yaml::Mapping(map)) => map
            .iter()
            .map(|(k, v)| (key_str(k), as_str(v).unwrap_or_default().to_owned()))
            .collect(),
        Some(_) => {
            ctx.fail("labels: must be a map of languages to texts".to_owned());
            return;
        }
    };
    if wanted != actual {
        ctx.fail(format!("labels: expected {wanted:?}, got {actual:?}"));
    }
}

/// A `verso-schema` block (spec §4.1, `schemas`; §4.8).
fn check_schema(ctx: &mut Ctx<'_>, item: &Yaml<'_>, block: &verso_dialect::SchemaBlock) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    match fields.get("nested").map(as_bool) {
        None if !block.nested => {}
        Some(Some(expected)) if expected == block.nested => {}
        Some(None) => fields.ctx.fail("nested: must be true or false".to_owned()),
        _ => fields
            .ctx
            .fail(format!("nested: the parser found {}", block.nested)),
    }
    let error = match &block.definition {
        Some(Err(e)) => Some(e.kind.as_str()),
        _ => None,
    };
    fields.optional_text("error", error);
    let type_field = fields.get("type");
    let labels = fields.get("labels");
    let properties = fields.get("properties");
    // `layout` (ADR 0086 item 2): absent asserts none.
    let layout = match &block.definition {
        Some(Ok(schema)) => schema.layout.map(verso_dialect::Layout::as_str),
        _ => None,
    };
    fields.optional_text("layout", layout);
    match &block.definition {
        Some(Ok(schema)) => {
            match type_field.map(as_str) {
                Some(Some(expected)) if expected == schema.name => {}
                Some(Some(expected)) => fields.ctx.fail(format!(
                    "type: expected {expected:?}, got {:?}",
                    schema.name
                )),
                _ => fields
                    .ctx
                    .fail("type: required for a schema read".to_owned()),
            }
            check_labels(&mut fields.ctx.at(".labels"), labels, &schema.labels);
            let items: Vec<&Yaml<'_>> = match properties {
                None => Vec::new(),
                Some(Yaml::Sequence(items)) => items.iter().collect(),
                Some(_) => {
                    fields.ctx.fail("properties: must be a list".to_owned());
                    Vec::new()
                }
            };
            if items.len() == schema.properties.len() {
                for (i, (item, property)) in items.iter().zip(&schema.properties).enumerate() {
                    let mut ctx = fields.ctx.at(&format!(".properties[{i}]"));
                    let Some(mut p) = Fields::new(&mut ctx, item) else {
                        continue;
                    };
                    p.text("key", &property.key);
                    p.text("kind", property.kind.as_str());
                    let labels = p.get("labels");
                    check_labels(p.ctx, labels, &property.labels);
                    p.finish();
                }
            } else {
                fields.ctx.fail(format!(
                    "properties: expected {} item(s), the parser read {}",
                    items.len(),
                    schema.properties.len()
                ));
            }
        }
        _ => {
            if type_field.is_some() || labels.is_some() || properties.is_some() {
                fields.ctx.fail(
                    "type, labels and properties: a block not read has none (spec §4.8)".to_owned(),
                );
            }
        }
    }
    fields.pos(block.pos);
    fields.finish();
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

    /// An integer asserted only when the fixture gives it.
    fn int_if_given(&mut self, field: &str, actual: i64) {
        if self.map.iter().any(|(k, _)| k == field) {
            self.int(field, actual);
        }
    }

    /// `syntax` is `wikilink` when omitted (spec §4.2); writing it out is the
    /// same assertion. `markdown` (spec §5.13) is PROPOSED and not produced.
    fn syntax(&mut self) {
        match self.get("syntax").map(as_str) {
            None | Some(Some("wikilink")) => {}
            Some(Some("markdown")) => self.ctx.fail(
                "syntax: markdown links are PROPOSED (spec §5.13, Q20), not parsed".to_owned(),
            ),
            Some(Some(other)) => self.ctx.fail(format!("syntax: unknown value {other:?}")),
            Some(None) => self.ctx.fail("syntax: must be text".to_owned()),
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

    /// `[first, last]` lines, asserted when the fixture gives them.
    fn lines(&mut self, field: &str, actual: (u32, u32)) {
        let Some(expected) = self.get(field) else {
            return;
        };
        let Yaml::Sequence(items) = expected else {
            self.ctx.fail(format!("{field}: must be [first, last]"));
            return;
        };
        let got: Vec<Option<i64>> = items.iter().map(as_int).collect();
        let want = vec![Some(i64::from(actual.0)), Some(i64::from(actual.1))];
        if got != want {
            self.ctx
                .fail(format!("{field}: expected {got:?}, got {want:?}"));
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
    fields.syntax();
    fields.pos(link.pos);
    fields.finish();
}

/// A link a frontmatter property holds (spec §4.1, `property_links`).
fn check_property_link(ctx: &mut Ctx<'_>, item: &Yaml<'_>, link: &verso_dialect::PropertyLink) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    fields.text("property", &link.key);
    match (fields.get("item").map(as_int), link.item) {
        (None, None) => {}
        (Some(Some(expected)), Some(actual)) if usize::try_from(expected).ok() == Some(actual) => {}
        (Some(Some(expected)), actual) => fields
            .ctx
            .fail(format!("item: expected {expected}, got {actual:?}")),
        (Some(None), _) => fields.ctx.fail("item: must be an integer".to_owned()),
        (None, Some(actual)) => fields.ctx.fail(format!(
            "item: fixture asserts none, the parser found {actual}"
        )),
    }
    fields.text("target", &link.target);
    fields.optional_text("heading", link.heading.as_deref());
    fields.optional_text("block", link.block.as_deref());
    fields.optional_text("alias", link.alias.as_deref());
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
    fields.syntax();
    fields.pos(embed.pos);
    fields.finish();
}

/// A run of prose (spec §4.9): its text as written, whether it sits in a
/// table's cell, where it starts.
#[derive(Debug)]
struct ProseRun {
    text: String,
    table: bool,
    pos: Pos,
}

fn prose_runs(input: &str) -> Vec<ProseRun> {
    verso_dialect::prose(input)
        .iter()
        .map(|p| {
            let before = input.get(..p.span.start).unwrap_or_default();
            let line_start = before.rfind('\n').map_or(0, |k| k + 1);
            ProseRun {
                text: p.span.slice(input).unwrap_or_default().to_owned(),
                table: p.table,
                pos: Pos {
                    line: u32::try_from(before.matches('\n').count() + 1).unwrap_or(u32::MAX),
                    col: u32::try_from(
                        input
                            .get(line_start..p.span.start)
                            .unwrap_or_default()
                            .chars()
                            .count()
                            + 1,
                    )
                    .unwrap_or(u32::MAX),
                },
            }
        })
        .collect()
}

fn check_prose(ctx: &mut Ctx<'_>, item: &Yaml<'_>, run: &ProseRun) {
    let Some(mut fields) = Fields::new(ctx, item) else {
        return;
    };
    fields.text("text", &run.text);
    match fields.get("table").map(as_bool) {
        None if !run.table => {}
        Some(Some(expected)) if expected == run.table => {}
        Some(None) => fields.ctx.fail("table: must be true or false".to_owned()),
        _ => fields
            .ctx
            .fail(format!("table: the parser found {}", run.table)),
    }
    fields.pos(run.pos);
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
    fields.lines("lines", block.lines);
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
    fields.int_if_given("depth", i64::from(callout.depth));
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
