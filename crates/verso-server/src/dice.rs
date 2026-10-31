// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Dice the server rolls for a room (ADR 0088 items 1, 4 and 7). The
//! notation is the one the window reads (`app/ui/src/dice/notation.ts`):
//! what Rolai's parser reads that the Obsidian Dice Roller plugin's README
//! documents with the same meaning — terms of dice `NdM` (`dM` is one
//! die), the fudge die `dF`, the percentile die `d%` (a d100), a die
//! that explodes (`!` right after it: at its highest face it adds one more
//! of it, which may explode in turn, at most [`EXPLODE_MOST`] more in a
//! roll; not on `dF` — D1, answered by the maintainer on 2026-10-14), keep
//! and drop (`kh`, `kl`, `dh`, `dl` with their count), and whole numbers,
//! joined by `+` and `-`, the first term a die, spaces removed before
//! reading. Anything else is refused; the window shows such a code as code.
//!
//! Each die comes from the operating system's generator, uniform, with no
//! modulo bias: a 32-bit draw past the last whole multiple of the sides is
//! drawn again.

use verso_contract::{DiceRoll, DiceTermRoll};

/// The most dice of one term, and of a whole roll; Rolai's bound.
pub const DICE_MOST: u32 = 100;
/// The most sides of a die; Rolai's bound.
pub const SIDES_MOST: u32 = 1000;
/// The most terms of a roll, dice and numbers.
pub const TERMS_MOST: usize = 20;
/// The longest notation, as written.
pub const NOTATION_MOST: usize = 200;
/// The largest number added to the dice.
const NUMBER_MOST: u32 = 999_999;
/// The most dice explosions add to one roll, all its terms together; the
/// window's `EXPLODE_MOST` (`app/ui/src/dice/rolai/roller.ts`).
pub const EXPLODE_MOST: u32 = 100;

/// Keep or drop, and how many.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeepDrop {
    KeepHighest(u32),
    KeepLowest(u32),
    DropHighest(u32),
    DropLowest(u32),
}

/// A term of dice: how many, of what, with what sign.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Term {
    pub sign: i32,
    pub count: u32,
    /// 3 for a fudge die.
    pub sides: u32,
    pub fudge: bool,
    /// `!`: a die at its highest face adds one more.
    pub explode: bool,
    pub keep: Option<KeepDrop>,
}

/// A notation read: its terms of dice, the numbers summed, and the
/// notation as rolled (without spaces).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notation {
    pub text: String,
    pub terms: Vec<Term>,
    pub modifier: i32,
}

fn digits(s: &[u8], at: &mut usize) -> Option<u32> {
    let start = *at;
    while *at < s.len() && s[*at].is_ascii_digit() {
        *at += 1;
    }
    if *at == start || *at - start > 7 {
        return None;
    }
    std::str::from_utf8(&s[start..*at]).ok()?.parse().ok()
}

/// The notation `raw` read, or why not.
pub fn read(raw: &str) -> Result<Notation, String> {
    if raw.len() > NOTATION_MOST {
        return Err(format!("a notation of {NOTATION_MOST} characters at most"));
    }
    let text: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    let s = text.as_bytes();
    let unread = || format!("not a roll Verso reads: {text}");
    if s.is_empty() {
        return Err(unread());
    }
    let mut at = 0;
    let mut terms = Vec::new();
    let mut modifier: i32 = 0;
    let mut count_of_terms = 0;
    let mut dice = 0_u32;
    while at < s.len() {
        let sign = if count_of_terms == 0 {
            1
        } else {
            match s[at] {
                b'+' => 1,
                b'-' => -1,
                _ => return Err(unread()),
            }
        };
        if count_of_terms > 0 {
            at += 1;
        }
        count_of_terms += 1;
        if count_of_terms > TERMS_MOST {
            return Err(format!("a roll of {TERMS_MOST} terms at most"));
        }
        let number = if at < s.len() && s[at].is_ascii_digit() {
            Some(digits(s, &mut at).ok_or_else(unread)?)
        } else {
            None
        };
        if at < s.len() && s[at] == b'd' {
            at += 1;
            let count = number.unwrap_or(1);
            if count == 0 || count > DICE_MOST {
                return Err(format!("from 1 to {DICE_MOST} dice in a term"));
            }
            let fudge = at < s.len() && s[at] == b'F';
            let sides = if fudge {
                at += 1;
                3
            } else if at < s.len() && s[at] == b'%' {
                at += 1;
                100
            } else {
                let sides = digits(s, &mut at).ok_or_else(unread)?;
                if !(2..=SIDES_MOST).contains(&sides) {
                    return Err(format!("a die of 2 to {SIDES_MOST} sides"));
                }
                sides
            };
            let explode = at < s.len() && s[at] == b'!';
            if explode {
                at += 1;
                if fudge {
                    return Err(unread());
                }
            }
            let keep = if s.len() >= at + 2 {
                let kind = &s[at..at + 2];
                let make: Option<fn(u32) -> KeepDrop> = match kind {
                    b"kh" => Some(KeepDrop::KeepHighest),
                    b"kl" => Some(KeepDrop::KeepLowest),
                    b"dh" => Some(KeepDrop::DropHighest),
                    b"dl" => Some(KeepDrop::DropLowest),
                    _ => None,
                };
                match make {
                    Some(make) => {
                        at += 2;
                        let n = digits(s, &mut at).ok_or_else(unread)?;
                        if n == 0 {
                            return Err(unread());
                        }
                        Some(make(n))
                    }
                    None => None,
                }
            } else {
                None
            };
            dice += count;
            if dice > DICE_MOST {
                return Err(format!("{DICE_MOST} dice in a roll at most"));
            }
            terms.push(Term {
                sign,
                count,
                sides,
                fudge,
                explode,
                keep,
            });
        } else {
            // A number: never the first term (Rolai's parser starts with a
            // die).
            let n = number.ok_or_else(unread)?;
            if count_of_terms == 1 || n > NUMBER_MOST {
                return Err(unread());
            }
            let n = i32::try_from(n).map_err(|_| unread())?;
            modifier += sign * n;
        }
        if at < s.len() && s[at] != b'+' && s[at] != b'-' {
            return Err(unread());
        }
    }
    Ok(Notation {
        text,
        terms,
        modifier,
    })
}

/// A die of `sides` from the 32-bit draws of `next`, uniform: a draw at
/// or past the last whole multiple of `sides` is drawn again.
pub fn uniform(sides: u32, next: &mut impl FnMut() -> Result<u32, String>) -> Result<u32, String> {
    let sides = sides.max(1);
    let limit = (u32::MAX / sides) * sides;
    loop {
        let x = next()?;
        if x < limit {
            return Ok(x % sides + 1);
        }
    }
}

/// A 32-bit draw from the operating system's generator.
pub fn system() -> Result<u32, String> {
    let mut bytes = [0_u8; 4];
    getrandom::fill(&mut bytes).map_err(|e| format!("no randomness: {e}"))?;
    Ok(u32::from_le_bytes(bytes))
}

/// The dice kept and dropped of `faces`, each in the order they fell, as
/// Rolai's roller keeps them: ranked highest first, the earlier first
/// among equals.
fn kept(faces: &[i32], keep: Option<KeepDrop>) -> (Vec<i32>, Vec<i32>) {
    let Some(keep) = keep else {
        return (faces.to_vec(), Vec::new());
    };
    let mut ranked: Vec<usize> = (0..faces.len()).collect();
    ranked.sort_by(|a, b| faces[*b].cmp(&faces[*a]).then(a.cmp(b)));
    let len = ranked.len();
    let at = |n: u32| usize::try_from(n).unwrap_or(usize::MAX).min(len);
    let chosen: &[usize] = match keep {
        KeepDrop::KeepHighest(n) => &ranked[..at(n)],
        KeepDrop::KeepLowest(n) => &ranked[len - at(n)..],
        KeepDrop::DropHighest(n) => &ranked[at(n)..],
        KeepDrop::DropLowest(n) => &ranked[..len - at(n)],
    };
    let mut keep_set = vec![false; len];
    for i in chosen {
        keep_set[*i] = true;
    }
    let mut k = Vec::new();
    let mut d = Vec::new();
    for (i, f) in faces.iter().enumerate() {
        if keep_set[i] { k.push(*f) } else { d.push(*f) }
    }
    (k, d)
}

/// `notation` rolled with the draws of `next`, by `by` at `at`.
pub fn roll(
    notation: &Notation,
    source: Option<String>,
    by: &str,
    at: &str,
    next: &mut impl FnMut() -> Result<u32, String>,
) -> Result<DiceRoll, String> {
    let mut terms = Vec::new();
    let mut total = notation.modifier;
    let mut exploded = 0_u32;
    for t in &notation.terms {
        let mut faces = Vec::new();
        for _ in 0..t.count {
            let face = i32::try_from(uniform(t.sides, next)?).map_err(|e| e.to_string())?;
            faces.push(if t.fudge { face - 2 } else { face });
        }
        // A die at its highest face adds one more, in the order they fall,
        // each new one able to explode too, until the roll has added
        // EXPLODE_MOST; the added dice are kept or dropped as the others.
        if t.explode {
            let highest = i32::try_from(t.sides).map_err(|e| e.to_string())?;
            let mut i = 0;
            while i < faces.len() && exploded < EXPLODE_MOST {
                if faces[i] == highest {
                    faces.push(i32::try_from(uniform(t.sides, next)?).map_err(|e| e.to_string())?);
                    exploded += 1;
                }
                i += 1;
            }
        }
        let (k, d) = kept(&faces, t.keep);
        total += t.sign * k.iter().sum::<i32>();
        terms.push(DiceTermRoll {
            sign: t.sign,
            sides: t.sides,
            fudge: t.fudge,
            kept: k,
            dropped: d,
        });
    }
    Ok(DiceRoll {
        notation: notation.text.clone(),
        source,
        terms,
        modifier: notation.modifier,
        total,
        by: by.to_owned(),
        at: at.to_owned(),
        styles: None,
        occurrence: None,
    })
}

/// The most dice with one code a note's roll may name by place; a larger
/// number is no die of a note and is dropped (display only, ADR 0107).
const OCCURRENCE_MOST: u32 = 1000;

/// The place of the clicked die among the note's dice with its code, as a
/// window sent it: kept when it can be one, otherwise none.
pub fn occurrence(raw: Option<u32>) -> Option<u32> {
    raw.filter(|n| *n < OCCURRENCE_MOST)
}

/// The table a roll names, as the note writes it: a wikilink on one
/// line, of a reasonable length.
pub fn source(raw: Option<String>) -> Result<Option<String>, String> {
    let Some(s) = raw else { return Ok(None) };
    let ok = s.len() <= 512
        && s.starts_with("[[")
        && s.ends_with("]]")
        && s.len() > 4
        && !s.chars().any(char::is_control);
    if ok {
        Ok(Some(s))
    } else {
        Err("a table is a link to it, [[Note#^id]]".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn of(text: &str) -> Notation {
        read(text).unwrap()
    }

    /// Draws in order, as given.
    fn draws(values: &[u32]) -> impl FnMut() -> Result<u32, String> + '_ {
        let mut i = 0;
        move || {
            let v = values.get(i).copied().ok_or("no more draws")?;
            i += 1;
            Ok(v)
        }
    }

    #[test]
    fn the_forms_both_read_are_read() {
        let n = of("1d20 + 3");
        assert_eq!(n.text, "1d20+3");
        assert_eq!(n.modifier, 3);
        assert_eq!(n.terms.len(), 1);
        assert_eq!((n.terms[0].count, n.terms[0].sides), (1, 20));
        assert_eq!(of("d6").terms[0].count, 1);
        let n = of("2d6+1d4-1d8-2+5");
        assert_eq!(
            n.terms.iter().map(|t| t.sign).collect::<Vec<_>>(),
            [1, 1, -1]
        );
        assert_eq!(n.modifier, 3);
        assert_eq!(of("4d6kh3").terms[0].keep, Some(KeepDrop::KeepHighest(3)));
        assert_eq!(of("2d20kl1").terms[0].keep, Some(KeepDrop::KeepLowest(1)));
        assert_eq!(of("4d6dl1").terms[0].keep, Some(KeepDrop::DropLowest(1)));
        assert_eq!(of("4d6dh1").terms[0].keep, Some(KeepDrop::DropHighest(1)));
        let f = of("4dF");
        assert!(f.terms[0].fudge && f.terms[0].sides == 3);
    }

    /// What one of the two reads and the other does not stays code
    /// (ADR 0088 item 1): never a different roll.
    #[test]
    fn a_form_only_one_reads_is_not_read() {
        for text in [
            "",
            "3",
            "3+1d6",
            "-1d6",
            "1d20*2",
            "(1d6)",
            "2^1d4",
            "1d",
            "2d6!!",
            "4dF!",
            "1d6kh1!",
            "1d%%",
            "1d%6",
            "1d6r",
            "4d6!r<2",
            "1d20adv",
            "1d20dis",
            "2c",
            "[2d6]",
            "{2d6}",
            "1d6vs1d6",
            "2d20k",
            "2d20kh",
            "4d6kh3kh2",
            "4d6+3kh3",
            "1d[3,5]",
            "1dS",
            "4df",
            "2D6",
            "1d20>10",
            "0d6",
            "101d6",
            "1d1",
            "1d1001",
            "1d6|avg",
            "1d6+",
        ] {
            assert!(read(text).is_err(), "{text:?} was read");
        }
        assert!(read(&"1d6+".repeat(30)).is_err());
        assert!(read(&format!("1d6{}", "+1d1".repeat(5))).is_err());
        assert!(read("50d6+51d6").is_err());
    }

    /// Explode and percentile, as the README writes them (D1, answered by
    /// the maintainer on 2026-10-14).
    #[test]
    fn explode_and_percentile_are_read() {
        for text in [
            "1d%",
            "d%",
            "2d%+5",
            "2d6!",
            "d6!",
            "4d6!kh3",
            "1d20!+1d4",
            "1d%!",
        ] {
            assert_eq!(read(text).map(|n| n.text), Ok(text.to_owned()), "{text}");
        }
        let p = of("d%");
        assert_eq!((p.terms[0].sides, p.terms[0].explode), (100, false));
        let e = of("4d6!kh3");
        assert!(e.terms[0].explode);
        assert_eq!(e.terms[0].keep, Some(KeepDrop::KeepHighest(3)));
    }

    /// A die at its highest face explodes: one more of it, which may
    /// explode in turn, at most `EXPLODE_MOST` more in a roll — the
    /// window's same dice for the same draws.
    #[test]
    fn a_die_at_its_highest_face_explodes() {
        // 2d6!: 6,3; the 6 adds a 6, which adds a 1.
        let r = roll(&of("2d6!"), None, "", "t", &mut draws(&[5, 2, 5, 0])).unwrap();
        assert_eq!(r.terms[0].kept, [6, 3, 6, 1]);
        assert_eq!(r.total, 16);
        let k = roll(&of("3d6!kh2"), None, "", "t", &mut draws(&[5, 0, 2, 3])).unwrap();
        assert_eq!(
            (k.terms[0].kept.clone(), k.terms[0].dropped.clone(), k.total),
            (vec![6, 4], vec![1, 3], 10)
        );
        let p = roll(&of("d%"), None, "", "t", &mut draws(&[99])).unwrap();
        assert_eq!((p.terms[0].sides, p.total), (100, 100));
        // Every die at its highest: 100 more in the whole roll, then none.
        let mut top = || Ok(1_u32);
        let all = roll(&of("50d2!+50d2!"), None, "", "t", &mut top).unwrap();
        let dice: usize = all.terms.iter().map(|t| t.kept.len()).sum();
        assert_eq!((dice, all.total), (200, 400));
        assert_eq!(EXPLODE_MOST, 100);
    }

    #[test]
    fn keep_and_drop_keep_as_rolai_does() {
        let faces = [3, 6, 1, 6];
        assert_eq!(
            kept(&faces, Some(KeepDrop::KeepHighest(3))),
            (vec![3, 6, 6], vec![1])
        );
        assert_eq!(
            kept(&faces, Some(KeepDrop::KeepLowest(1))),
            (vec![1], vec![3, 6, 6])
        );
        assert_eq!(
            kept(&faces, Some(KeepDrop::DropHighest(1))),
            (vec![3, 1, 6], vec![6])
        );
        assert_eq!(
            kept(&faces, Some(KeepDrop::DropLowest(1))),
            (vec![3, 6, 6], vec![1])
        );
        // More than there are: all kept, or none.
        assert_eq!(kept(&faces, Some(KeepDrop::KeepHighest(9))).0.len(), 4);
        assert_eq!(kept(&faces, Some(KeepDrop::DropLowest(9))).0.len(), 0);
    }

    #[test]
    fn a_roll_totals_its_terms_and_its_numbers() {
        // 2d6+1d4-1d8+3 with draws 0,5 | 3 | 7 -> 1,6 | 4 | 8.
        let n = of("2d6+1d4-1d8+3");
        let r = roll(&n, None, "Ana", "t", &mut draws(&[0, 5, 3, 7])).unwrap();
        assert_eq!(r.terms[0].kept, [1, 6]);
        assert_eq!(r.terms[1].kept, [4]);
        assert_eq!(r.terms[2].kept, [8]);
        assert_eq!(r.total, 1 + 6 + 4 - 8 + 3);
        let f = roll(&of("3dF"), None, "", "t", &mut draws(&[0, 1, 2])).unwrap();
        assert_eq!(f.terms[0].kept, [-1, 0, 1]);
        assert_eq!(f.total, 0);
    }

    /// No modulo bias (item 7): a draw at or past the last whole multiple
    /// of the sides is drawn again, never folded onto the low faces.
    #[test]
    fn a_draw_past_the_last_multiple_is_drawn_again() {
        let limit = (u32::MAX / 6) * 6;
        assert_eq!(uniform(6, &mut draws(&[limit, u32::MAX, 13])).unwrap(), 2);
        assert_eq!(uniform(6, &mut draws(&[limit - 1])).unwrap(), 6);
    }

    #[test]
    fn the_systems_dice_are_uniform() {
        let n = 60_000;
        let mut seen = [0_u32; 6];
        for _ in 0..n {
            let face = uniform(6, &mut system).unwrap();
            seen[usize::try_from(face - 1).unwrap()] += 1;
        }
        // Chi-square with 5 degrees of freedom: past 20.5 one time in a
        // thousand.
        let expected = f64::from(n) / 6.0;
        let chi: f64 = seen
            .iter()
            .map(|c| (f64::from(*c) - expected).powi(2) / expected)
            .sum();
        assert!(chi < 20.5, "{seen:?} chi {chi}");
    }

    #[test]
    fn a_table_is_a_link_on_one_line() {
        assert_eq!(source(None).unwrap(), None);
        assert!(source(Some("[[Tabelas#^e]]".into())).unwrap().is_some());
        for bad in ["Tabelas", "[[]]", "[[a\nb]]", "[[a]"] {
            assert!(source(Some(bad.into())).is_err(), "{bad}");
        }
    }
}
