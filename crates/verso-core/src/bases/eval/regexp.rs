// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A regular expression meeting a method (ADR 0094 item 1): `matches`,
//! `replace` and `split`, each pattern compiled once per query, every
//! search charged to the query's budget by the length of text it may scan
//! (item 3).

use std::rc::Rc;

use super::super::pattern::{self, Pattern, PatternError, Stop};
use super::super::value::{V, err};
use super::super::{EvalError, EvalErrorKind};
use super::{BYTES_PER_STEP, Env, Locals, MAX_LIST, MAX_TEXT, R};

/// Distinct patterns one query may compile: each holds a program and a
/// cache of up to a megabyte (`pattern::SIZE_LIMIT`, `DFA_SIZE_LIMIT`).
const MAX_PATTERNS: usize = 64;

/// Steps a compilation costs per byte of pattern: the work of building
/// the program, charged once.
const COMPILE_STEPS_PER_BYTE: usize = 64;

/// The literal as the base wrote it, cut to what a sentence can hold.
fn literal(p: &str, f: &str) -> String {
    let whole = format!("/{p}/{f}");
    if whole.chars().count() <= 60 {
        whole
    } else {
        let cut: String = whole.chars().take(59).collect();
        format!("{cut}…")
    }
}

impl Env<'_> {
    /// The pattern `/p/f`, compiled at its first use in this query.
    fn pattern(&self, p: &str, f: &str) -> Result<Rc<Pattern>, EvalError> {
        let key = (p.to_owned(), f.to_owned());
        if let Some(done) = self.patterns.borrow().get(&key) {
            return done.clone();
        }
        let made = if self.patterns.borrow().len() >= MAX_PATTERNS {
            Err(err(EvalErrorKind::RegexTooLarge, literal(p, f)))
        } else {
            self.charge(p.len().saturating_mul(COMPILE_STEPS_PER_BYTE))?;
            pattern::compile(p, f).map(Rc::new).map_err(|e| match e {
                PatternError::TooLarge => err(EvalErrorKind::RegexTooLarge, literal(p, f)),
                PatternError::Unsupported(what) => err(EvalErrorKind::RegexUnsupported, what),
                PatternError::Invalid => err(EvalErrorKind::RegexInvalid, literal(p, f)),
            })
        };
        self.patterns.borrow_mut().insert(key, made.clone());
        made
    }

    /// What a search spends: a step per [`BYTES_PER_STEP`] bytes it may
    /// scan, and one more.
    fn spender(&self) -> impl FnMut(usize) -> bool + '_ {
        |bytes| self.charge(bytes / BYTES_PER_STEP + 1).is_ok()
    }

    fn stopped(&self, stop: Stop, name: &str) -> EvalError {
        match stop {
            Stop::Budget => err(EvalErrorKind::Budget, ""),
            Stop::TooLarge => err(EvalErrorKind::TooLarge, name),
        }
    }

    /// A method of a regular expression: `matches` only, as "Functions"
    /// lists it.
    pub(super) fn regex_method(
        &self,
        p: &str,
        f: &str,
        name: &str,
        args: &[verso_dialect::bases::Expr],
        row: usize,
        locals: &Locals,
    ) -> R {
        if name != "matches" {
            return Err(err(EvalErrorKind::UnknownMethod, name));
        }
        let re = self.pattern(p, f)?;
        let text = self.arg(args, 0, row, locals)?.text(self.lang);
        re.matches(&text, &mut self.spender())
            .map(V::Bool)
            .map_err(|s| self.stopped(s, name))
    }

    /// `s.replace(/p/f, with)`.
    pub(super) fn regex_replace(&self, s: &str, p: &str, f: &str, with: &str) -> R {
        let re = self.pattern(p, f)?;
        re.replace(s, with, MAX_TEXT, &mut self.spender())
            .map(V::Str)
            .map_err(|stop| self.stopped(stop, "replace"))
    }

    /// `s.split(/p/f, limit)`.
    pub(super) fn regex_split(&self, s: &str, p: &str, f: &str, limit: Option<usize>) -> R {
        let re = self.pattern(p, f)?;
        let parts = re
            .split(s, limit, MAX_LIST, &mut self.spender())
            .map_err(|stop| self.stopped(stop, "split"))?;
        Ok(V::List(
            parts
                .into_iter()
                .map(|piece| piece.map_or(V::Null, V::Str))
                .collect(),
        ))
    }
}
