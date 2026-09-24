// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Evaluating an expression for one file of the folder: names, members,
//! the functions and methods of "Functions" (`obsidian.md/help/bases/functions`),
//! the operators of "Bases syntax". What a base asks for and this module
//! does not do — regular expressions, above all — is an error the cell
//! shows, never a result made up.
//!
//! Every step of an evaluation is counted against the query's budget, and
//! a text grows to [`MAX_TEXT`] at most: a base comes from a file of the
//! folder, which anyone may have written.

use std::cell::{Cell as StdCell, RefCell};
use std::collections::HashMap;

use verso_dialect::Value;
use verso_dialect::bases::{BinaryOp, Expr, ExprError, UnaryOp};

use super::time::{self, Duration, MS_PER_DAY};
use super::value::{self, V, as_wikilink, compare, err, parse_number};
use super::{EvalError, EvalErrorKind, Facts};

/// The longest text an expression may build.
pub(crate) const MAX_TEXT: usize = 1 << 20;

type R = Result<V, EvalError>;

/// What evaluation runs in: the folder's facts, the base's formulas, the
/// file `this` names, the clock, and the budget.
pub(crate) struct Env<'a> {
    pub facts: &'a Facts<'a>,
    pub formulas: &'a [(String, Result<Expr, ExprError>)],
    pub this: Option<&'a str>,
    pub lang: &'a str,
    pub offset: i32,
    pub now: i64,
    budget: StdCell<u64>,
    rng: StdCell<u64>,
    /// Formula values per file and formula, once computed.
    memo: RefCell<HashMap<(usize, usize), R>>,
    /// Formulas being computed, to refuse one that needs itself.
    active: RefCell<Vec<(usize, usize)>>,
    /// Whether the budget ran out: every later step fails at once.
    pub exhausted: StdCell<bool>,
}

/// Names bound by a list method's argument (`value`, `index`, `acc`) or a
/// summary (`values`).
pub(crate) type Locals = Vec<(&'static str, V)>;

impl<'a> Env<'a> {
    pub(crate) fn new(
        facts: &'a Facts<'a>,
        formulas: &'a [(String, Result<Expr, ExprError>)],
        this: Option<&'a str>,
        lang: &'a str,
        offset: i32,
        now: i64,
        budget: u64,
    ) -> Self {
        Self {
            facts,
            formulas,
            this,
            lang,
            offset,
            now,
            budget: StdCell::new(budget),
            // Any seed will do: `random()` is not a secret, only a shuffle.
            rng: StdCell::new(0x9E37_79B9_7F4A_7C15 ^ (now as u64)),
            memo: RefCell::new(HashMap::new()),
            active: RefCell::new(Vec::new()),
            exhausted: StdCell::new(false),
        }
    }

    fn step(&self) -> Result<(), EvalError> {
        let left = self.budget.get();
        if left == 0 {
            self.exhausted.set(true);
            return Err(err(EvalErrorKind::Budget, ""));
        }
        self.budget.set(left - 1);
        Ok(())
    }

    fn random(&self) -> f64 {
        // xorshift64*
        let mut x = self.rng.get();
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.rng.set(x);
        (x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 11) as f64 / (1u64 << 53) as f64
    }

    fn path(&self, row: usize) -> &str {
        self.facts.files.get(row).map_or("", |f| f.path.as_str())
    }

    /// A property id as `order`, `sort` and `groupBy` write it: `file.x`,
    /// `formula.x`, `note.x`, or a bare note property.
    pub(crate) fn property(&self, id: &str, row: usize) -> R {
        if let Some(field) = id.strip_prefix("file.") {
            let path = self.path(row).to_owned();
            return self.file_field(&path, field);
        }
        if let Some(name) = id.strip_prefix("formula.") {
            return self.formula(row, name);
        }
        let name = id.strip_prefix("note.").unwrap_or(id);
        Ok(self.note_property(self.path(row), name))
    }

    /// The value of the formula `name` for the file `row`.
    pub(crate) fn formula(&self, row: usize, name: &str) -> R {
        let Some(k) = self.formulas.iter().position(|(n, _)| n == name) else {
            return Ok(V::Null);
        };
        if let Some(done) = self.memo.borrow().get(&(row, k)) {
            return done.clone();
        }
        if self.active.borrow().contains(&(row, k)) {
            return Err(err(EvalErrorKind::Cycle, name));
        }
        let result = match &self.formulas[k].1 {
            Ok(expr) => {
                self.active.borrow_mut().push((row, k));
                let r = self.eval(expr, row, &Vec::new());
                self.active.borrow_mut().pop();
                r
            }
            Err(e) => Err(err(EvalErrorKind::Syntax, e.to_string())),
        };
        self.memo.borrow_mut().insert((row, k), result.clone());
        result
    }

    /// A note property of the file at `path`: the key as written first,
    /// then ignoring case, as Obsidian names a property the same whatever
    /// its case in one note or another.
    pub(crate) fn note_property(&self, path: &str, name: &str) -> V {
        let Some(props) = self.facts.props(path) else {
            return V::Null;
        };
        let found = props.iter().find(|(k, _)| k == name).or_else(|| {
            props
                .iter()
                .find(|(k, _)| k.to_lowercase() == name.to_lowercase())
        });
        found.map_or(V::Null, |(_, v)| self.yaml_value(v, path))
    }

    /// A frontmatter value as the language sees it: a text that is one
    /// wikilink is a link, a text that is a date is a date.
    pub(crate) fn yaml_value(&self, v: &Value, path: &str) -> V {
        match v {
            Value::Null => V::Null,
            Value::Bool(b) => V::Bool(*b),
            Value::Integer(i) => V::Num(*i as f64),
            Value::Float(f) => V::Num(*f),
            Value::String(s) => {
                if let Some((target, display)) = as_wikilink(s) {
                    V::Link {
                        target,
                        display,
                        from: path.to_owned(),
                    }
                } else if let Some((ms, with_time)) = time::parse_date(s, self.offset) {
                    V::Date(ms, with_time)
                } else {
                    V::Str(s.clone())
                }
            }
            Value::Sequence(items) => {
                V::List(items.iter().map(|i| self.yaml_value(i, path)).collect())
            }
            Value::Mapping(entries) => V::Obj(
                entries
                    .iter()
                    .map(|(k, v)| (k.clone(), self.yaml_value(v, path)))
                    .collect(),
            ),
        }
    }

    /// A field of a file, as "Functions" lists them; any other name is a
    /// note property of that file, so that `this.status` reads the note
    /// the base is embedded in.
    pub(crate) fn file_field(&self, path: &str, field: &str) -> R {
        let facts = self.facts.file(path);
        let name = path.rsplit('/').next().unwrap_or(path);
        Ok(match field {
            "name" => V::Str(name.to_owned()),
            "basename" => V::Str(match name.rsplit_once('.') {
                Some((stem, _)) if !stem.is_empty() => stem.to_owned(),
                _ => name.to_owned(),
            }),
            "path" => V::Str(path.to_owned()),
            "folder" => V::Str(match path.rsplit_once('/') {
                Some((dir, _)) => dir.to_owned(),
                None => "/".to_owned(),
            }),
            "ext" => V::Str(match name.rsplit_once('.') {
                Some((stem, ext)) if !stem.is_empty() => ext.to_owned(),
                _ => String::new(),
            }),
            "size" => facts.map_or(V::Null, |f| V::Num(f.size as f64)),
            "ctime" => facts
                .and_then(|f| f.ctime)
                .map_or(V::Null, |t| V::Date(t, true)),
            "mtime" => facts
                .and_then(|f| f.mtime)
                .map_or(V::Null, |t| V::Date(t, true)),
            "properties" => match self.facts.props(path) {
                Some(props) => V::Obj(
                    props
                        .iter()
                        .map(|(k, v)| (k.clone(), self.yaml_value(v, path)))
                        .collect(),
                ),
                None => V::Obj(Vec::new()),
            },
            "tags" => V::List(
                self.facts
                    .tags(path)
                    .iter()
                    .map(|t| V::Str(format!("#{t}")))
                    .collect(),
            ),
            "links" => V::List(
                self.facts
                    .links_of(path, false)
                    .into_iter()
                    .map(|(target, display)| V::Link {
                        target,
                        display,
                        from: path.to_owned(),
                    })
                    .collect(),
            ),
            "embeds" => V::List(
                self.facts
                    .links_of(path, true)
                    .into_iter()
                    .map(|(target, display)| V::Link {
                        target,
                        display,
                        from: path.to_owned(),
                    })
                    .collect(),
            ),
            "backlinks" => V::List(
                self.facts
                    .backlinks(path)
                    .into_iter()
                    .map(|from| V::Link {
                        target: from.clone(),
                        display: None,
                        from,
                    })
                    .collect(),
            ),
            "file" => V::File(path.to_owned()),
            other => self.note_property(path, other),
        })
    }

    /// Where a link, a file or a text names a file: the path, if any file
    /// of the folder answers.
    fn path_of(&self, v: &V, row: usize) -> Option<String> {
        match v {
            V::File(p) => Some(p.clone()),
            V::Link { target, from, .. } => self.facts.resolve(from, target),
            V::Str(s) => {
                if self.facts.file(s).is_some() {
                    Some(s.clone())
                } else {
                    self.facts.resolve(self.path(row), &value::link_target(s))
                }
            }
            _ => None,
        }
    }

    fn ident(&self, name: &str, row: usize, locals: &Locals) -> R {
        if let Some((_, v)) = locals.iter().rev().find(|(n, _)| *n == name) {
            return Ok(v.clone());
        }
        match name {
            "file" => Ok(V::File(self.path(row).to_owned())),
            "this" => Ok(self.this.map_or(V::Null, |t| V::File(t.to_owned()))),
            "note" => self.file_field(self.path(row), "properties"),
            "formula" => {
                let mut out = Vec::new();
                for (n, _) in self.formulas {
                    out.push((n.clone(), self.formula(row, n)?));
                }
                Ok(V::Obj(out))
            }
            _ => Ok(self.note_property(self.path(row), name)),
        }
    }

    pub(crate) fn eval(&self, e: &Expr, row: usize, locals: &Locals) -> R {
        self.step()?;
        match e {
            Expr::Null => Ok(V::Null),
            Expr::Bool(b) => Ok(V::Bool(*b)),
            Expr::Number(n) => Ok(V::Num(*n)),
            Expr::Str(s) => Ok(V::Str(s.clone())),
            Expr::Regex { pattern, flags } => Ok(V::Regex(pattern.clone(), flags.clone())),
            Expr::List(items) => Ok(V::List(
                items
                    .iter()
                    .map(|i| self.eval(i, row, locals))
                    .collect::<Result<_, _>>()?,
            )),
            Expr::Object(entries) => Ok(V::Obj(
                entries
                    .iter()
                    .map(|(k, v)| Ok((k.clone(), self.eval(v, row, locals)?)))
                    .collect::<Result<_, EvalError>>()?,
            )),
            Expr::Ident(name) => self.ident(name, row, locals),
            Expr::Member(target, name) => {
                if let Some(v) = self.namespaced(target, name, row, locals) {
                    return v;
                }
                let t = self.eval(target, row, locals)?;
                self.member(&t, name)
            }
            Expr::Index(target, key) => {
                let k = self.eval(key, row, locals)?;
                if let V::Str(name) = &k
                    && let Some(v) = self.namespaced(target, name, row, locals)
                {
                    return v;
                }
                let t = self.eval(target, row, locals)?;
                Ok(match (&t, &k) {
                    (V::List(items), V::Num(n)) => index_of(items.len(), *n)
                        .and_then(|i| items.get(i).cloned())
                        .unwrap_or(V::Null),
                    (V::Str(s), V::Num(n)) => index_of(s.chars().count(), *n)
                        .and_then(|i| s.chars().nth(i))
                        .map_or(V::Null, |c| V::Str(c.to_string())),
                    (_, V::Str(name)) => self.member(&t, name)?,
                    _ => V::Null,
                })
            }
            Expr::Call(callee, args) => match &**callee {
                Expr::Ident(name) if !locals.iter().any(|(n, _)| n == name) => {
                    self.global(name, args, row, locals)
                }
                Expr::Member(target, method) => {
                    let t = self.eval(target, row, locals)?;
                    self.method(&t, method, args, row, locals)
                }
                _ => Err(err(EvalErrorKind::Type, "()")),
            },
            Expr::Unary(op, x) => {
                let v = self.eval(x, row, locals)?;
                match op {
                    UnaryOp::Not => Ok(V::Bool(!v.truthy())),
                    UnaryOp::Neg => match v {
                        V::Num(n) => Ok(V::Num(-n)),
                        V::Dur(d) => Ok(V::Dur(Duration {
                            months: -d.months,
                            ms: -d.ms,
                        })),
                        V::Null => Ok(V::Null),
                        other => Ok(V::Num(-to_number(&other).unwrap_or(f64::NAN))),
                    },
                }
            }
            Expr::Binary(BinaryOp::And, a, b) => {
                let l = self.eval(a, row, locals)?;
                if l.truthy() {
                    self.eval(b, row, locals)
                } else {
                    Ok(l)
                }
            }
            Expr::Binary(BinaryOp::Or, a, b) => {
                let l = self.eval(a, row, locals)?;
                if l.truthy() {
                    Ok(l)
                } else {
                    self.eval(b, row, locals)
                }
            }
            Expr::Binary(op, a, b) => {
                let l = self.eval(a, row, locals)?;
                let r = self.eval(b, row, locals)?;
                self.binary(*op, l, r)
            }
        }
    }

    /// `note.x`, `formula.x` and `file.x` read directly, without building
    /// the whole object first; `None` for anything else.
    fn namespaced(&self, target: &Expr, name: &str, row: usize, locals: &Locals) -> Option<R> {
        let Expr::Ident(ns) = target else {
            return None;
        };
        if locals.iter().any(|(n, _)| n == ns) {
            return None;
        }
        match ns.as_str() {
            "note" => Some(Ok(self.note_property(self.path(row), name))),
            "formula" => Some(self.formula(row, name)),
            "file" => Some(self.file_field(self.path(row), name)),
            _ => None,
        }
    }

    /// A field of a value: `length` of a text or a list, the parts of a
    /// date, an object's key, a file's field.
    fn member(&self, t: &V, name: &str) -> R {
        Ok(match (t, name) {
            (V::Str(s), "length") => V::Num(s.chars().count() as f64),
            (V::List(l), "length") => V::Num(l.len() as f64),
            (V::Date(ms, _), field) => {
                let p = time::parts(*ms);
                match field {
                    "year" => V::Num(p.year as f64),
                    "month" => V::Num(f64::from(p.month)),
                    "day" => V::Num(f64::from(p.day)),
                    "hour" => V::Num(f64::from(p.hour)),
                    "minute" => V::Num(f64::from(p.minute)),
                    "second" => V::Num(f64::from(p.second)),
                    "millisecond" => V::Num(f64::from(p.millisecond)),
                    _ => V::Null,
                }
            }
            (V::Obj(entries), key) => entries
                .iter()
                .find(|(k, _)| k == key)
                .map_or(V::Null, |(_, v)| v.clone()),
            (V::File(path), field) => self.file_field(path, field)?,
            _ => V::Null,
        })
    }

    fn arg(&self, args: &[Expr], i: usize, row: usize, locals: &Locals) -> R {
        match args.get(i) {
            Some(e) => self.eval(e, row, locals),
            None => Ok(V::Null),
        }
    }

    fn all_args(&self, args: &[Expr], row: usize, locals: &Locals) -> Result<Vec<V>, EvalError> {
        args.iter().map(|a| self.eval(a, row, locals)).collect()
    }

    fn global(&self, name: &str, args: &[Expr], row: usize, locals: &Locals) -> R {
        match name {
            "if" => {
                let c = self.arg(args, 0, row, locals)?;
                if c.truthy() {
                    self.arg(args, 1, row, locals)
                } else {
                    self.arg(args, 2, row, locals)
                }
            }
            "date" => match self.arg(args, 0, row, locals)? {
                v @ V::Date(..) => Ok(v),
                V::Str(s) => time::parse_date(&s, self.offset)
                    .map(|(ms, t)| V::Date(ms, t))
                    .ok_or_else(|| err(EvalErrorKind::Arguments, "date")),
                V::Null => Ok(V::Null),
                _ => Err(err(EvalErrorKind::Arguments, "date")),
            },
            "duration" => match self.arg(args, 0, row, locals)? {
                V::Str(s) => time::parse_duration(&s)
                    .map(V::Dur)
                    .ok_or_else(|| err(EvalErrorKind::Arguments, "duration")),
                v @ V::Dur(_) => Ok(v),
                _ => Err(err(EvalErrorKind::Arguments, "duration")),
            },
            "file" => {
                let v = self.arg(args, 0, row, locals)?;
                Ok(self.path_of(&v, row).map_or(V::Null, V::File))
            }
            "link" => {
                let v = self.arg(args, 0, row, locals)?;
                let display = match self.arg(args, 1, row, locals)? {
                    V::Null => None,
                    d => Some(d.text(self.lang)),
                };
                let target = match &v {
                    V::File(p) => p.clone(),
                    V::Link { target, .. } => target.clone(),
                    V::Str(s) => value::link_target(s),
                    other => other.text(self.lang),
                };
                Ok(V::Link {
                    target,
                    display,
                    from: self.path(row).to_owned(),
                })
            }
            "image" => {
                let v = self.arg(args, 0, row, locals)?;
                Ok(match &v {
                    V::Null => V::Null,
                    V::Str(s) if s.starts_with("http://") || s.starts_with("https://") => {
                        V::Image(s.clone())
                    }
                    other => self
                        .path_of(other, row)
                        .map_or_else(|| V::Image(other.text(self.lang)), V::Image),
                })
            }
            "icon" => Ok(V::Icon(self.arg(args, 0, row, locals)?.text(self.lang))),
            "html" => Ok(V::Html(self.arg(args, 0, row, locals)?.text(self.lang))),
            "escapeHTML" => Ok(V::Str(escape_html(
                &self.arg(args, 0, row, locals)?.text(self.lang),
            ))),
            "list" => Ok(match self.arg(args, 0, row, locals)? {
                l @ V::List(_) => l,
                V::Null => V::List(Vec::new()),
                other => V::List(vec![other]),
            }),
            "max" | "min" => {
                let nums: Vec<f64> = self
                    .all_args(args, row, locals)?
                    .iter()
                    .flat_map(|v| match v {
                        V::List(items) => items.iter().filter_map(to_number).collect(),
                        other => to_number(other).into_iter().collect::<Vec<_>>(),
                    })
                    .collect();
                if nums.is_empty() {
                    return Ok(V::Null);
                }
                let pick = if name == "max" { f64::max } else { f64::min };
                Ok(V::Num(nums.into_iter().fold(
                    if name == "max" {
                        f64::NEG_INFINITY
                    } else {
                        f64::INFINITY
                    },
                    pick,
                )))
            }
            "now" => Ok(V::Date(self.now, true)),
            "today" => Ok(V::Date(self.now.div_euclid(MS_PER_DAY) * MS_PER_DAY, false)),
            "number" => {
                let v = self.arg(args, 0, row, locals)?;
                match &v {
                    V::Date(ms, _) => Ok(V::Num((ms - i64::from(self.offset) * 60_000) as f64)),
                    V::Str(s) => parse_number(s)
                        .map(V::Num)
                        .ok_or_else(|| err(EvalErrorKind::Arguments, "number")),
                    other => to_number(other)
                        .map(V::Num)
                        .ok_or_else(|| err(EvalErrorKind::Arguments, "number")),
                }
            }
            "random" => Ok(V::Num(self.random())),
            _ => Err(err(EvalErrorKind::UnknownFunction, name)),
        }
    }

    fn method(&self, t: &V, name: &str, args: &[Expr], row: usize, locals: &Locals) -> R {
        // Any value.
        match name {
            "isTruthy" => return Ok(V::Bool(t.truthy())),
            "isType" => {
                let wanted = self
                    .arg(args, 0, row, locals)?
                    .text(self.lang)
                    .to_lowercase();
                return Ok(V::Bool(
                    t.type_name() == wanted || (wanted == "bool" && t.type_name() == "boolean"),
                ));
            }
            "toString" => return Ok(V::Str(t.text(self.lang))),
            "isEmpty" => return Ok(V::Bool(t.is_empty())),
            _ => {}
        }
        match t {
            // A method on nothing is nothing: a note without the property
            // is not an error, it is a row the condition does not hold for.
            V::Null => Ok(V::Null),
            V::Str(s) => self.string_method(s, name, args, row, locals),
            V::Num(n) => self.number_method(*n, name, args, row, locals),
            V::List(items) => self.list_method(items, name, args, row, locals),
            V::Date(ms, with_time) => match name {
                "date" => Ok(V::Date(ms.div_euclid(MS_PER_DAY) * MS_PER_DAY, false)),
                "format" => {
                    let f = self.arg(args, 0, row, locals)?.text(self.lang);
                    Ok(V::Str(time::format(*ms, &f, self.lang)))
                }
                "time" => Ok(V::Str(time::format(*ms, "HH:mm:ss", self.lang))),
                "relative" => Ok(V::Str(time::relative(*ms, self.now, self.lang))),
                _ => {
                    let _ = with_time;
                    Err(err(EvalErrorKind::UnknownMethod, name))
                }
            },
            V::Obj(entries) => match name {
                "keys" => Ok(V::List(
                    entries.iter().map(|(k, _)| V::Str(k.clone())).collect(),
                )),
                "values" => Ok(V::List(entries.iter().map(|(_, v)| v.clone()).collect())),
                _ => Err(err(EvalErrorKind::UnknownMethod, name)),
            },
            V::Link { target, from, .. } => match name {
                "asFile" => Ok(self.facts.resolve(from, target).map_or(V::Null, V::File)),
                "linksTo" => {
                    let other = self.arg(args, 0, row, locals)?;
                    let Some(source) = self.facts.resolve(from, target) else {
                        return Ok(V::Bool(false));
                    };
                    Ok(V::Bool(self.has_link(&source, &other, row)))
                }
                _ => Err(err(EvalErrorKind::UnknownMethod, name)),
            },
            V::File(path) => self.file_method(path, name, args, row, locals),
            V::Regex(..) => Err(err(EvalErrorKind::Regex, name)),
            _ => Err(err(EvalErrorKind::UnknownMethod, name)),
        }
    }

    fn has_link(&self, source: &str, other: &V, row: usize) -> bool {
        let Some(wanted) = self.path_of(other, row) else {
            return false;
        };
        self.facts
            .resolved_links(source)
            .iter()
            .any(|p| p == &wanted)
    }

    fn file_method(&self, path: &str, name: &str, args: &[Expr], row: usize, locals: &Locals) -> R {
        match name {
            "asLink" => {
                let display = match self.arg(args, 0, row, locals)? {
                    V::Null => None,
                    d => Some(d.text(self.lang)),
                };
                Ok(V::Link {
                    target: path.to_owned(),
                    display,
                    from: path.to_owned(),
                })
            }
            "hasLink" => {
                let other = self.arg(args, 0, row, locals)?;
                Ok(V::Bool(self.has_link(path, &other, row)))
            }
            "hasProperty" => {
                let key = self.arg(args, 0, row, locals)?.text(self.lang);
                Ok(V::Bool(self.facts.props(path).is_some_and(|p| {
                    p.iter()
                        .any(|(k, _)| k == &key || k.to_lowercase() == key.to_lowercase())
                })))
            }
            "hasTag" => {
                let wanted: Vec<String> = self
                    .all_args(args, row, locals)?
                    .iter()
                    .flat_map(|v| match v {
                        V::List(items) => items.iter().map(|i| i.text(self.lang)).collect(),
                        other => vec![other.text(self.lang)],
                    })
                    .map(|t| t.trim_start_matches('#').to_lowercase())
                    .filter(|t| !t.is_empty())
                    .collect();
                let tags = self.facts.tags(path);
                Ok(V::Bool(tags.iter().any(|t| {
                    let t = t.to_lowercase();
                    wanted
                        .iter()
                        .any(|w| t == *w || t.starts_with(&format!("{w}/")))
                })))
            }
            "inFolder" => {
                let folder = self.arg(args, 0, row, locals)?.text(self.lang);
                let folder = folder.trim_matches('/');
                Ok(V::Bool(
                    folder.is_empty() || path.starts_with(&format!("{folder}/")),
                ))
            }
            _ => Err(err(EvalErrorKind::UnknownMethod, name)),
        }
    }

    fn string_method(&self, s: &str, name: &str, args: &[Expr], row: usize, locals: &Locals) -> R {
        let text_args = |me: &Self| -> Result<Vec<String>, EvalError> {
            Ok(me
                .all_args(args, row, locals)?
                .iter()
                .map(|v| v.text(me.lang))
                .collect())
        };
        match name {
            "contains" => Ok(V::Bool(
                s.contains(&self.arg(args, 0, row, locals)?.text(self.lang)),
            )),
            "containsAll" => Ok(V::Bool(
                text_args(self)?.iter().all(|a| s.contains(a.as_str())),
            )),
            "containsAny" => Ok(V::Bool(
                text_args(self)?.iter().any(|a| s.contains(a.as_str())),
            )),
            "startsWith" => Ok(V::Bool(
                s.starts_with(&self.arg(args, 0, row, locals)?.text(self.lang)),
            )),
            "endsWith" => Ok(V::Bool(
                s.ends_with(&self.arg(args, 0, row, locals)?.text(self.lang)),
            )),
            "lower" => Ok(V::Str(s.to_lowercase())),
            "upper" => Ok(V::Str(s.to_uppercase())),
            "trim" => Ok(V::Str(s.trim().to_owned())),
            "reverse" => Ok(V::Str(s.chars().rev().collect())),
            "title" => Ok(V::Str(
                s.split(' ')
                    .map(|w| {
                        let mut c = w.chars();
                        c.next()
                            .map(|f| f.to_uppercase().chain(c).collect::<String>())
                            .unwrap_or_default()
                    })
                    .collect::<Vec<_>>()
                    .join(" "),
            )),
            "repeat" => {
                let n = to_number(&self.arg(args, 0, row, locals)?).unwrap_or(0.0);
                if !(0.0..=1e7).contains(&n) || s.len().saturating_mul(n as usize) > MAX_TEXT {
                    return Err(err(EvalErrorKind::TooLarge, "repeat"));
                }
                Ok(V::Str(s.repeat(n as usize)))
            }
            "slice" => {
                let chars: Vec<char> = s.chars().collect();
                let (a, b) = self.slice_bounds(chars.len(), args, row, locals)?;
                Ok(V::Str(chars[a..b].iter().collect()))
            }
            "replace" => match self.arg(args, 0, row, locals)? {
                V::Regex(..) => Err(err(EvalErrorKind::Regex, "replace")),
                pattern => {
                    let pattern = pattern.text(self.lang);
                    let with = self.arg(args, 1, row, locals)?.text(self.lang);
                    if pattern.is_empty() {
                        return Ok(V::Str(s.to_owned()));
                    }
                    let out = s.replace(&pattern, &with);
                    if out.len() > MAX_TEXT {
                        return Err(err(EvalErrorKind::TooLarge, "replace"));
                    }
                    Ok(V::Str(out))
                }
            },
            "split" => match self.arg(args, 0, row, locals)? {
                V::Regex(..) => Err(err(EvalErrorKind::Regex, "split")),
                sep => {
                    let sep = sep.text(self.lang);
                    let mut parts: Vec<V> = if sep.is_empty() {
                        s.chars().map(|c| V::Str(c.to_string())).collect()
                    } else {
                        s.split(sep.as_str())
                            .map(|p| V::Str(p.to_owned()))
                            .collect()
                    };
                    // An absent limit is no limit: `to_number` reads
                    // `null` as 0, which would empty the list.
                    match self.arg(args, 1, row, locals)? {
                        V::Null => {}
                        limit => {
                            if let Some(n) = to_number(&limit) {
                                parts.truncate(n.max(0.0) as usize);
                            }
                        }
                    }
                    Ok(V::List(parts))
                }
            },
            _ => Err(err(EvalErrorKind::UnknownMethod, name)),
        }
    }

    fn number_method(&self, n: f64, name: &str, args: &[Expr], row: usize, locals: &Locals) -> R {
        match name {
            "abs" => Ok(V::Num(n.abs())),
            "ceil" => Ok(V::Num(n.ceil())),
            "floor" => Ok(V::Num(n.floor())),
            "round" => {
                let digits = to_number(&self.arg(args, 0, row, locals)?)
                    .unwrap_or(0.0)
                    .clamp(0.0, 15.0);
                let f = 10f64.powi(digits as i32);
                Ok(V::Num((n * f).round() / f))
            }
            "toFixed" => {
                let digits = to_number(&self.arg(args, 0, row, locals)?)
                    .unwrap_or(0.0)
                    .clamp(0.0, 100.0);
                Ok(V::Str(format!("{:.*}", digits as usize, n)))
            }
            _ => Err(err(EvalErrorKind::UnknownMethod, name)),
        }
    }

    /// `slice(start, end?)`, JavaScript's: negative indices count from the
    /// end, both clamped.
    fn slice_bounds(
        &self,
        len: usize,
        args: &[Expr],
        row: usize,
        locals: &Locals,
    ) -> Result<(usize, usize), EvalError> {
        let at = |v: V, default: usize| -> usize {
            if matches!(v, V::Null) {
                return default;
            }
            match to_number(&v) {
                None => default,
                Some(n) if n < 0.0 => len.saturating_sub((-n) as usize),
                Some(n) => (n as usize).min(len),
            }
        };
        let a = at(self.arg(args, 0, row, locals)?, 0);
        let b = at(self.arg(args, 1, row, locals)?, len);
        Ok((a, b.max(a)))
    }

    fn list_method(
        &self,
        items: &[V],
        name: &str,
        args: &[Expr],
        row: usize,
        locals: &Locals,
    ) -> R {
        let equal = |a: &V, b: &V| self.equal(a, b);
        match name {
            "contains" => {
                let v = self.arg(args, 0, row, locals)?;
                Ok(V::Bool(items.iter().any(|i| equal(i, &v))))
            }
            "containsAll" => {
                let wanted = self.all_args(args, row, locals)?;
                Ok(V::Bool(
                    wanted.iter().all(|w| items.iter().any(|i| equal(i, w))),
                ))
            }
            "containsAny" => {
                let wanted = self.all_args(args, row, locals)?;
                Ok(V::Bool(
                    wanted.iter().any(|w| items.iter().any(|i| equal(i, w))),
                ))
            }
            "join" => {
                let sep = match self.arg(args, 0, row, locals)? {
                    V::Null => ",".to_owned(),
                    v => v.text(self.lang),
                };
                let out = items
                    .iter()
                    .map(|i| i.text(self.lang))
                    .collect::<Vec<_>>()
                    .join(&sep);
                if out.len() > MAX_TEXT {
                    return Err(err(EvalErrorKind::TooLarge, "join"));
                }
                Ok(V::Str(out))
            }
            "reverse" => Ok(V::List(items.iter().rev().cloned().collect())),
            "flat" => Ok(V::List(
                items
                    .iter()
                    .flat_map(|i| match i {
                        V::List(inner) => inner.clone(),
                        other => vec![other.clone()],
                    })
                    .collect(),
            )),
            "unique" => {
                let mut out: Vec<V> = Vec::new();
                for i in items {
                    if !out.iter().any(|o| equal(o, i)) {
                        out.push(i.clone());
                    }
                }
                Ok(V::List(out))
            }
            "sort" => {
                let mut out = items.to_vec();
                out.sort_by(|a, b| value::sort_order(a, b, self.lang));
                Ok(V::List(out))
            }
            "slice" => {
                let (a, b) = self.slice_bounds(items.len(), args, row, locals)?;
                Ok(V::List(items[a..b].to_vec()))
            }
            "filter" | "map" => {
                let Some(expr) = args.first() else {
                    return Err(err(EvalErrorKind::Arguments, name));
                };
                let mut out = Vec::new();
                for (i, item) in items.iter().enumerate() {
                    let mut scope = locals.clone();
                    scope.push(("value", item.clone()));
                    scope.push(("index", V::Num(i as f64)));
                    let r = self.eval(expr, row, &scope)?;
                    if name == "map" {
                        out.push(r);
                    } else if r.truthy() {
                        out.push(item.clone());
                    }
                }
                Ok(V::List(out))
            }
            "reduce" => {
                let Some(expr) = args.first() else {
                    return Err(err(EvalErrorKind::Arguments, name));
                };
                let mut acc = self.arg(args, 1, row, locals)?;
                for (i, item) in items.iter().enumerate() {
                    let mut scope = locals.clone();
                    scope.push(("value", item.clone()));
                    scope.push(("index", V::Num(i as f64)));
                    scope.push(("acc", acc));
                    acc = self.eval(expr, row, &scope)?;
                }
                Ok(acc)
            }
            // Not in "Functions", used by its own example of a custom
            // summary (`values.mean()`): the numbers of the list.
            "mean" | "average" | "sum" | "min" | "max" | "median" | "stddev" => {
                let nums: Vec<f64> = items.iter().filter_map(to_number).collect();
                Ok(stat(name, &nums).map_or(V::Null, V::Num))
            }
            _ => Err(err(EvalErrorKind::UnknownMethod, name)),
        }
    }

    /// `==`: values of one kind by value; a date and a text by the date the
    /// text reads as; a number and a text by the number; links and files
    /// by the file they name.
    pub(crate) fn equal(&self, a: &V, b: &V) -> bool {
        match (a, b) {
            (V::Null, V::Null) => true,
            (V::Null, _) | (_, V::Null) => false,
            (V::Link { .. } | V::File(_), V::Link { .. } | V::File(_)) => {
                match (self.link_path(a), self.link_path(b)) {
                    (Some(x), Some(y)) => x == y,
                    _ => match (a, b) {
                        (V::Link { target: x, .. }, V::Link { target: y, .. }) => {
                            value::link_target(x).to_lowercase()
                                == value::link_target(y).to_lowercase()
                        }
                        _ => false,
                    },
                }
            }
            (V::Link { target, .. }, V::Str(s)) | (V::Str(s), V::Link { target, .. }) => {
                value::link_target(target).to_lowercase() == value::link_target(s).to_lowercase()
            }
            (V::List(x), V::List(y)) => {
                x.len() == y.len() && x.iter().zip(y).all(|(p, q)| self.equal(p, q))
            }
            (V::Obj(x), V::Obj(y)) => {
                x.len() == y.len()
                    && x.iter()
                        .all(|(k, v)| y.iter().any(|(k2, v2)| k == k2 && self.equal(v, v2)))
            }
            _ => match compare(a, b, self.offset) {
                Some(o) => o.is_eq(),
                None => a == b,
            },
        }
    }

    fn link_path(&self, v: &V) -> Option<String> {
        match v {
            V::File(p) => Some(p.clone()),
            V::Link { target, from, .. } => self.facts.resolve(from, target),
            _ => None,
        }
    }

    fn binary(&self, op: BinaryOp, l: V, r: V) -> R {
        use BinaryOp as B;
        match op {
            B::Eq => Ok(V::Bool(self.equal(&l, &r))),
            B::Ne => Ok(V::Bool(!self.equal(&l, &r))),
            B::Lt | B::Le | B::Gt | B::Ge => {
                let Some(o) = compare(&l, &r, self.offset) else {
                    return Ok(V::Bool(false));
                };
                Ok(V::Bool(match op {
                    B::Lt => o.is_lt(),
                    B::Le => o.is_le(),
                    B::Gt => o.is_gt(),
                    _ => o.is_ge(),
                }))
            }
            B::Add => self.add(l, r),
            B::Sub => match (&l, &r) {
                (V::Date(a, _), V::Date(b, _)) => Ok(V::Num((a - b) as f64)),
                (V::Date(..), V::Str(_) | V::Dur(_)) => {
                    let d = self.duration(&r)?;
                    self.add(
                        l,
                        V::Dur(Duration {
                            months: -d.months,
                            ms: -d.ms,
                        }),
                    )
                }
                (V::Dur(a), V::Dur(b)) => Ok(V::Dur(Duration {
                    months: a.months - b.months,
                    ms: a.ms - b.ms,
                })),
                _ => arith(&l, &r, |a, b| a - b),
            },
            B::Mul => match (&l, &r) {
                (V::Dur(d), other) => {
                    let n = to_number(other).ok_or_else(|| err(EvalErrorKind::Type, "*"))?;
                    Ok(V::Dur(Duration {
                        months: d.months * n,
                        ms: d.ms * n,
                    }))
                }
                _ => arith(&l, &r, |a, b| a * b),
            },
            B::Div => match (&l, &r) {
                (V::Dur(d), other) => {
                    let n = to_number(other).ok_or_else(|| err(EvalErrorKind::Type, "/"))?;
                    Ok(V::Dur(Duration {
                        months: d.months / n,
                        ms: d.ms / n,
                    }))
                }
                _ => arith(&l, &r, |a, b| a / b),
            },
            B::Rem => arith(&l, &r, |a, b| a % b),
            B::And | B::Or => Ok(V::Null),
        }
    }

    fn duration(&self, v: &V) -> Result<Duration, EvalError> {
        match v {
            V::Dur(d) => Ok(*d),
            V::Str(s) => {
                time::parse_duration(s).ok_or_else(|| err(EvalErrorKind::Arguments, "duration"))
            }
            V::Num(n) => Ok(Duration {
                months: 0.0,
                ms: *n,
            }),
            _ => Err(err(EvalErrorKind::Type, "duration")),
        }
    }

    fn add(&self, l: V, r: V) -> R {
        match (&l, &r) {
            (V::Date(ms, t), V::Str(_) | V::Dur(_) | V::Num(_)) => {
                let d = self.duration(&r)?;
                let with_time = *t || d.ms.rem_euclid(86_400_000.0) != 0.0;
                Ok(V::Date(time::add(*ms, d), with_time))
            }
            (V::Dur(_), V::Date(..)) => self.add(r, l),
            (V::Dur(a), V::Dur(b)) => Ok(V::Dur(Duration {
                months: a.months + b.months,
                ms: a.ms + b.ms,
            })),
            (V::Str(_), _) | (_, V::Str(_)) => {
                let out = format!("{}{}", l.text(self.lang), r.text(self.lang));
                if out.len() > MAX_TEXT {
                    return Err(err(EvalErrorKind::TooLarge, "+"));
                }
                Ok(V::Str(out))
            }
            (V::List(a), V::List(b)) => Ok(V::List(a.iter().chain(b).cloned().collect())),
            _ => arith(&l, &r, |a, b| a + b),
        }
    }
}

/// An index of a list or a text of length `len`: negative counts from the
/// end; `None` outside.
fn index_of(len: usize, n: f64) -> Option<usize> {
    if n.fract() != 0.0 {
        return None;
    }
    let i = if n < 0.0 { len as f64 + n } else { n };
    (i >= 0.0 && i < len as f64).then_some(i as usize)
}

/// A value as a number, as arithmetic takes it: `null` as 0, booleans as 1
/// and 0, texts that read as numbers.
pub(crate) fn to_number(v: &V) -> Option<f64> {
    match v {
        V::Num(n) => Some(*n),
        V::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        V::Null => Some(0.0),
        V::Str(s) => parse_number(s),
        V::Dur(d) => Some(d.ms + d.months * 30.0 * 86_400_000.0),
        _ => None,
    }
}

fn arith(l: &V, r: &V, f: impl Fn(f64, f64) -> f64) -> R {
    match (to_number(l), to_number(r)) {
        (Some(a), Some(b)) => Ok(V::Num(f(a, b))),
        _ => Ok(V::Num(f64::NAN)),
    }
}

/// A statistic of numbers, for list methods and summaries.
pub(crate) fn stat(name: &str, nums: &[f64]) -> Option<f64> {
    if nums.is_empty() {
        return if name == "sum" { Some(0.0) } else { None };
    }
    let n = nums.len() as f64;
    let sum: f64 = nums.iter().sum();
    Some(match name {
        "sum" => sum,
        "mean" | "average" => sum / n,
        "min" => nums.iter().copied().fold(f64::INFINITY, f64::min),
        "max" => nums.iter().copied().fold(f64::NEG_INFINITY, f64::max),
        "median" => {
            let mut s = nums.to_vec();
            s.sort_by(f64::total_cmp);
            let mid = s.len() / 2;
            if s.len().is_multiple_of(2) {
                (s[mid - 1] + s[mid]) / 2.0
            } else {
                s[mid]
            }
        }
        "stddev" => {
            let mean = sum / n;
            (nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n).sqrt()
        }
        _ => return None,
    })
}

fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    out
}
