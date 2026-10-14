// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A type's schema: a fenced `verso-schema` block of a note, YAML inside
//! (spec §6, Q11; ADR 0052 points 3 to 5). Only a block at the top level of
//! the note is read; one inside a list or a quote is reported, not read.
//! The YAML goes through the frontmatter's reader and its limits (spec
//! Q17): a schema is untrusted input, and nothing it says runs.

use crate::frontmatter::{Value, parse_yaml};
use crate::position::{Pos, Span};
use crate::properties::is_one_link;
use crate::wikilink::split;

/// A `verso-schema` block as the parser found it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaBlock {
    /// The whole fenced block, fences included.
    pub span: Span,
    /// The first character of the opening fence.
    pub pos: Pos,
    /// Inside a list item or a quote: not a schema (ADR 0052 point 3), and
    /// the note says so.
    pub nested: bool,
    /// The definition of a block at the top level — read, or why it could
    /// not be; `None` for a nested block, which is not read.
    pub definition: Option<Result<Schema, SchemaError>>,
}

/// What a schema declares, in its first version (ADR 0052 point 4).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Schema {
    /// The name notes write in their own `type:`, as written.
    pub name: String,
    /// The type's name per interface language (`pt-BR`, `en`), as written.
    pub labels: Vec<(String, String)>,
    /// The declared properties, in order.
    pub properties: Vec<SchemaProperty>,
    /// How the window lays the typed note's properties out (ADR 0086
    /// item 2); `None`, the panel as it is.
    pub layout: Option<Layout>,
}

/// A layout a schema names at its top level, `layout: infobox` (ADR 0086
/// item 2, decided 2026-10-14).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Layout {
    /// The properties as a card beside the text (ADR 0086 item 3).
    Infobox,
}

impl Layout {
    /// The layout as a schema writes it.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Infobox => "infobox",
        }
    }

    /// A value this build does not know — another name, another case, not
    /// a text — is no layout, never an error: the key is ignored by builds
    /// that do not read it (ADR 0086 item 2), so a later layout must not
    /// untype a schema here either. The author's reading, for the
    /// maintainer: the ADR names only `infobox`.
    fn from_value(value: Option<&Value>) -> Option<Self> {
        match value {
            Some(Value::String(s)) if s == "infobox" => Some(Self::Infobox),
            _ => None,
        }
    }
}

/// A property a schema declares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaProperty {
    pub key: String,
    pub kind: PropertyKind,
    pub labels: Vec<(String, String)>,
}

/// The kinds of the first version — the property types Obsidian documents
/// (memo `typed-note-decision.md` §5.4) — and, since ADR 0086 item 1, a
/// link and a picture.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropertyKind {
    Text,
    List,
    Number,
    Checkbox,
    Date,
    Datetime,
    /// A quoted wikilink, or a list of them: the typed relation of spec
    /// Q10 (ADR 0086 item 1).
    Link,
    /// A picture: a quoted wikilink to a picture of the folder, a path of
    /// the folder, or a web address (ADR 0086 item 1).
    Image,
}

impl PropertyKind {
    /// The kind as a schema writes it.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::List => "list",
            Self::Number => "number",
            Self::Checkbox => "checkbox",
            Self::Date => "date",
            Self::Datetime => "datetime",
            Self::Link => "link",
            Self::Image => "image",
        }
    }

    fn from_name(name: &str) -> Option<Self> {
        Some(match name {
            "text" => Self::Text,
            "list" => Self::List,
            "number" => Self::Number,
            "checkbox" => Self::Checkbox,
            "date" => Self::Date,
            "datetime" => Self::Datetime,
            "link" => Self::Link,
            "image" => Self::Image,
            _ => return None,
        })
    }

    /// Does a frontmatter value fit this kind, as the memo's §5.4 says it?
    /// A date is a string `YYYY-MM-DD`; a date and time a string
    /// `YYYY-MM-DDTHH:mm`, with seconds or not. Under YAML 1.2 `yes` is not
    /// a boolean and a date is a string: nothing is converted. A link is a
    /// string that is one wikilink, or a list of such strings (spec Q10);
    /// a picture is one wikilink to a picture, a path to one, or a web
    /// address (`is_picture`).
    #[must_use]
    pub fn fits(self, value: &Value) -> bool {
        match (self, value) {
            (Self::Text, Value::String(_))
            | (Self::Number, Value::Integer(_) | Value::Float(_))
            | (Self::Checkbox, Value::Bool(_)) => true,
            (Self::List, Value::Sequence(items)) => {
                items.iter().all(|i| matches!(i, Value::String(_)))
            }
            (Self::Date, Value::String(s)) => is_date(s),
            (Self::Datetime, Value::String(s)) => is_datetime(s),
            (Self::Link, Value::String(s)) => is_one_link(s),
            (Self::Link, Value::Sequence(items)) => items
                .iter()
                .all(|i| matches!(i, Value::String(s) if is_one_link(s))),
            (Self::Image, Value::String(s)) => is_picture(s),
            _ => false,
        }
    }
}

fn digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

/// The extensions of a picture, as the window shows one (`live.ts`,
/// `IMAGE_EXT`).
const PICTURE_EXTENSIONS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

/// The last segment of a path or link target ends in a picture's extension.
fn picture_name(name: &str) -> bool {
    let file = name.rsplit('/').next().unwrap_or(name);
    file.rsplit_once('.').is_some_and(|(stem, ext)| {
        !stem.is_empty()
            && PICTURE_EXTENSIONS
                .iter()
                .any(|e| e.eq_ignore_ascii_case(ext))
    })
}

/// A picture as an `image` property holds it (ADR 0086 item 1): a quoted
/// wikilink to a picture (`"[[roderick.jpg]]"`, with an alias or not), a
/// path of the folder ending in a picture's extension, as `banner:` takes
/// one, or an `http(s)` web address. A wikilink or a path to a note is not
/// a picture: shown as written and marked. The extension rule is the
/// author's reading, for the maintainer.
fn is_picture(s: &str) -> bool {
    let t = s.trim();
    if is_one_link(t) {
        let inner = &t[2..t.len() - 2];
        return picture_name(&split(inner).target);
    }
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("https://") || lower.starts_with("http://") {
        return t.len() > "https://".len();
    }
    !t.contains("[[") && !t.contains("]]") && picture_name(t)
}

/// `YYYY-MM-DD`, with a month 01–12 and a day 01–31.
fn is_date(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    let [y, m, d] = parts.as_slice() else {
        return false;
    };
    let in_range =
        |t: &str, lo: u32, hi: u32| t.parse::<u32>().is_ok_and(|n| (lo..=hi).contains(&n));
    y.len() == 4
        && digits(y)
        && m.len() == 2
        && digits(m)
        && in_range(m, 1, 12)
        && d.len() == 2
        && digits(d)
        && in_range(d, 1, 31)
}

/// `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`.
fn is_datetime(s: &str) -> bool {
    let Some((date, time)) = s.split_once('T') else {
        return false;
    };
    let parts: Vec<&str> = time.split(':').collect();
    let ok =
        |t: &str, hi: u32| t.len() == 2 && digits(t) && t.parse::<u32>().is_ok_and(|n| n <= hi);
    is_date(date)
        && match parts.as_slice() {
            [h, m] => ok(h, 23) && ok(m, 59),
            [h, m, sec] => ok(h, 23) && ok(m, 59) && ok(sec, 59),
            _ => false,
        }
}

/// Why a block at the top level types nothing (ADR 0052 point 5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaError {
    pub kind: SchemaErrorKind,
    /// What it concerns: the YAML's message, a property's key, a kind.
    pub detail: String,
    /// The `type` the block declares, when it was read before the
    /// problem: the notes that name it are told their schema does not
    /// parse (ADR 0052 point 5).
    pub name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemaErrorKind {
    /// Not YAML, or beyond the frontmatter's limits.
    Yaml,
    /// YAML, but not a mapping.
    NotAMapping,
    /// No `type`, or a `type` that is not one text.
    NoType,
    /// A `label` that is not a mapping of languages to texts.
    Label,
    /// `properties` that is not a list.
    Properties,
    /// An item of `properties` without a `key` of text or without a `kind`,
    /// or not a mapping.
    Property,
    /// A `kind` the first version does not have.
    UnknownKind,
    /// Two properties with one key.
    DuplicateKey,
}

impl SchemaErrorKind {
    /// The kind as a fixture names it.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Yaml => "yaml",
            Self::NotAMapping => "not_a_mapping",
            Self::NoType => "no_type",
            Self::Label => "label",
            Self::Properties => "properties",
            Self::Property => "property",
            Self::UnknownKind => "unknown_kind",
            Self::DuplicateKey => "duplicate_key",
        }
    }
}

fn error(kind: SchemaErrorKind, detail: impl Into<String>) -> SchemaError {
    SchemaError {
        kind,
        detail: detail.into(),
        name: None,
    }
}

/// A `label`: absent is none; a mapping of languages to texts; anything
/// else an error.
fn labels(value: Option<&Value>, whose: &str) -> Result<Vec<(String, String)>, SchemaError> {
    match value {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Mapping(entries)) => entries
            .iter()
            .map(|(lang, text)| match text {
                Value::String(t) => Ok((lang.clone(), t.clone())),
                _ => Err(error(SchemaErrorKind::Label, whose)),
            })
            .collect(),
        Some(_) => Err(error(SchemaErrorKind::Label, whose)),
    }
}

fn get<'v>(entries: &'v [(String, Value)], key: &str) -> Option<&'v Value> {
    entries.iter().rev().find(|(k, _)| k == key).map(|(_, v)| v)
}

/// Read the text of a block at the top level. Keys the first version does
/// not have (`values`, `required`) are left alone, for a later version.
pub(crate) fn read(text: &str) -> Result<Schema, SchemaError> {
    let value = parse_yaml(text).map_err(|e| error(SchemaErrorKind::Yaml, e))?;
    let named = match &value {
        Value::Mapping(entries) => match get(entries, "type") {
            Some(Value::String(t)) if !t.trim().is_empty() => Some(t.clone()),
            _ => None,
        },
        _ => None,
    };
    read_value(value).map_err(|mut e| {
        e.name.clone_from(&named);
        e
    })
}

fn read_value(value: Value) -> Result<Schema, SchemaError> {
    let Value::Mapping(entries) = value else {
        return Err(error(SchemaErrorKind::NotAMapping, ""));
    };
    let name = match get(&entries, "type") {
        Some(Value::String(t)) if !t.trim().is_empty() => t.clone(),
        _ => return Err(error(SchemaErrorKind::NoType, "")),
    };
    let type_labels = labels(get(&entries, "label"), "label")?;
    let items = match get(&entries, "properties") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Sequence(items)) => items.clone(),
        Some(_) => return Err(error(SchemaErrorKind::Properties, "")),
    };
    let mut properties: Vec<SchemaProperty> = Vec::with_capacity(items.len());
    for (i, item) in items.iter().enumerate() {
        let Value::Mapping(fields) = item else {
            return Err(error(SchemaErrorKind::Property, format!("item {i}")));
        };
        let key = match get(fields, "key") {
            Some(Value::String(k)) if !k.trim().is_empty() => k.clone(),
            _ => return Err(error(SchemaErrorKind::Property, format!("item {i}"))),
        };
        let kind = match get(fields, "kind") {
            Some(Value::String(k)) => PropertyKind::from_name(k)
                .ok_or_else(|| error(SchemaErrorKind::UnknownKind, k.clone()))?,
            // Every property says its kind (ADR 0052 point 4).
            None | Some(Value::Null) => return Err(error(SchemaErrorKind::Property, key)),
            Some(_) => return Err(error(SchemaErrorKind::UnknownKind, key)),
        };
        if properties.iter().any(|p| p.key == key) {
            return Err(error(SchemaErrorKind::DuplicateKey, key));
        }
        let property_labels = labels(get(fields, "label"), &key)?;
        properties.push(SchemaProperty {
            key,
            kind,
            labels: property_labels,
        });
    }
    Ok(Schema {
        name,
        labels: type_labels,
        properties,
        layout: Layout::from_value(get(&entries, "layout")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_schema_reads_its_type_labels_and_properties() {
        let s = read(
            "type: npc\nlabel: { pt-BR: PdM, en: NPC }\nproperties:\n  - key: facção\n    kind: text\n    label: { pt-BR: Facção, en: Faction }\n  - key: nível\n    kind: number\n",
        )
        .unwrap();
        assert_eq!(s.name, "npc");
        assert_eq!(
            s.labels,
            [
                ("pt-BR".to_owned(), "PdM".to_owned()),
                ("en".to_owned(), "NPC".to_owned())
            ]
        );
        assert_eq!(s.properties.len(), 2);
        assert_eq!(s.properties[1].kind, PropertyKind::Number);
        assert!(s.properties[1].labels.is_empty());
    }

    #[test]
    fn a_schema_that_does_not_parse_keeps_the_name_it_declared() {
        assert_eq!(
            read("type: npc\nproperties: x")
                .unwrap_err()
                .name
                .as_deref(),
            Some("npc")
        );
        assert_eq!(read("label: x").unwrap_err().name, None);
    }

    #[test]
    fn what_does_not_parse_says_why() {
        let kind = |t: &str| read(t).unwrap_err().kind;
        assert_eq!(kind("type: [a"), SchemaErrorKind::Yaml);
        assert_eq!(kind("- npc"), SchemaErrorKind::NotAMapping);
        assert_eq!(kind("label: x"), SchemaErrorKind::NoType);
        assert_eq!(kind("type: 3"), SchemaErrorKind::NoType);
        assert_eq!(kind("type: npc\nlabel: PdM"), SchemaErrorKind::Label);
        assert_eq!(
            kind("type: npc\nproperties: x"),
            SchemaErrorKind::Properties
        );
        assert_eq!(
            kind("type: npc\nproperties:\n  - kind: text"),
            SchemaErrorKind::Property
        );
        assert_eq!(
            kind("type: npc\nproperties:\n  - key: a\n    kind: relation"),
            SchemaErrorKind::UnknownKind
        );
        assert_eq!(
            kind("type: npc\nproperties:\n  - key: a"),
            SchemaErrorKind::Property
        );
        assert_eq!(
            kind("type: npc\nproperties:\n  - key: a\n    kind: text\n  - key: a\n    kind: list"),
            SchemaErrorKind::DuplicateKey
        );
    }

    #[test]
    fn values_fit_their_kinds_as_written_never_converted() {
        let s = |t: &str| Value::String(t.to_owned());
        assert!(PropertyKind::Text.fits(&s("Coroa")));
        assert!(!PropertyKind::Text.fits(&Value::Integer(3)));
        assert!(PropertyKind::Number.fits(&Value::Integer(3)));
        assert!(PropertyKind::Number.fits(&Value::Float(2.5)));
        assert!(!PropertyKind::Number.fits(&s("3")));
        assert!(PropertyKind::Checkbox.fits(&Value::Bool(true)));
        assert!(!PropertyKind::Checkbox.fits(&s("yes")));
        assert!(PropertyKind::List.fits(&Value::Sequence(vec![s("a"), s("b")])));
        assert!(!PropertyKind::List.fits(&Value::Sequence(vec![Value::Integer(1)])));
        assert!(PropertyKind::Date.fits(&s("2026-10-07")));
        assert!(!PropertyKind::Date.fits(&s("2026-13-07")));
        assert!(!PropertyKind::Date.fits(&s("07/10/2026")));
        assert!(PropertyKind::Datetime.fits(&s("2026-10-07T14:30")));
        assert!(PropertyKind::Datetime.fits(&s("2026-10-07T14:30:05")));
        assert!(!PropertyKind::Datetime.fits(&s("2026-10-07 14:30")));
        assert!(!PropertyKind::Date.fits(&Value::Null));
    }

    #[test]
    fn a_schema_reads_link_and_image_kinds_and_its_layout() {
        let s = read(
            "type: npc\nlayout: infobox\nproperties:\n  - key: retrato\n    kind: image\n  - key: aliados\n    kind: link\n",
        )
        .unwrap();
        assert_eq!(s.layout, Some(Layout::Infobox));
        assert_eq!(s.properties[0].kind, PropertyKind::Image);
        assert_eq!(s.properties[1].kind, PropertyKind::Link);
        assert_eq!(PropertyKind::Link.as_str(), "link");
        assert_eq!(PropertyKind::Image.as_str(), "image");
    }

    #[test]
    fn a_layout_this_build_does_not_know_is_no_layout_and_no_error() {
        let layout = |t: &str| read(t).unwrap().layout;
        assert_eq!(layout("type: npc"), None);
        assert_eq!(layout("type: npc\nlayout: galeria"), None);
        assert_eq!(layout("type: npc\nlayout: Infobox"), None);
        assert_eq!(layout("type: npc\nlayout: [infobox]"), None);
        assert_eq!(layout("type: npc\nlayout: infobox"), Some(Layout::Infobox));
    }

    #[test]
    fn a_link_is_one_quoted_wikilink_or_a_list_of_them() {
        let s = |t: &str| Value::String(t.to_owned());
        assert!(PropertyKind::Link.fits(&s("[[Barão]]")));
        assert!(PropertyKind::Link.fits(&s("[[Barão|o barão]]")));
        assert!(PropertyKind::Link.fits(&Value::Sequence(vec![s("[[A]]"), s("[[B#Casa]]")])));
        assert!(PropertyKind::Link.fits(&Value::Sequence(vec![])));
        assert!(!PropertyKind::Link.fits(&s("Barão")));
        assert!(!PropertyKind::Link.fits(&s("[[A]] e [[B]]")));
        assert!(!PropertyKind::Link.fits(&Value::Sequence(vec![s("[[A]]"), s("B")])));
        assert!(!PropertyKind::Link.fits(&Value::Integer(3)));
    }

    #[test]
    fn a_picture_is_a_wikilink_a_path_or_a_web_address() {
        let s = |t: &str| Value::String(t.to_owned());
        assert!(PropertyKind::Image.fits(&s("[[roderick.jpg]]")));
        assert!(PropertyKind::Image.fits(&s("[[roderick.JPG|Lorde Roderick]]")));
        assert!(PropertyKind::Image.fits(&s("assets/roderick.png")));
        assert!(PropertyKind::Image.fits(&s("https://example.org/r")));
        assert!(!PropertyKind::Image.fits(&s("[[Roderick]]")));
        assert!(!PropertyKind::Image.fits(&s("Roderick")));
        assert!(!PropertyKind::Image.fits(&s(".png")));
        assert!(!PropertyKind::Image.fits(&s("assets/.png")));
        assert!(!PropertyKind::Image.fits(&s("https://")));
        assert!(!PropertyKind::Image.fits(&Value::Sequence(vec![s("a.png")])));
    }
}
