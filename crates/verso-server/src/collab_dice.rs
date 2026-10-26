// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A roll of dice in a room (ADR 0088 item 4, decided 2026-10-14): the
//! window asks, the server rolls with its own generator (`dice.rs`) and
//! relays the roll stamped with the account's name, as it stamps presence,
//! so no window can show the others a roll it chose. The room keeps its
//! last [`ROLLS_KEPT`](super::ROLLS_KEPT) rolls in memory for whoever
//! joins; nothing is written, to the file or the database. A reader rolls
//! too: a roll writes nothing.

use serde_json::json;
use verso_contract::{
    CollabOracle, CollabRoll, ContractError, DiceRoll, DiceStyles, OracleAsk, OracleDraw,
};
use verso_service::lock;

use super::{ROLLS_KEPT, refused, tell};
use crate::state::Server;

/// What a window adds to a roll (ADR 0107): the random table rolled, as
/// the note writes it; its dice's appearance, checked against the closed
/// form; whether the roll is "to the owner".
#[derive(Default)]
pub struct Opts {
    pub source: Option<String>,
    pub styles: Option<DiceStyles>,
    pub secret: bool,
    pub occurrence: Option<u32>,
}

/// `notation` rolled in the room of `path` for `who`, a window in it:
/// the roll, told to the room's other windows and kept for those who
/// join, and appended to the folder's table (`table.rs`, ADR 0107 item 2)
/// — rolled once. A secret roll is told to neither the room nor the
/// readers: only the table, to its roller and the folder's owners.
pub fn roll(
    server: &Server,
    who: &crate::presence::Sender,
    key: &str,
    path: &str,
    notation: &str,
    opts: Opts,
) -> Result<DiceRoll, ContractError> {
    let Opts {
        source,
        styles,
        secret,
        occurrence,
    } = opts;
    let read = crate::dice::read(notation).map_err(|e| refused(&e))?;
    let source = crate::dice::source(source).map_err(|e| refused(&e))?;
    let styles = styles
        .map(|s| crate::table_look::check(&s).map_err(|e| refused(&e)))
        .transpose()?;
    crate::table::pace_roll(server, who.client)?;
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let mut r = lock(&room);
    if !r.clients.contains(who.client) {
        return Err(refused("join the note first"));
    }
    let rolled = crate::dice::roll(
        &read,
        source,
        who.name,
        &crate::log::stamp(),
        &mut crate::dice::system,
    )
    .map_err(|e| verso_service::failed(e.as_str()))?;
    let mut rolled = rolled;
    rolled.styles = styles;
    rolled.occurrence = crate::dice::occurrence(occurrence);
    let open_to_readers = super::readers::roll_is_open(&r, &rolled);
    if !secret {
        if r.rolls.len() >= ROLLS_KEPT {
            r.rolls.pop_front();
        }
        r.rolls.push_back(rolled.clone());
        let heard = CollabRoll {
            path: path.to_owned(),
            roll: rolled.clone(),
        };
        tell(
            server,
            &r,
            Some(who.client),
            &json!({ "event": "collab-roll", "payload": heard }),
        );
        // The readers served the note's projection hear a roll that is not a
        // secret block's (ADR 0087 item 4).
        super::readers::roll(server, &r, who.client, &heard);
    }
    drop(r);
    // And the folder's table: the same roll, not rolled again.
    crate::table::note_roll(server, who, key, path, &rolled, (secret, !open_to_readers));
    Ok(rolled)
}

// An oracle draw in a room (ADR 0102 item 5, decided 2026-10-20): as for
// dice (`collab_dice.rs`), the window asks, the server draws with the
// system's generator — a die of a hundred for a question, one word of
// each list for a spark, one entry for a table, uniform, no modulo bias
// (ADR 0088 item 7) — and relays the draw stamped with the account's
// name. The window sends what it draws from (the odds row, the word
// lists, the entries: the folder's or the built-in ones, which only the
// window carries); it cannot send what fell. The question's text never
// reaches the server. Nothing is kept or written. A reader draws too.
// The readers served a projection hear a question only: the words of a
// spark or a table may come from a secret block.

/// The columns of an odds row.
const COLUMNS: usize = 6;
/// The most words of a list, and characters of a word (the folder
/// settings' bounds, `verso-core`'s `oracle.rs`).
const WORDS_MOST: usize = 200;
const WORD_CHARS_MOST: usize = 60;
/// The most entries of a table, and characters of one (the window's
/// `TABLE_LIMITS`).
const ENTRIES_MOST: usize = 500;
const ENTRY_CHARS_MOST: usize = 300;

/// `ask` drawn with the draws of `next`, by `by` at `at`, or why it
/// cannot be.
pub fn draw(
    ask: &OracleAsk,
    by: &str,
    at: &str,
    next: &mut impl FnMut() -> Result<u32, String>,
) -> Result<OracleDraw, String> {
    let stamp = |kind: &str, roll: u32, answer: Option<u32>, words: Vec<String>| OracleDraw {
        kind: kind.to_owned(),
        roll,
        answer,
        words,
        by: by.to_owned(),
        at: at.to_owned(),
    };
    match ask {
        OracleAsk::Question { odds } => {
            if odds.len() != COLUMNS || odds.iter().sum::<u32>() != 100 {
                return Err("odds are six numbers adding to 100".to_owned());
            }
            let roll = crate::dice::uniform(100, next)?;
            let mut up_to = 0;
            let mut answer = COLUMNS - 1;
            for (i, n) in odds.iter().enumerate() {
                up_to += n;
                if roll <= up_to {
                    answer = i;
                    break;
                }
            }
            let answer = u32::try_from(answer).map_err(|e| e.to_string())?;
            Ok(stamp("question", roll, Some(answer), Vec::new()))
        }
        OracleAsk::Spark { lists } => {
            let mut words = Vec::new();
            for list in [&lists.action, &lists.theme, &lists.descriptor, &lists.focus] {
                let ok = !list.is_empty()
                    && list.len() <= WORDS_MOST
                    && list.iter().all(|w| {
                        !w.trim().is_empty()
                            && w.chars().count() <= WORD_CHARS_MOST
                            && !w.chars().any(char::is_control)
                    });
                if !ok {
                    return Err(format!(
                        "a list of 1 to {WORDS_MOST} words of {WORD_CHARS_MOST} characters"
                    ));
                }
                let at = crate::dice::uniform(
                    u32::try_from(list.len()).map_err(|e| e.to_string())?,
                    next,
                )?;
                words.push(list[usize::try_from(at - 1).map_err(|e| e.to_string())?].clone());
            }
            Ok(stamp("spark", 0, None, words))
        }
        OracleAsk::Table { entries } => {
            let ok = !entries.is_empty()
                && entries.len() <= ENTRIES_MOST
                && entries.iter().all(|e| {
                    !e.trim().is_empty()
                        && e.chars().count() <= ENTRY_CHARS_MOST
                        && !e.chars().any(char::is_control)
                });
            if !ok {
                return Err(format!(
                    "a table of 1 to {ENTRIES_MOST} entries of {ENTRY_CHARS_MOST} characters"
                ));
            }
            let at = crate::dice::uniform(
                u32::try_from(entries.len()).map_err(|e| e.to_string())?,
                next,
            )?;
            let entry = entries[usize::try_from(at - 1).map_err(|e| e.to_string())?].clone();
            Ok(stamp("table", at, None, vec![entry]))
        }
    }
}

/// `ask` drawn in the room of `path` for `who`, a window in it: the draw,
/// told to the room's other windows.
pub fn oracle(
    server: &Server,
    who: &crate::presence::Sender,
    key: &str,
    path: &str,
    ask: &OracleAsk,
) -> Result<OracleDraw, ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let r = lock(&room);
    if !r.clients.contains(who.client) {
        return Err(refused("join the note first"));
    }
    crate::table::pace_roll(server, who.client)?;
    let drawn = draw(
        ask,
        who.name,
        &crate::log::stamp(),
        &mut crate::dice::system,
    )
    .map_err(|e| refused(&e))?;
    let heard = CollabOracle {
        path: path.to_owned(),
        draw: drawn.clone(),
    };
    tell(
        server,
        &r,
        Some(who.client),
        &json!({ "event": "collab-oracle", "payload": heard }),
    );
    if drawn.kind == "question" {
        super::readers::oracle(server, &r, who.client, &heard);
    }
    let open_to_readers = drawn.kind == "question" || super::readers::no_shadow(&r);
    drop(r);
    crate::table::note_oracle(server, who, key, path, &drawn, !open_to_readers);
    Ok(drawn)
}

#[cfg(test)]
mod oracle_tests {
    use super::*;
    use verso_contract::OracleSparks;

    fn draws(values: &[u32]) -> impl FnMut() -> Result<u32, String> + '_ {
        let mut i = 0;
        move || {
            let v = values.get(i).copied().ok_or("no more draws")?;
            i += 1;
            Ok(v)
        }
    }

    fn even() -> OracleAsk {
        OracleAsk::Question {
            odds: vec![10, 30, 10, 10, 30, 10],
        }
    }

    /// Faces 1-100 against a row: each column owns exactly its share.
    #[test]
    fn a_question_reads_its_row_by_the_faces() {
        let mut count = [0_u32; 6];
        for face in 1..=100_u32 {
            let d = draw(&even(), "Ana", "t", &mut draws(&[face - 1])).unwrap();
            assert_eq!(d.roll, face);
            count[d.answer.unwrap() as usize] += 1;
        }
        assert_eq!(count, [10, 30, 10, 10, 30, 10]);
        let first = draw(&even(), "Ana", "t", &mut draws(&[9])).unwrap();
        assert_eq!((first.answer, first.by.as_str()), (Some(0), "Ana"));
        let last = draw(&even(), "", "t", &mut draws(&[99])).unwrap();
        assert_eq!(last.answer, Some(5));
    }

    #[test]
    fn a_row_that_does_not_add_up_is_refused() {
        for odds in [
            vec![],
            vec![50, 50],
            vec![10, 30, 10, 10, 30, 9],
            vec![10, 30, 10, 10, 30, 11],
        ] {
            assert!(draw(&OracleAsk::Question { odds }, "", "t", &mut draws(&[0])).is_err());
        }
    }

    #[test]
    fn a_spark_takes_one_word_of_each_list() {
        let lists = OracleSparks {
            action: vec!["a1".into(), "a2".into()],
            theme: vec!["t1".into(), "t2".into(), "t3".into()],
            descriptor: vec!["d1".into()],
            focus: vec!["f1".into(), "f2".into()],
        };
        let d = draw(
            &OracleAsk::Spark {
                lists: lists.clone(),
            },
            "",
            "t",
            &mut draws(&[1, 2, 0, 0]),
        )
        .unwrap();
        assert_eq!(d.words, ["a2", "t3", "d1", "f1"]);
        let mut bad = lists.clone();
        bad.theme.clear();
        assert!(
            draw(
                &OracleAsk::Spark { lists: bad },
                "",
                "t",
                &mut draws(&[0, 0, 0, 0])
            )
            .is_err()
        );
        let mut long = lists;
        long.focus = vec!["x".repeat(61)];
        assert!(
            draw(
                &OracleAsk::Spark { lists: long },
                "",
                "t",
                &mut draws(&[0, 0, 0, 0])
            )
            .is_err()
        );
    }

    #[test]
    fn a_table_takes_one_entry() {
        let entries = vec!["um".to_owned(), "dois".to_owned(), "três".to_owned()];
        let d = draw(
            &OracleAsk::Table {
                entries: entries.clone(),
            },
            "",
            "t",
            &mut draws(&[2]),
        )
        .unwrap();
        assert_eq!((d.roll, d.words), (3, vec!["três".to_owned()]));
        assert!(
            draw(
                &OracleAsk::Table { entries: vec![] },
                "",
                "t",
                &mut draws(&[0])
            )
            .is_err()
        );
        assert!(
            draw(
                &OracleAsk::Table {
                    entries: vec![" ".into()]
                },
                "",
                "t",
                &mut draws(&[0])
            )
            .is_err()
        );
        assert!(
            draw(
                &OracleAsk::Table {
                    entries: vec!["a".into(); 501]
                },
                "",
                "t",
                &mut draws(&[0])
            )
            .is_err()
        );
    }
}
