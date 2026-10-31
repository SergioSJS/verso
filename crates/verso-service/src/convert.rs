// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The core's answers in the contract's types (`verso-contract`): the one
//! place they are converted, for every transport.

use verso_contract::{
    BaseCell, BaseErrorKind, Block, Focus, FocusesSummary, Heading, IndexProgress, IndexSummary,
    Label, LinkRewrite, NoteText, NoteType, Property, PropertyValue, Renamed, SchemaNotice,
    SkipReason, Skipped, TextFile, Trashed, TypeState, TypedProperty,
};

/// A count as the contract carries it.
#[must_use]
pub fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

#[must_use]
pub fn progress(p: verso_core::IndexProgress) -> IndexProgress {
    IndexProgress {
        phase: p.phase,
        current: p.current as u32,
        total: p.total as u32,
        file: p.file,
    }
}

/// The run's numbers, and one readable line per problem the walk met or
/// per thing the run could not do besides indexing (the sidecar).
#[must_use]
pub fn summary(r: &verso_core::IndexReport) -> IndexSummary {
    IndexSummary {
        indexed: count(r.indexed),
        unchanged: count(r.unchanged),
        removed: count(r.removed),
        placeholders: count(r.placeholders),
        problems: r
            .problems
            .iter()
            .map(ToString::to_string)
            .chain(r.warnings.iter().cloned())
            .collect(),
        unwatched: None,
        unindexed: None,
    }
}

pub fn note_out(t: verso_core::NoteText) -> NoteText {
    NoteText {
        path: t.path,
        lines: t.lines,
        html: t.html,
        properties: t
            .properties
            .into_iter()
            .map(|(key, value)| Property {
                key,
                value: match value {
                    verso_core::PropertyValue::Text(s) => PropertyValue::Text(s),
                    verso_core::PropertyValue::Number(s) => PropertyValue::Number(s),
                    verso_core::PropertyValue::Checkbox(b) => PropertyValue::Checkbox(b),
                    verso_core::PropertyValue::List(v) => PropertyValue::List(v),
                    verso_core::PropertyValue::Nested(s) => PropertyValue::Nested(s),
                    verso_core::PropertyValue::Empty => PropertyValue::Empty,
                },
            })
            .collect(),
        text: t.text,
        revision: t.revision,
        access: None,
        headings: t
            .headings
            .into_iter()
            .map(|h| Heading {
                level: h.level,
                text: h.text,
                line: h.line,
                col: h.col,
            })
            .collect(),
        blocks: t
            .blocks
            .into_iter()
            .map(|b| Block {
                id: b.id,
                line: b.line,
                col: b.col,
                first_line: b.first_line,
                last_line: b.last_line,
            })
            .collect(),
        stale: t.stale,
        unverified: t.unverified,
        note_type: t.note_type.map(note_type_out),
        schema_blocks: t
            .schema_blocks
            .into_iter()
            .map(|b| SchemaNotice {
                line: b.line,
                name: b.name,
                nested: b.nested,
                error: b.error,
            })
            .collect(),
    }
}

pub fn labels_out(labels: Vec<(String, String)>) -> Vec<Label> {
    labels
        .into_iter()
        .map(|(lang, text)| Label { lang, text })
        .collect()
}

pub fn note_type_out(t: verso_core::typed::NoteType) -> NoteType {
    use verso_core::typed::TypeState as Core;
    NoteType {
        written: t.written,
        state: match t.state {
            Core::Typed(s) => TypeState::Typed {
                schema: s.schema,
                name: s.name,
                labels: labels_out(s.labels),
                properties: s
                    .properties
                    .into_iter()
                    .map(|p| TypedProperty {
                        key: p.key,
                        kind: p.kind,
                        labels: labels_out(p.labels),
                        present: p.present,
                        fits: p.fits,
                    })
                    .collect(),
                layout: s.layout,
            },
            Core::Conflict { schemas } => TypeState::Conflict { schemas },
            Core::Invalid { schema, error } => TypeState::Invalid { schema, error },
        },
    }
}

pub fn trashed_out(t: verso_core::Trashed) -> Trashed {
    Trashed {
        path: t.path,
        warnings: t.warnings,
    }
}

pub fn renamed_out(r: verso_core::Renamed) -> Renamed {
    Renamed {
        path: r.path,
        rewrites: r
            .rewrites
            .into_iter()
            .map(|w| LinkRewrite {
                path: w.path,
                revision: w.revision,
                before: w.before,
                after: w.after,
            })
            .collect(),
        skipped: r
            .skipped
            .into_iter()
            .map(|s| Skipped {
                path: s.path,
                reason: match s.reason {
                    verso_core::SkipReason::Unavailable => SkipReason::Unavailable,
                    verso_core::SkipReason::NotText => SkipReason::NotText,
                    verso_core::SkipReason::Failed => SkipReason::Failed,
                },
            })
            .collect(),
        warnings: r.warnings,
        also: r
            .also
            .into_iter()
            .map(|(from, to)| verso_contract::Moved { from, to })
            .collect(),
    }
}

pub fn text_out(t: verso_core::TextFile) -> TextFile {
    TextFile {
        path: t.path,
        text: t.text,
        revision: t.revision,
        warnings: t.warnings,
        access: None,
    }
}

pub fn base_cell(c: verso_core::bases::Cell) -> BaseCell {
    use verso_core::bases::Cell as C;
    match c {
        C::Empty => BaseCell::Empty,
        C::Text(s) => BaseCell::Text(s),
        C::Number(n) => BaseCell::Number(n),
        C::Bool(b) => BaseCell::Bool(b),
        C::Date { ms, time } => BaseCell::Date {
            ms: ms as f64,
            time,
        },
        C::Duration(ms) => BaseCell::Duration(ms),
        C::List(items) => BaseCell::List(items.into_iter().map(base_cell).collect()),
        C::Object(entries) => BaseCell::Object(
            entries
                .into_iter()
                .map(|(k, v)| (k, base_cell(v)))
                .collect(),
        ),
        C::Link {
            target,
            display,
            path,
        } => BaseCell::Link {
            target,
            display,
            path,
        },
        C::File(p) => BaseCell::File(p),
        C::Image(s) => BaseCell::Image(s),
        C::Icon(s) => BaseCell::Icon(s),
        C::Html(s) => BaseCell::Html(s),
        C::Error(e) => BaseCell::Error {
            kind: base_error_kind(e.kind),
            name: e.name,
        },
    }
}

/// An evaluation error's kind, as the contract names it.
#[must_use]
pub fn base_error_kind(kind: verso_core::bases::EvalErrorKind) -> BaseErrorKind {
    use verso_core::bases::EvalErrorKind as E;
    match kind {
        E::Syntax => BaseErrorKind::Syntax,
        E::UnknownFunction => BaseErrorKind::UnknownFunction,
        E::UnknownMethod => BaseErrorKind::UnknownMethod,
        E::Arguments => BaseErrorKind::Arguments,
        E::Type => BaseErrorKind::Type,
        E::Regex => BaseErrorKind::Regex,
        E::RegexInvalid => BaseErrorKind::RegexInvalid,
        E::RegexUnsupported => BaseErrorKind::RegexUnsupported,
        E::RegexTooLarge => BaseErrorKind::RegexTooLarge,
        E::Cycle => BaseErrorKind::Cycle,
        E::Budget => BaseErrorKind::Budget,
        E::TooLarge => BaseErrorKind::TooLarge,
    }
}

pub fn to_contract_focus(f: verso_core::Focus) -> Focus {
    Focus {
        name: f.name,
        paths: f.paths,
        sticker: f.sticker,
    }
}

pub fn to_core_focus(f: Focus) -> verso_core::Focus {
    verso_core::Focus {
        name: f.name,
        paths: f.paths,
        sticker: f.sticker,
    }
}

pub fn to_contract_read_only_code(
    code: Option<verso_core::ReadOnlyReasonCode>,
) -> Option<verso_contract::ReadOnlyReasonCode> {
    code.map(|c| match c {
        verso_core::ReadOnlyReasonCode::CloudPlaceholder => {
            verso_contract::ReadOnlyReasonCode::CloudPlaceholder
        }
        verso_core::ReadOnlyReasonCode::InvalidJson => {
            verso_contract::ReadOnlyReasonCode::InvalidJson
        }
        verso_core::ReadOnlyReasonCode::UnknownFormat => {
            verso_contract::ReadOnlyReasonCode::UnknownFormat
        }
    })
}

pub fn to_contract_focuses_summary(s: verso_core::FocusesSummary) -> FocusesSummary {
    FocusesSummary {
        focuses: s.focuses.into_iter().map(to_contract_focus).collect(),
        has_file: s.has_file,
        format_known: s.format_known,
        read_only_reason: s.read_only_reason,
        read_only_code: to_contract_read_only_code(s.read_only_code),
        stamp: s.stamp,
    }
}
