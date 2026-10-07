// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The typed note (ADR 0052): a note whose frontmatter `type` holds one
//! text that names a schema of the folder. Typing happens at query time,
//! as links resolve: the index keeps each note's `type` and the
//! `verso-schema` blocks it found, and a schema added, edited or binned
//! changes what a note shows and never the note. Nothing here writes.

use verso_dialect::{SchemaBlock, Value};
use verso_index::SchemaRow;

/// A note's type, when its `type:` reaches at least one schema of the
/// folder. A `type` that names no schema is an ordinary property, and the
/// note plain Markdown: nothing is reported (ADR 0052 point 2).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteType {
    /// The note's `type`, as written.
    pub written: String,
    pub state: TypeState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TypeState {
    /// One schema of that name, read: the note is typed by it.
    Typed(TypedSchema),
    /// Two or more schemas share the name: neither applies, and the
    /// notes of the type are shown untyped naming every one (ADR 0052
    /// point 5, option α). The notes that hold them, in path order — one
    /// entry per schema, so a note holding two appears twice.
    Conflict { schemas: Vec<String> },
    /// The one schema of that name does not parse: it types nothing, and
    /// says so here and in its own note.
    Invalid {
        /// The note that holds it.
        schema: String,
        /// Why, as spec §4.8 names the kinds; `stale` when the index is
        /// behind the schema's note (call a reindex).
        error: String,
    },
}

/// The schema that types a note, and the note's declared properties.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypedSchema {
    /// The note that holds the schema.
    pub schema: String,
    /// The schema's `type`, as written there.
    pub name: String,
    /// The type's name per interface language.
    pub labels: Vec<(String, String)>,
    /// The declared properties, in the schema's order.
    pub properties: Vec<TypedProperty>,
}

/// A declared property, as the note holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypedProperty {
    pub key: String,
    /// `text`, `list`, `number`, `checkbox`, `date` or `datetime`.
    pub kind: String,
    pub labels: Vec<(String, String)>,
    /// The note has the key (an empty value included).
    pub present: bool,
    /// The value fits the kind; `false` for a key the note lacks. An
    /// empty value (`key:` with nothing after it, as a template leaves
    /// it) fits: it is not marked as wrong, only empty.
    pub fits: bool,
}

/// A value with nothing in it — `key:`, `key: ""` — as a template leaves
/// it: empty, never wrong for its kind.
fn empty(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        _ => false,
    }
}

/// The `type` of a note's frontmatter, when it holds one text.
pub(crate) fn written_type(frontmatter: &[(String, Value)]) -> Option<String> {
    frontmatter
        .iter()
        .rev()
        .find(|(k, _)| k == "type")
        .and_then(|(_, v)| match v {
            Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
            _ => None,
        })
}

/// A note's type, from its frontmatter, the schema blocks the index found,
/// and a way to read a schema note's text (`content_of`). `None`: the note
/// is plain Markdown.
pub(crate) fn note_type(
    frontmatter: &[(String, Value)],
    blocks: &[SchemaRow],
    content_of: impl Fn(&str) -> Option<String>,
) -> Option<NoteType> {
    let written = written_type(frontmatter)?;
    let key = verso_index::type_key(&written);
    let named: Vec<&SchemaRow> = blocks
        .iter()
        .filter(|b| !b.nested && b.name_key.as_deref() == Some(key.as_str()))
        .collect();
    let state = match named.as_slice() {
        [] => return None,
        [one] => match &one.error {
            Some(error) => TypeState::Invalid {
                schema: one.path.clone(),
                error: error.clone(),
            },
            None => {
                // The index's copy no longer holds the block where the
                // index found it: the index is behind the schema's note.
                // Said, not hidden as plain Markdown.
                let definition = content_of(&one.path).and_then(|text| {
                    verso_dialect::parse(&text)
                        .schemas
                        .into_iter()
                        .find(|s| s.pos.line == one.line && s.pos.col == one.col)
                        .and_then(|s| s.definition)
                });
                let Some(definition) = definition else {
                    return Some(NoteType {
                        written,
                        state: TypeState::Invalid {
                            schema: one.path.clone(),
                            error: "stale".to_owned(),
                        },
                    });
                };
                match definition {
                    Ok(schema) => TypeState::Typed(TypedSchema {
                        schema: one.path.clone(),
                        properties: schema
                            .properties
                            .into_iter()
                            .map(|p| {
                                let value = frontmatter.iter().rev().find(|(k, _)| *k == p.key);
                                TypedProperty {
                                    present: value.is_some(),
                                    fits: value.is_some_and(|(_, v)| empty(v) || p.kind.fits(v)),
                                    kind: p.kind.as_str().to_owned(),
                                    key: p.key,
                                    labels: p.labels,
                                }
                            })
                            .collect(),
                        name: schema.name,
                        labels: schema.labels,
                    }),
                    // The index and the text disagree: the schema changed
                    // since it was indexed; read as it is now.
                    Err(e) => TypeState::Invalid {
                        schema: one.path.clone(),
                        error: e.kind.as_str().to_owned(),
                    },
                }
            }
        },
        many => {
            // One entry per schema, two in one note included: the line
            // says how many share the name (ADR 0052 point 5).
            let mut schemas: Vec<String> = many.iter().map(|b| b.path.clone()).collect();
            schemas.sort();
            TypeState::Conflict { schemas }
        }
    };
    Some(NoteType { written, state })
}

/// A `verso-schema` block of a note, as its note shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaNotice {
    /// The line of the opening fence (1-based).
    pub line: u32,
    /// The `type` it declares, when it was read.
    pub name: Option<String>,
    /// Inside a list or a quote: not read.
    pub nested: bool,
    /// Why a block at the top level types nothing (spec §4.8's kinds).
    pub error: Option<String>,
}

pub(crate) fn notice(block: &SchemaBlock) -> SchemaNotice {
    let (name, error) = match &block.definition {
        Some(Ok(s)) => (Some(s.name.clone()), None),
        Some(Err(e)) => (e.name.clone(), Some(e.kind.as_str().to_owned())),
        None => (None, None),
    };
    SchemaNotice {
        line: block.pos.line,
        name,
        nested: block.nested,
        error,
    }
}
