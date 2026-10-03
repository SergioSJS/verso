// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Focuses: named roots of the file tree, shared with make.md (ADR 0062).
//!
//! Kept in `.space/waypoints.json` at the root of the open folder when make.md
//! is present. Read always; written back only when the format is known (D6),
//! sync is enabled (D5), and the file on disk matches the revision that was
//! read (invariants 9 and 11, D7). Verso never creates `.space/` (D5).

use serde::{Deserialize, Serialize};
use verso_fs::{ReadError, Root, Stamp, WriteError};

use crate::{CoreError, revision};

/// A named root of the file tree (ADR 0062 D1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Focus {
    pub name: String,
    pub paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sticker: Option<String>,
}

/// The result of reading focuses from the open folder (ADR 0062).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FocusesSummary {
    /// Focuses found in `.space/waypoints.json`, or empty if absent/unreadable.
    pub focuses: Vec<Focus>,
    /// Whether `.space/waypoints.json` is present in the open folder.
    pub has_file: bool,
    /// Whether `.space/waypoints.json` is in the known format (ADR 0062 D6).
    pub format_known: bool,
    /// Why the file is read-only, if unknown format or unreadable.
    pub read_only_reason: Option<String>,
    /// Machine-readable code for read-only reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only_code: Option<String>,
    /// The revision stamp for optimistic concurrency (Invariants 9 & 11).
    pub stamp: Option<String>,
}

/// Validate make.md's `.space/waypoints.json` against the known format (ADR 0062 D6):
/// A JSON array; each element an object whose keys are `name` (a string),
/// `paths` (an array of strings) and, optionally, `sticker` (a string), and no
/// other key; each path `"/"` or relative, with no `..`.
pub fn validate_known_format(value: &serde_json::Value) -> Result<Vec<Focus>, String> {
    let serde_json::Value::Array(items) = value else {
        return Err("expected JSON array".to_owned());
    };
    let mut focuses = Vec::with_capacity(items.len());
    for (i, item) in items.iter().enumerate() {
        let serde_json::Value::Object(map) = item else {
            return Err(format!("element {i} is not a JSON object"));
        };
        for key in map.keys() {
            if key != "name" && key != "paths" && key != "sticker" {
                return Err(format!("unknown key {key:?} in element {i}"));
            }
        }
        let Some(serde_json::Value::String(name)) = map.get("name") else {
            return Err(format!("element {i} missing string 'name'"));
        };
        let Some(serde_json::Value::Array(raw_paths)) = map.get("paths") else {
            return Err(format!("element {i} missing array 'paths'"));
        };
        let mut paths = Vec::with_capacity(raw_paths.len());
        for (pi, p_val) in raw_paths.iter().enumerate() {
            let serde_json::Value::String(p) = p_val else {
                return Err(format!("element {i} path {pi} is not a string"));
            };
            if p.contains('\0') {
                return Err(format!("element {i} path {pi} contains NUL byte"));
            }
            if p == "/" {
                paths.push(p.clone());
            } else {
                if p.is_empty() {
                    return Err(format!("element {i} path {pi} is empty"));
                }
                if p.starts_with('/') {
                    return Err(format!("element {i} path {pi} is absolute"));
                }
                if p.split('/').any(|c| c == "..") {
                    return Err(format!("element {i} path {pi} contains '..' component"));
                }
                paths.push(p.clone());
            }
        }
        let sticker = match map.get("sticker") {
            Some(serde_json::Value::String(s)) => Some(s.clone()),
            Some(_) => return Err(format!("element {i} 'sticker' is not a string")),
            None => None,
        };
        focuses.push(Focus {
            name: name.clone(),
            paths,
            sticker,
        });
    }
    Ok(focuses)
}

/// Fallback extraction for read-only display when format is unknown.
fn extract_fallback_focuses(value: &serde_json::Value) -> Vec<Focus> {
    let mut result = Vec::new();
    if let serde_json::Value::Array(items) = value {
        for item in items {
            if let serde_json::Value::Object(map) = item
                && let Some(serde_json::Value::String(name)) = map.get("name")
            {
                let mut paths = Vec::new();
                if let Some(serde_json::Value::Array(arr)) = map.get("paths") {
                    for p in arr {
                        if let serde_json::Value::String(s) = p {
                            paths.push(s.clone());
                        }
                    }
                }
                let sticker = match map.get("sticker") {
                    Some(serde_json::Value::String(s)) => Some(s.clone()),
                    _ => None,
                };
                result.push(Focus {
                    name: name.clone(),
                    paths,
                    sticker,
                });
            }
        }
    }
    result
}

/// Read `.space/waypoints.json` from `root` (ADR 0062 D5, D6).
pub fn read_focuses(root: &Root) -> Result<FocusesSummary, CoreError> {
    match root.read_waypoints() {
        Ok((bytes, stamp)) => {
            let stamp_str = revision::encode(&stamp);
            let parsed: Result<serde_json::Value, _> = serde_json::from_slice(&bytes);
            match parsed {
                Ok(value) => match validate_known_format(&value) {
                    Ok(focuses) => Ok(FocusesSummary {
                        focuses,
                        has_file: true,
                        format_known: true,
                        read_only_reason: None,
                        read_only_code: None,
                        stamp: Some(stamp_str),
                    }),
                    Err(reason) => {
                        let fallback = extract_fallback_focuses(&value);
                        Ok(FocusesSummary {
                            focuses: fallback,
                            has_file: true,
                            format_known: false,
                            read_only_reason: Some(reason),
                            read_only_code: Some("unknown_format".to_string()),
                            stamp: Some(stamp_str),
                        })
                    }
                },
                Err(e) => Ok(FocusesSummary {
                    focuses: Vec::new(),
                    has_file: true,
                    format_known: false,
                    read_only_reason: Some(format!("invalid JSON: {e}")),
                    read_only_code: Some("invalid_json".to_string()),
                    stamp: Some(stamp_str),
                }),
            }
        }
        Err(ReadError::Unavailable) => Ok(FocusesSummary {
            focuses: Vec::new(),
            has_file: true,
            format_known: false,
            read_only_reason: Some("file in cloud (iCloud) not yet downloaded".to_string()),
            read_only_code: Some("cloud_placeholder".to_string()),
            stamp: None,
        }),
        Err(ReadError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => Ok(FocusesSummary {
            focuses: Vec::new(),
            has_file: false,
            format_known: false,
            read_only_reason: None,
            read_only_code: None,
            stamp: None,
        }),
        Err(e) => Err(CoreError::Read(e)),
    }
}

/// A parsed array element's byte span and key ordering in original JSON text.
#[derive(Debug, Clone)]
struct ElementSpan {
    start: usize,
    end: usize,
    keys_order: Vec<String>,
    focus: Focus,
}

fn detect_keys_order(slice: &str) -> Vec<String> {
    let mut positions = Vec::new();
    for key in ["name", "paths", "sticker"] {
        let pattern = format!("\"{key}\"");
        if let Some(pos) = slice.find(&pattern) {
            positions.push((pos, key.to_owned()));
        }
    }
    positions.sort_by_key(|(pos, _)| *pos);
    positions.into_iter().map(|(_, k)| k).collect()
}

fn parse_element_spans(text: &str) -> Vec<ElementSpan> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() && bytes[i] != b'[' {
        i += 1;
    }
    if i >= bytes.len() {
        return spans;
    }
    i += 1; // skip '['

    while i < bytes.len() {
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b',') {
            i += 1;
        }
        if i >= bytes.len() || bytes[i] == b']' {
            break;
        }
        if bytes[i] == b'{' {
            let start = i;
            let mut depth = 0;
            let mut in_string = false;
            let mut escape = false;
            while i < bytes.len() {
                let b = bytes[i];
                if escape {
                    escape = false;
                } else if b == b'\\' && in_string {
                    escape = true;
                } else if b == b'"' {
                    in_string = !in_string;
                } else if !in_string {
                    if b == b'{' {
                        depth += 1;
                    } else if b == b'}' {
                        depth -= 1;
                        if depth == 0 {
                            let end = i;
                            let slice = &text[start..=end];
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(slice)
                                && let Ok(mut focs) =
                                    validate_known_format(&serde_json::Value::Array(vec![val]))
                                && let Some(focus) = focs.pop()
                            {
                                let keys_order = detect_keys_order(slice);
                                spans.push(ElementSpan {
                                    start,
                                    end,
                                    keys_order,
                                    focus,
                                });
                            }
                            i += 1;
                            break;
                        }
                    }
                }
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    spans
}

fn format_focus(focus: &Focus, keys_order: &[String]) -> String {
    let mut parts = Vec::new();
    let default_order = [
        "name".to_string(),
        "paths".to_string(),
        "sticker".to_string(),
    ];
    let order = if keys_order.is_empty() {
        &default_order[..]
    } else {
        keys_order
    };
    for key in order {
        match key.as_str() {
            "name" => {
                let name_json = serde_json::to_string(&focus.name).unwrap_or_default();
                parts.push(format!("\"name\":{name_json}"));
            }
            "paths" => {
                let paths_json = serde_json::to_string(&focus.paths).unwrap_or_default();
                parts.push(format!("\"paths\":{paths_json}"));
            }
            "sticker" => {
                if let Some(st) = &focus.sticker {
                    let st_json = serde_json::to_string(st).unwrap_or_default();
                    parts.push(format!("\"sticker\":{st_json}"));
                }
            }
            _ => {}
        }
    }
    if !order.iter().any(|k| k == "name") {
        let name_json = serde_json::to_string(&focus.name).unwrap_or_default();
        parts.insert(0, format!("\"name\":{name_json}"));
    }
    if !order.iter().any(|k| k == "paths") {
        let paths_json = serde_json::to_string(&focus.paths).unwrap_or_default();
        parts.push(format!("\"paths\":{paths_json}"));
    }
    if let Some(st) = &focus.sticker
        && !order.iter().any(|k| k == "sticker")
    {
        let st_json = serde_json::to_string(st).unwrap_or_default();
        parts.push(format!("\"sticker\":{st_json}"));
    }
    format!("{{{}}}", parts.join(","))
}

/// Validate incoming focuses according to ADR 0062 D6 rules.
pub fn validate_focuses_input(focuses: &[Focus]) -> Result<(), String> {
    for (i, f) in focuses.iter().enumerate() {
        if f.name.is_empty() {
            return Err(format!("focus {i} has empty name"));
        }
        if f.name.contains('\0') {
            return Err(format!("focus {i} name contains NUL byte"));
        }
        for (pi, p) in f.paths.iter().enumerate() {
            if p.contains('\0') {
                return Err(format!("focus {i} path {pi} contains NUL byte"));
            }
            if p == "/" {
                continue;
            }
            if p.is_empty() {
                return Err(format!("focus {i} path {pi} is empty"));
            }
            if p.starts_with('/') {
                return Err(format!("focus {i} path {pi} is absolute"));
            }
            if p.split('/').any(|c| c == "..") {
                return Err(format!("focus {i} path {pi} contains '..' component"));
            }
        }
        if let Some(st) = &f.sticker {
            if st.is_empty() {
                return Err(format!("focus {i} has empty sticker"));
            }
            if st.contains('\0') {
                return Err(format!("focus {i} sticker contains NUL byte"));
            }
        }
    }
    Ok(())
}

/// Serialize updated focuses preserving unchanged element bytes, key order, and layout (ADR 0062 D6).
pub fn serialize_preserving(old_text: &str, new_focuses: &[Focus]) -> String {
    let spans = parse_element_spans(old_text);

    // If the count of focuses is the same AND order of names is unchanged, match 1-to-1 to maximize byte preservation.
    let same_order = spans.len() == new_focuses.len()
        && spans
            .iter()
            .zip(new_focuses.iter())
            .all(|(s, f)| s.focus.name == f.name);

    if same_order {
        let mut out = String::with_capacity(old_text.len() + 64);
        let mut last_end = 0;
        for (i, span) in spans.iter().enumerate() {
            // Keep verbatim prefix up to the element
            out.push_str(&old_text[last_end..span.start]);
            if span.focus == new_focuses[i] {
                // Byte-for-byte exact unchanged element
                out.push_str(&old_text[span.start..=span.end]);
            } else {
                // Changed element: preserve its key order
                out.push_str(&format_focus(&new_focuses[i], &span.keys_order));
            }
            last_end = span.end + 1;
        }
        // Keep verbatim suffix after the last element
        out.push_str(&old_text[last_end..]);
        return out;
    }

    if spans.is_empty() {
        let items: Vec<String> = new_focuses.iter().map(|f| format_focus(f, &[])).collect();
        return format!("[{}]", items.join(","));
    }

    // Detect indentation / layout from old_text:
    let prefix = &old_text[..spans[0].start];
    let suffix = spans.last().map(|s| &old_text[s.end + 1..]).unwrap_or("");
    let separator = if spans.len() >= 2 {
        old_text[spans[0].end + 1..spans[1].start].to_string()
    } else if prefix.contains('\n') {
        let indent = prefix.lines().last().unwrap_or("  ");
        format!(",\n{indent}")
    } else {
        ", ".to_string()
    };

    let mut formatted_elements = Vec::with_capacity(new_focuses.len());
    let mut matched_starts = std::collections::HashSet::new();

    for focus in new_focuses {
        if let Some(span) = spans
            .iter()
            .find(|s| s.focus.name == focus.name && !matched_starts.contains(&s.start))
        {
            matched_starts.insert(span.start);
            if span.focus == *focus {
                formatted_elements.push(old_text[span.start..=span.end].to_string());
            } else {
                formatted_elements.push(format_focus(focus, &span.keys_order));
            }
        } else {
            formatted_elements.push(format_focus(focus, &[]));
        }
    }

    format!("{prefix}{}{suffix}", formatted_elements.join(&separator))
}

/// Apply a delta from `old_focuses` to `new_focuses` onto `disk_focuses`.
/// If make.md concurrently modified the same focus that Verso modified,
/// or if any conflicting delta is detected, returns `None` so nothing is written (ADR 0062 D7).
fn reapply_changes(
    old_focuses: &[Focus],
    new_focuses: &[Focus],
    disk_focuses: &[Focus],
) -> Option<Vec<Focus>> {
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut updated = Vec::new();

    for nf in new_focuses {
        match old_focuses.iter().find(|o| o.name == nf.name) {
            None => added.push(nf.clone()),
            Some(of) if of != nf => updated.push((of.clone(), nf.clone())),
            Some(_) => {}
        }
    }

    for of in old_focuses {
        if !new_focuses.iter().any(|n| n.name == of.name) {
            removed.push(of.clone());
        }
    }

    // Check for conflicts against disk_focuses:
    // 1. Updated: make.md must not have touched or deleted the same focus.
    for (of, nf) in &updated {
        let Some(df) = disk_focuses.iter().find(|d| d.name == nf.name) else {
            return None; // make.md deleted it concurrently
        };
        if df != of {
            return None; // make.md also modified this focus! CONFLICT!
        }
    }

    // 2. Removed: make.md must not have modified it concurrently.
    for of in &removed {
        if disk_focuses.iter().any(|df| df.name == of.name && df != of) {
            return None; // make.md modified what Verso deleted! CONFLICT!
        }
    }

    // 3. Added: make.md must not have concurrently added a focus with the same name.
    for nf in &added {
        if disk_focuses.iter().any(|d| d.name == nf.name) {
            return None; // CONFLICT!
        }
    }

    // No conflict! Apply the non-conflicting deltas onto disk_focuses:
    let mut result = disk_focuses.to_vec();

    for of in &removed {
        result.retain(|r| r.name != of.name);
    }

    for (_, nf) in &updated {
        if let Some(df) = result.iter_mut().find(|r| r.name == nf.name) {
            *df = nf.clone();
        }
    }

    for nf in &added {
        result.push(nf.clone());
    }

    // If only reordering occurred:
    if added.is_empty() && removed.is_empty() && updated.is_empty() {
        let new_names: Vec<&str> = new_focuses.iter().map(|f| f.name.as_str()).collect();
        let disk_names: Vec<&str> = disk_focuses.iter().map(|f| f.name.as_str()).collect();
        if new_names.len() == disk_names.len() && new_names.iter().all(|n| disk_names.contains(n)) {
            result.sort_by_key(|f| {
                new_names
                    .iter()
                    .position(|n| *n == f.name)
                    .unwrap_or(usize::MAX)
            });
        } else {
            return None;
        }
    }

    Some(result)
}

/// Write `focuses` back to `.space/waypoints.json` (ADR 0062 D5, D6, D7).
pub fn write_focuses(
    root: &Root,
    base_focuses: Option<&[Focus]>,
    new_focuses: Vec<Focus>,
    expected_stamp: Option<&str>,
) -> Result<FocusesSummary, CoreError> {
    // 0. Validate format of new focuses before touching disk (ADR 0062 D6)
    validate_focuses_input(&new_focuses)
        .map_err(|reason| CoreError::Client(format!("invalid focus: {reason}")))?;

    // 1. Read current waypoints on disk
    let (current_bytes, current_stamp) = root.read_waypoints().map_err(CoreError::Read)?;
    let current_text = std::str::from_utf8(&current_bytes).map_err(|_| CoreError::NotText)?;
    let current_value: serde_json::Value = serde_json::from_str(current_text)
        .map_err(|e| CoreError::Client(format!("not JSON: {e}")))?;

    // 2. Validate known format (D6)
    let parsed_focuses = validate_known_format(&current_value)
        .map_err(|reason| CoreError::Client(format!("unknown format: {reason}")))?;

    // 3. Check expected stamp (Invariant 11) - strictly required when file exists!
    let expected = match expected_stamp {
        Some(token) => revision::decode(token).ok_or_else(|| {
            CoreError::Write(WriteError::Changed {
                current: current_stamp,
            })
        })?,
        None => {
            return Err(CoreError::Write(WriteError::Changed {
                current: current_stamp,
            }));
        }
    };

    let base = match base_focuses {
        Some(b) => b,
        None if expected == current_stamp => &parsed_focuses,
        None => {
            return Err(CoreError::Write(WriteError::Changed {
                current: current_stamp,
            }));
        }
    };

    if expected != current_stamp {
        // Attempt concurrency re-read and reapply (D7)
        return try_reread_and_reapply(root, base, &new_focuses, current_stamp);
    }

    // 4. Serialize with byte-preservation
    let new_content = serialize_preserving(current_text, &new_focuses);

    // 5. Atomic write
    match root.write_waypoints(new_content.as_bytes(), &expected) {
        Ok(report) => {
            let final_stamp = report.stamp.unwrap_or(current_stamp);
            Ok(FocusesSummary {
                focuses: new_focuses,
                has_file: true,
                format_known: true,
                read_only_reason: None,
                read_only_code: None,
                stamp: Some(revision::encode(&final_stamp)),
            })
        }
        Err(WriteError::Changed { current }) => {
            // Concurrent modification during write window: re-read and reapply (D7)
            try_reread_and_reapply(root, base, &new_focuses, current)
        }
        Err(e) => Err(CoreError::Write(e)),
    }
}

/// Re-read after concurrent modification and reapply change (ADR 0062 D7).
fn try_reread_and_reapply(
    root: &Root,
    old_focuses: &[Focus],
    intended_focuses: &[Focus],
    changed_stamp: Stamp,
) -> Result<FocusesSummary, CoreError> {
    let (disk_bytes, disk_stamp) = root.read_waypoints().map_err(CoreError::Read)?;
    let disk_text = std::str::from_utf8(&disk_bytes).map_err(|_| CoreError::NotText)?;
    let disk_value: serde_json::Value = serde_json::from_str(disk_text).map_err(|_| {
        CoreError::Write(WriteError::Changed {
            current: changed_stamp,
        })
    })?;

    let disk_focuses = match validate_known_format(&disk_value) {
        Ok(f) => f,
        Err(_) => {
            return Err(CoreError::Write(WriteError::Changed {
                current: changed_stamp,
            }));
        }
    };

    let reapplied = match reapply_changes(old_focuses, intended_focuses, &disk_focuses) {
        Some(r) => r,
        None => {
            return Err(CoreError::Write(WriteError::Changed {
                current: changed_stamp,
            }));
        }
    };

    let new_content = serialize_preserving(disk_text, &reapplied);
    let report = root
        .write_waypoints(new_content.as_bytes(), &disk_stamp)
        .map_err(CoreError::Write)?;

    let final_stamp = report.stamp.unwrap_or(disk_stamp);
    Ok(FocusesSummary {
        focuses: reapplied,
        has_file: true,
        format_known: true,
        read_only_reason: None,
        read_only_code: None,
        stamp: Some(revision::encode(&final_stamp)),
    })
}
