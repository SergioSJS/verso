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
}

/// A property a schema declares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaProperty {
    pub key: String,
    pub kind: PropertyKind,
    pub labels: Vec<(String, String)>,
}

/// The kinds of the first version: the property types Obsidian documents
/// (memo `typed-note-decision.md` §5.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropertyKind {
    Text,
    List,
    Number,
    Checkbox,
    Date,
    Datetime,
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
            _ => return None,
        })
    }

    /// Does a frontmatter value fit this kind, as the memo's §5.4 says it?
    /// A date is a string `YYYY-MM-DD`; a date and time a string
    /// `YYYY-MM-DDTHH:mm`, with seconds or not. Under YAML 1.2 `yes` is not
    /// a boolean and a date is a string: nothing is converted.
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
            _ => false,
        }
    }
}

fn digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
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
            kind("type: npc\nproperties:\n  - key: a\n    kind: link"),
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
}
