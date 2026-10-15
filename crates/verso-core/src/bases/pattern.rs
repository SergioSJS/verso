// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The regular expressions of a base (ADR 0094 items 1 to 5): a literal
//! `/pattern/flags` as JavaScript reads it — Obsidian's "Functions" page
//! says its functions follow JavaScript, with MDN as the reference —
//! translated into the `regex` crate's syntax and run there, in time
//! linear in the pattern and the text: no catastrophic backtracking exists
//! for that engine.
//!
//! What it lacks — look-ahead, look-behind, back-references — and the
//! flags `y`, `d` and `v` are an error that names them, never a guess.
//! Where the engines read a pattern differently, JavaScript's meaning is
//! written out: `\d`, `\w`, `\s` and `\b` as JavaScript has them, `.`
//! stopping at `\r`, `\u2028` and `\u2029` as well as `\n`, a brace or a
//! bracket that makes no quantifier or class taken as itself.
//!
//! Bounds, because a base runs on a server over every note (ADR 0083): a
//! pattern of [`MAX_PATTERN`] characters at most, its compiled size and
//! the lazy DFA's cache capped, and every search charged — by the length
//! of the text it may scan — through the caller's `spend`.
//!
//! This file needs `std` and `regex` only: the fuzz harness of
//! `verso-dialect` compiles it on its own (`fuzz_targets/pattern.rs`).

use regex::{Captures, Regex, RegexBuilder};

/// The longest pattern, in characters.
pub(crate) const MAX_PATTERN: usize = 1000;

/// The compiled program's size cap, in bytes (`RegexBuilder::size_limit`).
pub(crate) const SIZE_LIMIT: usize = 1 << 20;

/// The lazy DFA's cache cap, in bytes (`RegexBuilder::dfa_size_limit`).
pub(crate) const DFA_SIZE_LIMIT: usize = 1 << 20;

/// Why a pattern does not compile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PatternError {
    /// Past [`MAX_PATTERN`] characters, or past the compiled size.
    TooLarge,
    /// What the engine does not have, by name: `lookahead`, `lookbehind`,
    /// `backreference`, `flag y`.
    Unsupported(String),
    /// Not a pattern, or a flag that is no flag.
    Invalid,
}

/// Why a search stopped before its answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stop {
    /// The query's budget is spent.
    Budget,
    /// The answer would outgrow the size a text or a list may have.
    TooLarge,
}

/// A pattern compiled, with what its flags and groups say.
#[derive(Debug)]
pub(crate) struct Pattern {
    re: Regex,
    /// `g`: every match, not only the first.
    pub(crate) global: bool,
    /// Capture groups, the whole match not counted.
    groups: usize,
    /// Whether any group has a name (`$<name>` in a replacement).
    named: bool,
    /// What one byte scanned costs: more for a larger program, which a
    /// search may have to run over each byte.
    pub(crate) weight: usize,
}

#[cfg(test)]
thread_local! {
    /// Patterns compiled on this thread: a query compiles each once.
    pub(crate) static COMPILED: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

struct Flags {
    global: bool,
    ignore_case: bool,
    multiline: bool,
    dot_all: bool,
    unicode: bool,
}

fn flags(text: &str) -> Result<Flags, PatternError> {
    let mut f = Flags {
        global: false,
        ignore_case: false,
        multiline: false,
        dot_all: false,
        unicode: false,
    };
    for c in text.chars() {
        let slot = match c {
            'g' => &mut f.global,
            'i' => &mut f.ignore_case,
            'm' => &mut f.multiline,
            's' => &mut f.dot_all,
            'u' => &mut f.unicode,
            'y' | 'd' | 'v' => return Err(PatternError::Unsupported(format!("flag {c}"))),
            _ => return Err(PatternError::Invalid),
        };
        if *slot {
            return Err(PatternError::Invalid);
        }
        *slot = true;
    }
    Ok(f)
}

/// Compile `/pattern/flags`.
pub(crate) fn compile(pattern: &str, flag_text: &str) -> Result<Pattern, PatternError> {
    if pattern.chars().count() > MAX_PATTERN {
        return Err(PatternError::TooLarge);
    }
    let f = flags(flag_text)?;
    let mut t = Translation {
        chars: pattern.chars().collect(),
        out: String::with_capacity(pattern.len() * 2),
        groups: 0,
        named: false,
        unicode: f.unicode,
        dot_all: f.dot_all,
    };
    t.run()?;
    #[cfg(test)]
    COMPILED.with(|c| c.set(c.get() + 1));
    let re = RegexBuilder::new(&t.out)
        .case_insensitive(f.ignore_case)
        .multi_line(f.multiline)
        // `^` and `$` with `m` take `\r` as a line's end too, as
        // JavaScript does; `.` is written out by the translation.
        .crlf(f.multiline)
        .size_limit(SIZE_LIMIT)
        .dfa_size_limit(DFA_SIZE_LIMIT)
        .build()
        .map_err(|e| match e {
            regex::Error::CompiledTooBig(_) => PatternError::TooLarge,
            _ => PatternError::Invalid,
        })?;
    Ok(Pattern {
        weight: 1 + t.out.len() / 128,
        re,
        global: f.global,
        groups: t.groups,
        named: t.named,
    })
}

/// JavaScript's whitespace (`\s`): ECMAScript's WhiteSpace and
/// LineTerminator.
const SPACE: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";
const DIGIT: &str = "0-9";
const WORD: &str = "0-9A-Za-z_";
/// A class no character is in.
const NOTHING: &str = "[a&&b]";

/// One member of a bracketed class.
enum Member {
    Char(char),
    /// Already in the target's syntax: `0-9`, `[^0-9]`.
    Set(String),
    /// Matches nothing (a lone surrogate, which no text of Rust holds).
    Nothing,
}

struct Translation {
    chars: Vec<char>,
    out: String,
    groups: usize,
    named: bool,
    unicode: bool,
    dot_all: bool,
}

impl Translation {
    fn at(&self, i: usize) -> Option<char> {
        self.chars.get(i).copied()
    }

    fn run(&mut self) -> Result<(), PatternError> {
        let mut i = 0;
        while let Some(c) = self.at(i) {
            i = match c {
                '\\' => self.escape(i)?,
                '[' => self.class(i)?,
                '(' => self.group(i)?,
                '.' => {
                    self.out.push_str(if self.dot_all {
                        "(?s:.)"
                    } else {
                        r"[^\n\r\x{2028}\x{2029}]"
                    });
                    i + 1
                }
                '{' => match self.quantifier(i) {
                    Some(end) => {
                        let q: String = self.chars[i..end].iter().collect();
                        self.out.push_str(&q);
                        end
                    }
                    None => {
                        self.out.push_str(r"\{");
                        i + 1
                    }
                },
                '}' => {
                    self.out.push_str(r"\}");
                    i + 1
                }
                ']' => {
                    self.out.push_str(r"\]");
                    i + 1
                }
                '^' | '$' | '|' | '*' | '+' | '?' | ')' => {
                    self.out.push(c);
                    i + 1
                }
                other => {
                    push_literal(&mut self.out, other);
                    i + 1
                }
            };
        }
        Ok(())
    }

    /// `{n}`, `{n,}` or `{n,m}` from `i`: where it ends.
    fn quantifier(&self, i: usize) -> Option<usize> {
        let mut j = i + 1;
        let digits = |j: &mut usize| {
            let start = *j;
            while self.at(*j).is_some_and(|c| c.is_ascii_digit()) {
                *j += 1;
            }
            *j > start
        };
        if !digits(&mut j) {
            return None;
        }
        if self.at(j) == Some(',') {
            j += 1;
            digits(&mut j);
        }
        (self.at(j) == Some('}')).then_some(j + 1)
    }

    fn group(&mut self, i: usize) -> Result<usize, PatternError> {
        if self.at(i + 1) != Some('?') {
            self.groups += 1;
            self.out.push('(');
            return Ok(i + 1);
        }
        match (self.at(i + 2), self.at(i + 3)) {
            (Some('=' | '!'), _) => Err(PatternError::Unsupported("lookahead".into())),
            (Some('<'), Some('=' | '!')) => Err(PatternError::Unsupported("lookbehind".into())),
            (Some('<'), _) => {
                let start = i + 3;
                let mut j = start;
                while self
                    .at(j)
                    .is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
                {
                    j += 1;
                }
                let first = self.at(start);
                if j == start
                    || self.at(j) != Some('>')
                    || first.is_some_and(|c| c.is_ascii_digit())
                {
                    return Err(PatternError::Invalid);
                }
                let name: String = self.chars[start..j].iter().collect();
                self.out.push_str("(?P<");
                self.out.push_str(&name);
                self.out.push('>');
                self.groups += 1;
                self.named = true;
                Ok(j + 1)
            }
            (Some(':'), _) => {
                self.out.push_str("(?:");
                Ok(i + 3)
            }
            _ => Err(PatternError::Invalid),
        }
    }

    /// An escape outside a class, from the `\` at `i`.
    fn escape(&mut self, i: usize) -> Result<usize, PatternError> {
        let Some(c) = self.at(i + 1) else {
            return Err(PatternError::Invalid);
        };
        match c {
            'b' => {
                self.out.push_str(r"(?-u:\b)");
                return Ok(i + 2);
            }
            'B' => {
                self.out.push_str(r"(?-u:\B)");
                return Ok(i + 2);
            }
            '1'..='9' => return Err(PatternError::Unsupported("backreference".into())),
            'k' if self.at(i + 2) == Some('<') => {
                return Err(PatternError::Unsupported("backreference".into()));
            }
            _ => {}
        }
        let (member, next) = self.escape_member(i)?;
        match member {
            Member::Char(ch) => push_literal(&mut self.out, ch),
            Member::Set(set) => {
                if set.starts_with('[') {
                    self.out.push_str(&set);
                } else {
                    self.out.push('[');
                    self.out.push_str(&set);
                    self.out.push(']');
                }
            }
            Member::Nothing => self.out.push_str(NOTHING),
        }
        Ok(next)
    }

    /// What the escape at `i` stands for, inside a class or out: a
    /// character, a set, or nothing.
    fn escape_member(&self, i: usize) -> Result<(Member, usize), PatternError> {
        let Some(c) = self.at(i + 1) else {
            return Err(PatternError::Invalid);
        };
        let set = |s: &str| Member::Set(s.to_owned());
        let not = |s: &str| Member::Set(format!("[^{s}]"));
        Ok(match c {
            'd' => (set(DIGIT), i + 2),
            'D' => (not(DIGIT), i + 2),
            'w' => (set(WORD), i + 2),
            'W' => (not(WORD), i + 2),
            's' => (set(SPACE), i + 2),
            'S' => (not(SPACE), i + 2),
            't' => (Member::Char('\t'), i + 2),
            'n' => (Member::Char('\n'), i + 2),
            'r' => (Member::Char('\r'), i + 2),
            'v' => (Member::Char('\u{B}'), i + 2),
            'f' => (Member::Char('\u{C}'), i + 2),
            // In a class, `\b` is the backspace.
            'b' => (Member::Char('\u{8}'), i + 2),
            '0'..='7' => {
                // `\0`, and JavaScript's legacy octal escapes.
                let mut j = i + 1;
                let mut value = 0u32;
                while j < i + 4 && self.at(j).is_some_and(|d| ('0'..='7').contains(&d)) {
                    let next = value * 8 + self.at(j).and_then(|d| d.to_digit(8)).unwrap_or(0);
                    if next > 0o377 {
                        break;
                    }
                    value = next;
                    j += 1;
                }
                (
                    char::from_u32(value).map_or(Member::Nothing, Member::Char),
                    j,
                )
            }
            'c' => match self.at(i + 2) {
                Some(l) if l.is_ascii_alphabetic() => (
                    char::from_u32(u32::from(l) % 32).map_or(Member::Nothing, Member::Char),
                    i + 3,
                ),
                _ => (Member::Char('\\'), i + 1),
            },
            'x' => match self.hex(i + 2, 2) {
                Some(v) => (
                    char::from_u32(v).map_or(Member::Nothing, Member::Char),
                    i + 4,
                ),
                None if self.unicode => return Err(PatternError::Invalid),
                None => (Member::Char('x'), i + 2),
            },
            'u' => self.unicode_escape(i)?,
            'p' | 'P' if self.unicode => {
                if self.at(i + 2) != Some('{') {
                    return Err(PatternError::Invalid);
                }
                let start = i + 3;
                let mut j = start;
                while self
                    .at(j)
                    .is_some_and(|c| c.is_ascii_alphanumeric() || c == '_' || c == '=')
                {
                    j += 1;
                }
                if j == start || self.at(j) != Some('}') {
                    return Err(PatternError::Invalid);
                }
                let name: String = self.chars[start..j].iter().collect();
                (Member::Set(format!("\\{c}{{{name}}}")), j + 1)
            }
            other => (Member::Char(other), i + 2),
        })
    }

    /// `\uXXXX`, a pair of them for a surrogate pair, or `\u{…}` with `u`.
    fn unicode_escape(&self, i: usize) -> Result<(Member, usize), PatternError> {
        if self.unicode && self.at(i + 2) == Some('{') {
            let start = i + 3;
            let mut j = start;
            while self.at(j).is_some_and(|c| c.is_ascii_hexdigit()) {
                j += 1;
            }
            if j == start || j - start > 6 || self.at(j) != Some('}') {
                return Err(PatternError::Invalid);
            }
            let hex: String = self.chars[start..j].iter().collect();
            let v = u32::from_str_radix(&hex, 16).map_err(|_| PatternError::Invalid)?;
            if v > 0x10_FFFF {
                return Err(PatternError::Invalid);
            }
            return Ok((
                char::from_u32(v).map_or(Member::Nothing, Member::Char),
                j + 1,
            ));
        }
        let Some(high) = self.hex(i + 2, 4) else {
            if self.unicode {
                return Err(PatternError::Invalid);
            }
            return Ok((Member::Char('u'), i + 2));
        };
        if (0xD800..0xDC00).contains(&high)
            && self.at(i + 6) == Some('\\')
            && self.at(i + 7) == Some('u')
            && let Some(low) = self.hex(i + 8, 4)
            && (0xDC00..0xE000).contains(&low)
        {
            let v = 0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00);
            return Ok((
                char::from_u32(v).map_or(Member::Nothing, Member::Char),
                i + 12,
            ));
        }
        Ok((
            char::from_u32(high).map_or(Member::Nothing, Member::Char),
            i + 6,
        ))
    }

    fn hex(&self, from: usize, len: usize) -> Option<u32> {
        let digits: String = self.chars.get(from..from + len)?.iter().collect();
        if digits.chars().all(|c| c.is_ascii_hexdigit()) {
            u32::from_str_radix(&digits, 16).ok()
        } else {
            None
        }
    }

    /// A bracketed class from the `[` at `i`.
    fn class(&mut self, i: usize) -> Result<usize, PatternError> {
        let mut j = i + 1;
        let negated = self.at(j) == Some('^');
        if negated {
            j += 1;
        }
        let mut members: Vec<Member> = Vec::new();
        loop {
            let Some(c) = self.at(j) else {
                return Err(PatternError::Invalid);
            };
            if c == ']' {
                j += 1;
                break;
            }
            let (first, next) = self.class_atom(j)?;
            // A range: two characters around a `-` that does not end the
            // class. A set on either side makes the `-` itself
            // (JavaScript's Annex B), or an error with `u`.
            if self.at(next) == Some('-') && self.at(next + 1).is_some_and(|c| c != ']') {
                let (second, after) = self.class_atom(next + 1)?;
                match (&first, &second) {
                    (Member::Char(a), Member::Char(b)) => {
                        if a > b {
                            return Err(PatternError::Invalid);
                        }
                        let mut range = String::new();
                        push_class_char(&mut range, *a);
                        range.push('-');
                        push_class_char(&mut range, *b);
                        members.push(Member::Set(range));
                    }
                    _ if self.unicode => return Err(PatternError::Invalid),
                    _ => {
                        members.push(first);
                        members.push(Member::Char('-'));
                        members.push(second);
                    }
                }
                j = after;
                continue;
            }
            members.push(first);
            j = next;
        }
        let mut body = String::new();
        for m in &members {
            match m {
                Member::Char(c) => push_class_char(&mut body, *c),
                Member::Set(s) => body.push_str(s),
                Member::Nothing => {}
            }
        }
        match (body.is_empty(), negated) {
            // `[]` matches nothing, `[^]` any character at all.
            (true, false) => self.out.push_str(NOTHING),
            (true, true) => self.out.push_str("(?s:.)"),
            (false, _) => {
                self.out.push('[');
                if negated {
                    self.out.push('^');
                }
                self.out.push_str(&body);
                self.out.push(']');
            }
        }
        Ok(j)
    }

    fn class_atom(&self, j: usize) -> Result<(Member, usize), PatternError> {
        match self.at(j) {
            Some('\\') => {
                if self.at(j + 1) == Some('B') {
                    return Ok((Member::Char('B'), j + 2));
                }
                self.escape_member(j)
            }
            Some(c) => Ok((Member::Char(c), j + 1)),
            None => Err(PatternError::Invalid),
        }
    }
}

/// A character outside a class, escaped where the target reads it as
/// syntax.
fn push_literal(out: &mut String, c: char) {
    if regex_syntax_meta(c) {
        out.push('\\');
    }
    out.push(c);
}

/// A character inside a class: `[`, `]`, `\`, `^`, `-`, `&` and `~`
/// escaped (the target nests classes and has set operators).
fn push_class_char(out: &mut String, c: char) {
    if matches!(c, '[' | ']' | '\\' | '^' | '-' | '&' | '~') {
        out.push('\\');
    } else if c == '\n' {
        out.push_str(r"\n");
        return;
    }
    out.push(c);
}

fn regex_syntax_meta(c: char) -> bool {
    matches!(
        c,
        '\\' | '.'
            | '+'
            | '*'
            | '?'
            | '('
            | ')'
            | '|'
            | '['
            | ']'
            | '{'
            | '}'
            | '^'
            | '$'
            | '#'
            | '&'
            | '-'
            | '~'
    )
}

/// The byte after the character at `at`: where a search goes on after an
/// empty match.
fn after_char(text: &str, at: usize) -> usize {
    text.get(at..)
        .and_then(|rest| rest.chars().next())
        .map_or(at + 1, |c| at + c.len_utf8())
}

impl Pattern {
    /// Charges a search from `at` to the end of `text`: what it may scan.
    fn search<'t>(
        &self,
        text: &'t str,
        at: usize,
        spend: &mut dyn FnMut(usize) -> bool,
    ) -> Result<Option<Captures<'t>>, Stop> {
        if !spend((text.len() - at).saturating_mul(self.weight)) {
            return Err(Stop::Budget);
        }
        Ok(self.re.captures_at(text, at))
    }

    /// `regexp.matches(text)`: whether it matches anywhere.
    pub(crate) fn matches(
        &self,
        text: &str,
        spend: &mut dyn FnMut(usize) -> bool,
    ) -> Result<bool, Stop> {
        if !spend(text.len().saturating_mul(self.weight)) {
            return Err(Stop::Budget);
        }
        Ok(self.re.is_match(text))
    }

    /// `text.replace(regexp, with)`: the first match, or every one with
    /// `g`, as JavaScript walks them; `max` bytes at most.
    pub(crate) fn replace(
        &self,
        text: &str,
        with: &str,
        max: usize,
        spend: &mut dyn FnMut(usize) -> bool,
    ) -> Result<String, Stop> {
        let mut out = String::new();
        let mut copied = 0;
        let mut at = 0;
        while at <= text.len() {
            let Some(caps) = self.search(text, at, spend)? else {
                break;
            };
            let Some(whole) = caps.get(0) else {
                break;
            };
            out.push_str(&text[copied..whole.start()]);
            self.expand(&mut out, &caps, text, with, max)?;
            copied = whole.end();
            if out.len() > max {
                return Err(Stop::TooLarge);
            }
            if !self.global {
                break;
            }
            at = if whole.is_empty() {
                after_char(text, whole.end())
            } else {
                whole.end()
            };
        }
        out.push_str(&text[copied..]);
        if out.len() > max {
            return Err(Stop::TooLarge);
        }
        Ok(out)
    }

    /// The replacement for one match, as MDN gives `$$`, `$&`, `` $` ``,
    /// `$'`, `$n`, `$nn` and `$<name>`.
    fn expand(
        &self,
        out: &mut String,
        caps: &Captures<'_>,
        text: &str,
        with: &str,
        max: usize,
    ) -> Result<(), Stop> {
        let Some(whole) = caps.get(0) else {
            return Ok(());
        };
        let group = |n: usize| caps.get(n).map_or("", |m| m.as_str());
        let b = with.as_bytes();
        let mut i = 0;
        while i < b.len() {
            let Some(dollar) = with[i..].find('$').map(|k| i + k) else {
                out.push_str(&with[i..]);
                break;
            };
            out.push_str(&with[i..dollar]);
            i = dollar;
            let digit = |k: usize| {
                b.get(k)
                    .filter(|c| c.is_ascii_digit())
                    .map(|c| usize::from(c - b'0'))
            };
            match b.get(i + 1) {
                Some(b'$') => {
                    out.push('$');
                    i += 2;
                }
                Some(b'&') => {
                    out.push_str(whole.as_str());
                    i += 2;
                }
                Some(b'`') => {
                    out.push_str(&text[..whole.start()]);
                    i += 2;
                }
                Some(b'\'') => {
                    out.push_str(&text[whole.end()..]);
                    i += 2;
                }
                Some(b'0'..=b'9') => {
                    let one = digit(i + 1).unwrap_or(0);
                    match digit(i + 2).map(|two| one * 10 + two) {
                        Some(nn) if (1..=self.groups).contains(&nn) => {
                            out.push_str(group(nn));
                            i += 3;
                        }
                        _ if (1..=self.groups).contains(&one) => {
                            out.push_str(group(one));
                            i += 2;
                        }
                        _ => {
                            out.push('$');
                            i += 1;
                        }
                    }
                }
                Some(b'<') if self.named => match with[i + 2..].find('>') {
                    Some(k) => {
                        let name = &with[i + 2..i + 2 + k];
                        out.push_str(caps.name(name).map_or("", |m| m.as_str()));
                        i += 2 + k + 1;
                    }
                    None => {
                        out.push_str("$<");
                        i += 2;
                    }
                },
                _ => {
                    out.push('$');
                    i += 1;
                }
            }
            if out.len() > max {
                return Err(Stop::TooLarge);
            }
        }
        Ok(())
    }

    /// `text.split(regexp, limit)`, JavaScript's: the pieces between the
    /// matches, each match's groups between them (`None` for a group that
    /// took part in no match), empty matches where JavaScript makes them;
    /// `items` pieces at most.
    pub(crate) fn split(
        &self,
        text: &str,
        limit: Option<usize>,
        items: usize,
        spend: &mut dyn FnMut(usize) -> bool,
    ) -> Result<Vec<Option<String>>, Stop> {
        let limit = limit.unwrap_or(usize::MAX);
        let mut out: Vec<Option<String>> = Vec::new();
        if limit == 0 {
            return Ok(out);
        }
        if text.is_empty() {
            if self.search(text, 0, spend)?.is_none() {
                out.push(Some(String::new()));
            }
            return Ok(out);
        }
        let push = |out: &mut Vec<Option<String>>, piece: Option<&str>| -> Result<bool, Stop> {
            if out.len() >= items {
                return Err(Stop::TooLarge);
            }
            out.push(piece.map(str::to_owned));
            Ok(out.len() >= limit)
        };
        let (mut p, mut q) = (0, 0);
        while q < text.len() {
            let Some(caps) = self.search(text, q, spend)? else {
                break;
            };
            let Some(m) = caps.get(0) else {
                break;
            };
            if m.start() >= text.len() {
                break;
            }
            if m.end() == p {
                q = after_char(text, m.start());
                continue;
            }
            if push(&mut out, Some(&text[p..m.start()]))? {
                return Ok(out);
            }
            for g in 1..=self.groups {
                if push(&mut out, caps.get(g).map(|c| c.as_str()))? {
                    return Ok(out);
                }
            }
            p = m.end();
            q = p;
        }
        push(&mut out, Some(&text[p..]))?;
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rust(pattern: &str, flags: &str) -> String {
        let f = super::flags(flags).unwrap_or(Flags {
            global: false,
            ignore_case: false,
            multiline: false,
            dot_all: false,
            unicode: false,
        });
        let mut t = Translation {
            chars: pattern.chars().collect(),
            out: String::new(),
            groups: 0,
            named: false,
            unicode: f.unicode,
            dot_all: f.dot_all,
        };
        t.run().unwrap();
        t.out
    }

    #[test]
    fn translations() {
        assert_eq!(rust(r"\d+", ""), "[0-9]+");
        assert_eq!(rust(r"[\d-]", ""), r"[0-9\-]");
        assert_eq!(rust(r"[a-c]", ""), "[a-c]");
        assert_eq!(rust(r"[&~]", ""), r"[\&\~]");
        assert_eq!(rust(r"a{", ""), r"a\{");
        assert_eq!(rust(r"a{2,3}", ""), "a{2,3}");
        assert_eq!(rust(r"(?<y>\d)", ""), "(?P<y>[0-9])");
        assert_eq!(rust(r"\/", ""), "/");
        assert_eq!(rust(r"\.", ""), r"\.");
        assert_eq!(rust(r"[\W]", ""), "[[^0-9A-Za-z_]]");
    }

    #[test]
    fn a_class_that_holds_nothing_compiles_and_never_matches() {
        let p = compile("a[]", "").unwrap();
        let mut spend = |_| true;
        assert!(!p.matches("a", &mut spend).unwrap());
        assert!(!p.matches("a]", &mut spend).unwrap());
    }

    #[test]
    fn errors() {
        assert_eq!(compile("a", "gg").unwrap_err(), PatternError::Invalid);
        assert_eq!(compile("(", "").unwrap_err(), PatternError::Invalid);
        assert_eq!(compile("[b-a]", "").unwrap_err(), PatternError::Invalid);
        assert_eq!(compile("a\\", "").unwrap_err(), PatternError::Invalid);
        assert_eq!(compile("*", "").unwrap_err(), PatternError::Invalid);
        assert_eq!(compile("(?x)", "").unwrap_err(), PatternError::Invalid);
    }

    #[test]
    fn a_spent_budget_stops_the_search() {
        let p = compile("a", "g").unwrap();
        let mut left = 3usize;
        let mut spend = |_| {
            left = left.saturating_sub(1);
            left > 0
        };
        assert_eq!(p.replace("aaaa", "b", 100, &mut spend), Err(Stop::Budget));
    }

    #[test]
    fn a_replacement_past_the_size_stops() {
        let p = compile("a", "g").unwrap();
        let mut spend = |_| true;
        assert_eq!(
            p.replace("aaaa", "bbbbbb", 10, &mut spend),
            Err(Stop::TooLarge)
        );
        assert_eq!(p.split("a,a,a", None, 2, &mut spend), Err(Stop::TooLarge));
    }
}

#[cfg(test)]
mod timing {
    use super::*;

    /// A measure, not a check: run with
    /// `cargo test --release -p verso-core --lib pattern::timing -- --ignored --nocapture`.
    #[test]
    #[ignore = "a measure"]
    fn hostile_patterns_over_a_megabyte() {
        let text = "a".repeat(1 << 20) + "!";
        let mixed: String = (0..(1 << 20) / 8)
            .map(|i| ["abcdefg ", "xyz12 q\n"][i % 2])
            .collect();
        let blowup: String = (0..(1 << 20) / 12)
            .map(|i| ["abababababa!", "bbabaabbaab!"][i % 2])
            .collect();
        let long_alt = (0..120)
            .map(|i| format!("w{i}x"))
            .collect::<Vec<_>>()
            .join("|");
        for (pattern, flags, hay) in [
            (r"(a+)+$", "", &text),
            (r"^(a|a?)+$", "", &text),
            (r"(.*a){12}$", "", &text),
            (r"(x+x+)+y", "", &text),
            (r"(\w+\s?)*$", "", &mixed),
            (r"[a-z]*X|a", "g", &text),
            (r"\p{L}{10}Z", "u", &mixed),
            (&long_alt, "i", &mixed),
            (r"[ab]*a[ab]{15}[c-z0-9]", "", &blowup),
            (r"(?:a|b)*a(?:a|b){20}(?:[c-z]|[0-9])", "i", &blowup),
            (r"(\w*a\w{12}\W)+", "", &blowup),
        ] {
            let p = compile(pattern, flags).expect(pattern);
            let mut charged = 0usize;
            let started = std::time::Instant::now();
            let mut spend = |b: usize| {
                charged += b / 16 + 1;
                charged < 50_000_000
            };
            let r = if p.global {
                p.replace(hay, "", 1 << 21, &mut spend)
                    .map(|s| s.len().to_string())
            } else {
                p.matches(hay, &mut spend).map(|b| b.to_string())
            };
            println!(
                "{pattern:>30}/{flags}: {:?} in {:?}, weight {}, charged {charged} steps",
                r,
                started.elapsed(),
                p.weight
            );
        }
    }
}
