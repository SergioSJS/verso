// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Periodic notes in the folder's layer (ADR 0093 item 4): the formats,
//! the folders, the templates, which periods are on, the week's start and
//! the language of names, under `periodic` in `.verso/settings.json` —
//! and Obsidian's two settings files offered once, read-only (item 11).
//!
//! The window names the notes (the formats are its), the core keeps what
//! it was told: a value of the wrong kind is not read, a folder or a
//! template that is not a plain path relative to the folder refuses the
//! change (invariant 4), and keys this version does not know — at any
//! depth of `periodic` — are kept on every write.
//!
//! ```json
//! "periodic": {
//!   "day": { "folder": "Diário", "format": "YYYY-MM-DD", "on": true },
//!   "language": "pt-BR",
//!   "week": { "on": true },
//!   "weekStart": "sunday"
//! }
//! ```

use serde_json::{Map, Value};
use verso_fs::{ObsidianRead, ObsidianSettings};

use super::*;

const PERIODIC: &str = "periodic";
const WEEKDAYS: [&str; 7] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
const LANGUAGES: [&str; 2] = ["pt-BR", "en"];

/// One period's settings, or a change to them: `None` is "not set here".
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Period {
    pub on: Option<bool>,
    pub format: Option<String>,
    pub folder: Option<String>,
    pub template: Option<String>,
}

/// The periodic notes' settings, or a change to them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Periodic {
    pub day: Option<Period>,
    pub week: Option<Period>,
    pub month: Option<Period>,
    pub quarter: Option<Period>,
    pub year: Option<Period>,
    /// `sunday` … `saturday`.
    pub week_start: Option<String>,
    /// `pt-BR` or `en`.
    pub language: Option<String>,
}

impl Periodic {
    fn periods(&self) -> [(&'static str, Option<&Period>); 5] {
        [
            ("day", self.day.as_ref()),
            ("week", self.week.as_ref()),
            ("month", self.month.as_ref()),
            ("quarter", self.quarter.as_ref()),
            ("year", self.year.as_ref()),
        ]
    }
}

/// A folder or a template's path as the file may keep it: empty (the
/// folder's root, or no template named), or a plain path relative to the
/// folder — the bookmarks' rule, a trailing `/` and `.md` allowed.
fn plain_or_empty(p: &str) -> Result<(), ConfinementError> {
    let p = p.trim().trim_end_matches('/');
    if p.is_empty() {
        return Ok(());
    }
    super::folder_settings::bookmark_path(p)
}

/// Whether a change may be written: its folders and templates plain
/// paths relative to the folder, its week's start and language known.
pub(crate) fn check(change: &Periodic) -> Result<(), CoreError> {
    for (_, period) in change.periods() {
        let Some(p) = period else { continue };
        for path in [&p.folder, &p.template].into_iter().flatten() {
            plain_or_empty(path).map_err(CoreError::Confined)?;
        }
        if let Some(format) = &p.format
            && (format.trim().is_empty() || format.contains('\0'))
        {
            return Err(CoreError::FolderSettings(
                "a periodic note's format cannot be empty".to_owned(),
            ));
        }
    }
    if let Some(day) = &change.week_start
        && !WEEKDAYS.contains(&day.as_str())
    {
        return Err(CoreError::FolderSettings(format!(
            "not a day of the week: {day}"
        )));
    }
    if let Some(lang) = &change.language
        && !LANGUAGES.contains(&lang.as_str())
    {
        return Err(CoreError::FolderSettings(format!(
            "not a language of the names: {lang}"
        )));
    }
    Ok(())
}

fn text(map: &Map<String, Value>, key: &str) -> Option<String> {
    map.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn period_of(value: Option<&Value>) -> Option<Period> {
    let map = value?.as_object()?;
    let path = |key: &str| text(map, key).filter(|p| plain_or_empty(p).is_ok());
    Some(Period {
        on: map.get("on").and_then(Value::as_bool),
        format: text(map, "format").filter(|f| !f.trim().is_empty()),
        folder: path("folder"),
        template: path("template"),
    })
}

/// What the file's `periodic` key holds, as this version reads it.
pub(crate) fn read(map: &Map<String, Value>) -> Option<Periodic> {
    let p = map.get(PERIODIC)?.as_object()?;
    Some(Periodic {
        day: period_of(p.get("day")),
        week: period_of(p.get("week")),
        month: period_of(p.get("month")),
        quarter: period_of(p.get("quarter")),
        year: period_of(p.get("year")),
        week_start: text(p, "weekStart").filter(|d| WEEKDAYS.contains(&d.as_str())),
        language: text(p, "language").filter(|l| LANGUAGES.contains(&l.as_str())),
    })
}

/// `change` laid over the file's `periodic`: what it sets replaces what
/// was there, period by period and key by key; the rest is kept.
pub(crate) fn apply(map: &mut Map<String, Value>, change: &Periodic) {
    let entry = map
        .entry(PERIODIC.to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    let Some(p) = entry.as_object_mut() else {
        return;
    };
    for (name, period) in change.periods() {
        let Some(period) = period else { continue };
        let at = p
            .entry(name.to_owned())
            .or_insert_with(|| Value::Object(Map::new()));
        if !at.is_object() {
            *at = Value::Object(Map::new());
        }
        let Some(at) = at.as_object_mut() else {
            continue;
        };
        if let Some(on) = period.on {
            at.insert("on".to_owned(), Value::Bool(on));
        }
        for (key, value) in [
            ("format", &period.format),
            ("folder", &period.folder),
            ("template", &period.template),
        ] {
            if let Some(v) = value {
                let v = if key == "format" {
                    v.clone()
                } else {
                    v.trim().trim_end_matches('/').to_owned()
                };
                at.insert(key.to_owned(), Value::String(v));
            }
        }
    }
    if let Some(day) = &change.week_start {
        p.insert("weekStart".to_owned(), Value::String(day.clone()));
    }
    if let Some(lang) = &change.language {
        p.insert("language".to_owned(), Value::String(lang.clone()));
    }
}

/// Obsidian's two settings files as the window is offered them (item 11).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ObsidianPeriodic {
    pub daily_notes: Option<String>,
    pub periodic_notes: Option<String>,
    /// The paths of the ones that are a placeholder of on-demand storage.
    pub unavailable: Vec<String>,
}

impl Workspace {
    /// Obsidian's settings for daily and periodic notes, read-only, through
    /// `verso-fs`'s narrow exception (ADR 0093 item 11): each file's text,
    /// or nothing when it is not there, not text, larger than the bound or
    /// not readable now. Nothing is written, under `.obsidian/` or
    /// anywhere.
    #[must_use]
    pub fn obsidian_periodic(&self) -> ObsidianPeriodic {
        let mut out = ObsidianPeriodic::default();
        for which in [
            ObsidianSettings::DailyNotes,
            ObsidianSettings::PeriodicNotes,
        ] {
            let found = match self.root.read_obsidian_settings(which) {
                Ok(ObsidianRead::Found(bytes)) => String::from_utf8(bytes).ok(),
                Ok(ObsidianRead::Unavailable) => {
                    out.unavailable.push(which.path().to_owned());
                    None
                }
                Ok(ObsidianRead::Absent | ObsidianRead::TooLarge) | Err(_) => None,
            };
            match which {
                ObsidianSettings::DailyNotes => out.daily_notes = found,
                ObsidianSettings::PeriodicNotes => out.periodic_notes = found,
                // Not a periodic notes' file: read elsewhere, by name.
                ObsidianSettings::App => {}
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &str) -> Map<String, Value> {
        match serde_json::from_str::<Value>(text).unwrap() {
            Value::Object(m) => m,
            _ => panic!("not an object"),
        }
    }

    #[test]
    fn read_keeps_what_it_knows_and_drops_the_wrong_kinds() {
        let map = parse(
            r#"{"periodic": {"day": {"on": true, "format": "YYYY-MM-DD", "folder": "Diário"},
                "week": {"on": "yes", "folder": "../fora", "template": "Templates/Semanal"},
                "weekStart": "monday", "language": "fr"}}"#,
        );
        let p = read(&map).unwrap();
        assert_eq!(
            p.day,
            Some(Period {
                on: Some(true),
                format: Some("YYYY-MM-DD".to_owned()),
                folder: Some("Diário".to_owned()),
                template: None,
            })
        );
        let week = p.week.unwrap();
        assert_eq!(week.on, None);
        assert_eq!(week.folder, None);
        assert_eq!(week.template.as_deref(), Some("Templates/Semanal"));
        assert_eq!(p.week_start.as_deref(), Some("monday"));
        assert_eq!(p.language, None);
        assert!(read(&parse(r#"{"bookmarks": []}"#)).is_none());
    }

    #[test]
    fn apply_merges_key_by_key_and_keeps_unknown_keys() {
        let mut map =
            parse(r#"{"periodic": {"day": {"folder": "Diário", "zeta": 1}, "custom": true}}"#);
        apply(
            &mut map,
            &Periodic {
                day: Some(Period {
                    format: Some("YYYY/MM/YYYY-MM-DD".to_owned()),
                    ..Period::default()
                }),
                week: Some(Period {
                    on: Some(true),
                    folder: Some("Semanas/".to_owned()),
                    ..Period::default()
                }),
                week_start: Some("sunday".to_owned()),
                ..Periodic::default()
            },
        );
        assert_eq!(
            Value::Object(map),
            serde_json::json!({"periodic": {
                "custom": true,
                "day": {"folder": "Diário", "format": "YYYY/MM/YYYY-MM-DD", "zeta": 1},
                "week": {"folder": "Semanas", "on": true},
                "weekStart": "sunday"
            }})
        );
    }

    #[test]
    fn a_path_out_of_the_folder_or_an_unknown_day_refuses_the_change() {
        for bad in ["../fora", "/etc", "C:/x", "a/../b"] {
            let change = Periodic {
                month: Some(Period {
                    folder: Some(bad.to_owned()),
                    ..Period::default()
                }),
                ..Periodic::default()
            };
            assert!(check(&change).is_err(), "{bad}");
            let change = Periodic {
                month: Some(Period {
                    template: Some(bad.to_owned()),
                    ..Period::default()
                }),
                ..Periodic::default()
            };
            assert!(check(&change).is_err(), "{bad}");
        }
        for good in ["", "Diário", "Diário/Semanas/", "Templates/Semanal.md"] {
            let change = Periodic {
                week: Some(Period {
                    folder: Some(good.to_owned()),
                    template: Some(good.to_owned()),
                    ..Period::default()
                }),
                ..Periodic::default()
            };
            assert!(check(&change).is_ok(), "{good}");
        }
        assert!(
            check(&Periodic {
                week_start: Some("domingo".to_owned()),
                ..Periodic::default()
            })
            .is_err()
        );
        assert!(
            check(&Periodic {
                language: Some("fr".to_owned()),
                ..Periodic::default()
            })
            .is_err()
        );
        assert!(
            check(&Periodic {
                day: Some(Period {
                    format: Some("  ".to_owned()),
                    ..Period::default()
                }),
                ..Periodic::default()
            })
            .is_err()
        );
    }
}
