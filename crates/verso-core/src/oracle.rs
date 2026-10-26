// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The oracle's tables in the folder's layer (ADR 0102 item 2): the odds
//! table and the spark word lists, under `oracle` in `.verso/settings.json`,
//! when the folder changed them from the defaults the window carries.
//!
//! The window rolls, the core keeps what it was told, and keeps it
//! well-formed: a change is refused unless the odds are five rows of six
//! whole numbers adding to 100 and each spark list holds 1 to 200 words of
//! 1 to 60 characters. A file edited by hand is read with the same rule: a
//! value that does not pass is not applied, and the read says so (one line
//! in the layer's warnings) — the file keeps it until the next change of
//! that key. Keys this version does not know are kept on every write.
//!
//! ```json
//! "oracle": {
//!   "odds": [[10, 30, 20, 20, 15, 5], …],
//!   "sparks": { "action": ["abandonar", …], "descriptor": […], "focus": […], "theme": […] }
//! }
//! ```

use serde_json::{Map, Value};

use super::*;

const ORACLE: &str = "oracle";
const ROWS: usize = 5;
const COLUMNS: usize = 6;
const SPARK_LISTS: [&str; 4] = ["action", "theme", "descriptor", "focus"];
const WORDS_MOST: usize = 200;
const WORD_CHARS_MOST: usize = 60;

/// The spark word lists, or a change to them: all four at once.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OracleSparks {
    pub action: Vec<String>,
    pub theme: Vec<String>,
    pub descriptor: Vec<String>,
    pub focus: Vec<String>,
}

impl OracleSparks {
    fn lists(&self) -> [(&'static str, &Vec<String>); 4] {
        [
            ("action", &self.action),
            ("theme", &self.theme),
            ("descriptor", &self.descriptor),
            ("focus", &self.focus),
        ]
    }
}

/// The oracle's settings, or a change to them: `None` is "not set here".
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Oracle {
    /// Five rows (nearly certain, likely, even, unlikely, nearly
    /// impossible) of six numbers adding to 100: yes-and, yes, yes-but,
    /// no-but, no, no-and.
    pub odds: Option<Vec<Vec<u32>>>,
    pub sparks: Option<OracleSparks>,
    /// Remove the odds from the file (back to the defaults the window
    /// carries). `None` in `odds` cannot say this: it is "no change".
    pub clear_odds: bool,
    /// Remove the spark lists from the file, likewise.
    pub clear_sparks: bool,
}

fn odds_problem(odds: &[Vec<u32>]) -> Option<String> {
    if odds.len() != ROWS {
        return Some(format!("the odds are {ROWS} rows, not {}", odds.len()));
    }
    for (i, row) in odds.iter().enumerate() {
        if row.len() != COLUMNS {
            return Some(format!(
                "odds row {} has {} numbers, not {COLUMNS}",
                i + 1,
                row.len()
            ));
        }
        // A number past `u8` still reaches here and is refused by its sum.
        let sum: u64 = row.iter().map(|&n| u64::from(n)).sum();
        if sum != 100 {
            return Some(format!("odds row {} adds to {sum}, not 100", i + 1));
        }
    }
    None
}

fn list_problem(name: &str, words: &[String]) -> Option<String> {
    if words.is_empty() || words.len() > WORDS_MOST {
        return Some(format!(
            "the {name} sparks are {} words, not 1 to {WORDS_MOST}",
            words.len()
        ));
    }
    words
        .iter()
        .position(|w| w.is_empty() || w.chars().count() > WORD_CHARS_MOST)
        .map(|i| {
            format!(
                "word {} of the {name} sparks is not 1 to {WORD_CHARS_MOST} characters",
                i + 1
            )
        })
}

/// Whether a change may be written: the odds and the spark lists inside
/// their bounds.
pub(crate) fn check(change: &Oracle) -> Result<(), CoreError> {
    if (change.clear_odds && change.odds.is_some())
        || (change.clear_sparks && change.sparks.is_some())
    {
        return Err(CoreError::FolderSettings(
            "a change cannot both set and clear the same oracle key".to_owned(),
        ));
    }
    if let Some(odds) = &change.odds
        && let Some(problem) = odds_problem(odds)
    {
        return Err(CoreError::FolderSettings(problem));
    }
    if let Some(sparks) = &change.sparks {
        for (name, words) in sparks.lists() {
            if let Some(problem) = list_problem(name, words) {
                return Err(CoreError::FolderSettings(problem));
            }
        }
    }
    Ok(())
}

fn odds_of(value: &Value) -> Option<Vec<Vec<u32>>> {
    let rows: Option<Vec<Vec<u32>>> = value
        .as_array()?
        .iter()
        .map(|row| {
            row.as_array()?
                .iter()
                .map(|n| n.as_u64().and_then(|n| u32::try_from(n).ok()))
                .collect()
        })
        .collect();
    rows.filter(|rows| odds_problem(rows).is_none())
}

fn words_of(value: Option<&Value>, name: &str) -> Option<Vec<String>> {
    let words: Vec<String> = value?
        .as_array()?
        .iter()
        .map(|w| w.as_str().map(str::to_owned))
        .collect::<Option<_>>()?;
    list_problem(name, &words).is_none().then_some(words)
}

fn sparks_of(value: &Value) -> Option<OracleSparks> {
    let map = value.as_object()?;
    Some(OracleSparks {
        action: words_of(map.get("action"), "action")?,
        theme: words_of(map.get("theme"), "theme")?,
        descriptor: words_of(map.get("descriptor"), "descriptor")?,
        focus: words_of(map.get("focus"), "focus")?,
    })
}

/// What the file's `oracle` key holds, as this version reads it: a part
/// that does not pass the rule is not applied.
pub(crate) fn read(map: &Map<String, Value>) -> Option<Oracle> {
    let o = map.get(ORACLE)?.as_object()?;
    Some(Oracle {
        odds: o.get("odds").and_then(odds_of),
        sparks: o.get("sparks").and_then(sparks_of),
        ..Oracle::default()
    })
}

/// The parts of the file's `oracle` key that are not applied, one line
/// each, for the read to say.
pub(crate) fn problems(map: &Map<String, Value>) -> Vec<String> {
    let Some(o) = map.get(ORACLE).and_then(Value::as_object) else {
        return if map.contains_key(ORACLE) {
            vec!["oracle settings ignored: not an object".to_owned()]
        } else {
            Vec::new()
        };
    };
    let mut out = Vec::new();
    if o.get("odds").is_some_and(|v| odds_of(v).is_none()) {
        out.push("oracle odds ignored: not 5 rows of 6 numbers adding to 100".to_owned());
    }
    if o.get("sparks").is_some_and(|v| sparks_of(v).is_none()) {
        out.push(format!(
            "oracle sparks ignored: need the lists {} of 1 to {WORDS_MOST} words of 1 to {WORD_CHARS_MOST} characters",
            SPARK_LISTS.join(", ")
        ));
    }
    out
}

fn object_at<'a>(map: &'a mut Map<String, Value>, key: &str) -> Option<&'a mut Map<String, Value>> {
    let entry = map
        .entry(key.to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    entry.as_object_mut()
}

/// `change` laid over the file's `oracle`: what it sets replaces what was
/// there, the odds whole and the spark lists one by one; the rest is kept.
pub(crate) fn apply(map: &mut Map<String, Value>, change: &Oracle) {
    let Some(o) = object_at(map, ORACLE) else {
        return;
    };
    if change.clear_odds {
        o.remove("odds");
    }
    if change.clear_sparks {
        o.remove("sparks");
    }
    if let Some(odds) = &change.odds {
        o.insert(
            "odds".to_owned(),
            Value::Array(
                odds.iter()
                    .map(|row| Value::Array(row.iter().map(|&n| Value::from(n)).collect()))
                    .collect(),
            ),
        );
    }
    if let Some(sparks) = &change.sparks
        && let Some(s) = object_at(o, "sparks")
    {
        for (name, words) in sparks.lists() {
            s.insert(
                name.to_owned(),
                Value::Array(words.iter().cloned().map(Value::String).collect()),
            );
        }
    }
    // Never leave an empty object behind.
    if o.is_empty() {
        map.remove(ORACLE);
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

    fn odds() -> Vec<Vec<u32>> {
        vec![vec![10, 30, 20, 20, 15, 5]; 5]
    }

    fn sparks() -> OracleSparks {
        let list = |w: &str| vec![w.to_owned()];
        OracleSparks {
            action: list("abandonar"),
            theme: list("honra"),
            descriptor: list("ardente"),
            focus: list("aliado"),
        }
    }

    #[test]
    fn a_change_inside_the_bounds_passes() {
        let change = Oracle {
            odds: Some(odds()),
            sparks: Some(sparks()),
            ..Oracle::default()
        };
        assert!(check(&change).is_ok());
        assert!(check(&Oracle::default()).is_ok());
    }

    #[test]
    fn the_odds_are_five_rows_of_six_adding_to_100() {
        for bad in [
            vec![vec![10, 30, 20, 20, 15, 5]; 4],
            vec![vec![10, 30, 20, 20, 15, 5]; 6],
            vec![vec![10, 30, 20, 20, 15]; 5],
            vec![vec![10, 30, 20, 20, 15, 6]; 5],
            vec![vec![10, 30, 20, 20, 15, 4]; 5],
            vec![vec![255, 255, 0, 0, 0, 0]; 5],
            // Past `u8`: refused by the core with its message, whatever the
            // host decoded.
            vec![vec![300, 0, 0, 0, 0, 0]; 5],
            vec![vec![u32::MAX, u32::MAX, 0, 0, 0, 0]; 5],
        ] {
            let change = Oracle {
                odds: Some(bad),
                ..Oracle::default()
            };
            assert!(check(&change).is_err());
        }
        let wide = Oracle {
            odds: Some(vec![vec![300, 0, 0, 0, 0, 0]; 5]),
            ..Oracle::default()
        };
        let Err(CoreError::FolderSettings(why)) = check(&wide) else {
            panic!("refused")
        };
        assert!(why.contains("adds to 300"), "{why}");
    }

    #[test]
    fn the_spark_lists_hold_1_to_200_words_of_1_to_60_characters() {
        let with = |f: &dyn Fn(&mut OracleSparks)| {
            let mut s = sparks();
            f(&mut s);
            check(&Oracle {
                sparks: Some(s),
                ..Oracle::default()
            })
        };
        assert!(with(&|s| s.action = Vec::new()).is_err());
        assert!(with(&|s| s.theme = vec!["a".to_owned(); 201]).is_err());
        assert!(with(&|s| s.theme = vec!["a".to_owned(); 200]).is_ok());
        assert!(with(&|s| s.focus = vec![String::new()]).is_err());
        assert!(with(&|s| s.focus = vec!["a".repeat(61)]).is_err());
        assert!(with(&|s| s.focus = vec!["é".repeat(60)]).is_ok());
        assert!(with(&|s| s.descriptor = vec!["a".repeat(60)]).is_ok());
    }

    #[test]
    fn apply_replaces_the_keys_it_sets_and_keeps_the_rest() {
        let mut map = parse(
            r#"{"oracle": {"extra": 1, "sparks": {"action": ["x"], "mine": ["y"]}}, "zeta": true}"#,
        );
        apply(
            &mut map,
            &Oracle {
                odds: Some(odds()),
                sparks: Some(sparks()),
                ..Oracle::default()
            },
        );
        let o = map["oracle"].as_object().unwrap();
        assert_eq!(o["extra"], 1);
        assert_eq!(o["sparks"]["mine"][0], "y");
        assert_eq!(o["sparks"]["action"][0], "abandonar");
        assert_eq!(o["odds"][4][5], 5);
        assert_eq!(map["zeta"], true);
        assert_eq!(read(&map).unwrap().sparks.unwrap(), sparks());
    }

    #[test]
    fn read_drops_what_does_not_pass_and_says_so() {
        let map = parse(
            r#"{"oracle": {"odds": [[1,2,3]], "sparks": {"action": ["a"], "theme": ["b"], "descriptor": ["c"]}}}"#,
        );
        let o = read(&map).unwrap();
        assert_eq!(o, Oracle::default());
        assert_eq!(problems(&map).len(), 2);
        let ok = parse(
            r#"{"oracle": {"odds": [[10,30,20,20,15,5],[10,30,20,20,15,5],[10,30,20,20,15,5],[10,30,20,20,15,5],[10,30,20,20,15,5]]}}"#,
        );
        assert_eq!(read(&ok).unwrap().odds.unwrap(), odds());
        assert!(problems(&ok).is_empty());
        assert!(read(&parse("{}")).is_none());
        assert!(problems(&parse("{}")).is_empty());
        assert_eq!(problems(&parse(r#"{"oracle": 3}"#)).len(), 1);
        assert!(read(&parse(r#"{"oracle": 3}"#)).is_none());
    }

    #[test]
    fn clearing_removes_the_key_and_an_empty_oracle_goes_too() {
        let mut map = parse(
            r#"{"oracle": {"extra": 1, "odds": [[1]], "sparks": {"action": ["x"]}}, "zeta": true}"#,
        );
        apply(
            &mut map,
            &Oracle {
                clear_odds: true,
                ..Oracle::default()
            },
        );
        let o = map["oracle"].as_object().unwrap();
        assert!(!o.contains_key("odds") && o.contains_key("sparks") && o["extra"] == 1);
        apply(
            &mut map,
            &Oracle {
                clear_sparks: true,
                ..Oracle::default()
            },
        );
        assert!(map["oracle"].as_object().unwrap().contains_key("extra"));
        let mut only = parse(r#"{"oracle": {"odds": [[1]], "sparks": {}}, "zeta": true}"#);
        apply(
            &mut only,
            &Oracle {
                clear_odds: true,
                clear_sparks: true,
                ..Oracle::default()
            },
        );
        assert!(!only.contains_key("oracle") && only["zeta"] == true);
        let mut none = parse("{}");
        apply(&mut none, &Oracle::default());
        assert!(!none.contains_key("oracle"));
    }

    #[test]
    fn setting_and_clearing_the_same_key_is_refused() {
        assert!(
            check(&Oracle {
                odds: Some(odds()),
                clear_odds: true,
                ..Oracle::default()
            })
            .is_err()
        );
        assert!(
            check(&Oracle {
                sparks: Some(sparks()),
                clear_sparks: true,
                ..Oracle::default()
            })
            .is_err()
        );
    }
}
