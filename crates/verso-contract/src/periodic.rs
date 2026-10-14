// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Periodic notes (ADR 0093): their settings in the folder's layer (item
//! 4, `.verso/settings.json` under `periodic`), and Obsidian's two
//! settings files offered once, read-only (item 11).

use serde::{Deserialize, Serialize};
use specta::Type;

/// One period's settings, or a change to them: `None` is "not set here".
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PeriodSettings {
    /// Whether the period is on: its command, its marks in the calendar.
    pub on: Option<bool>,
    /// A Moment.js format string of the subset Verso reads (item 2); a `/`
    /// in it makes folders.
    pub format: Option<String>,
    /// The folder its notes are kept in, relative to the folder and joined
    /// by `/`; empty: the folder's root. Not set: the day's folder (item 3).
    pub folder: Option<String>,
    /// The template note, by its path relative to the folder or its name
    /// in the templates folder; empty or not set: the built rule (item 6).
    pub template: Option<String>,
}

/// The periodic notes' settings of a folder (ADR 0093 items 1–6), or a
/// change to them: what a change sets replaces what the file says, every
/// other key kept.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PeriodicSettings {
    pub day: Option<PeriodSettings>,
    pub week: Option<PeriodSettings>,
    pub month: Option<PeriodSettings>,
    pub quarter: Option<PeriodSettings>,
    pub year: Option<PeriodSettings>,
    /// The week's first day, `sunday` … `saturday` (item 5).
    pub week_start: Option<String>,
    /// The language month and weekday names are written in, `pt-BR` or
    /// `en` (item 5).
    pub language: Option<String>,
}

/// Obsidian's settings for daily and periodic notes, as their files hold
/// them (ADR 0093 item 11): the core Daily notes plugin's
/// `.obsidian/daily-notes.json` and the Periodic Notes plugin's
/// `.obsidian/plugins/periodic-notes/data.json`, read once and never
/// written. Each is its file's text, `None` when it is not there, not
/// readable now or not text; `unavailable` names the ones that are a
/// placeholder of on-demand storage.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ObsidianPeriodic {
    pub daily_notes: Option<String>,
    pub periodic_notes: Option<String>,
    pub unavailable: Vec<String>,
}
