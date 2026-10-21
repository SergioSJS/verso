// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Views over the files of the folder: a base (`.base` file or `base`
//! block) evaluated — filtered, sorted, grouped, limited, its columns and
//! summaries computed — as Obsidian's Bases document it (ADR 0053). The
//! window draws the result as a table, cards, a list, a kanban or a
//! calendar; what each layout does with it is the window's.
//!
//! Nothing here writes. A view that changes a note (a card moved to another
//! column, a cell edited) goes through the window's ordinary write, with the
//! note's revision (invariant 11).

mod eval;
mod pattern;
mod time;
mod value;

use std::cell::{OnceCell, RefCell};
use std::collections::{HashMap, HashSet};

use verso_dialect::Value;
use verso_dialect::bases::{Base, BaseProblem, Expr, ExprError, Filter, View, parse_expression};

use eval::{Env, stat, to_number};
use value::{V, cell, error_cell};

/// Steps one query may take, over every file and column: a base comes from
/// a file of the folder, and a formula can be made to loop over lists.
const BUDGET: u64 = 50_000_000;

/// What the window asks: a base, the view to show, and the context.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BaseQuery {
    /// The `.base` file, when the base is one.
    pub path: Option<String>,
    /// The base's text, when it is a block of a note: read instead of
    /// `path`.
    pub text: Option<String>,
    /// The file `this` stands for: the note a base is embedded in, or the
    /// `.base` file itself.
    pub this: Option<String>,
    /// The view to evaluate, by name; the first when absent.
    pub view: Option<String>,
    /// Properties to evaluate besides the view's `order`: what a layout
    /// needs (a card's image, a calendar's date).
    pub extra: Vec<String>,
    /// The window's clock, in milliseconds since the Unix epoch.
    pub now_ms: i64,
    /// The window's zone, in minutes east of UTC.
    pub offset_minutes: i32,
    /// The interface language, for month names and relative dates.
    pub lang: String,
    /// The folders the query sees, by path; empty: the whole folder. A
    /// window on a share sees the shared folder only (ADR 0081 item 11):
    /// a file outside is not a row, its properties are not offered, a
    /// link to it resolves to nothing, and no formula or summary counts
    /// it — a backlink from outside included.
    pub within: Vec<String>,
    /// Asked by an account that may only read the folder, on a UniVerso
    /// (ADR 0087 item 4): every note as its projection — a tag or a link
    /// inside a secret block is none, no count counts it — and a note's
    /// size and time its projection's.
    pub reader: bool,
}

impl BaseQuery {
    /// Whether the query sees the file at `path`.
    #[must_use]
    pub fn sees(&self, path: &str) -> bool {
        self.within.is_empty()
            || self.within.iter().any(|root| {
                root.is_empty()
                    || path == root
                    || path
                        .strip_prefix(root.as_str())
                        .is_some_and(|rest| rest.starts_with('/'))
            })
    }
}

/// A base evaluated.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct BaseResult {
    /// Every view of the base, in order.
    pub views: Vec<BaseView>,
    /// The view evaluated, as an index into `views`; `None` when the base
    /// has none (a default table was evaluated).
    pub view: Option<usize>,
    pub columns: Vec<BaseColumn>,
    /// The rows, one group when the view is not grouped.
    pub groups: Vec<BaseGroup>,
    /// Files that passed the filters, before `limit`.
    pub total: usize,
    pub problems: Vec<Problem>,
    /// Every note property of the folder, by name, once each (ignoring
    /// case), in name order: what the view's menus offer.
    pub properties: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BaseView {
    pub name: String,
    pub kind: String,
}

/// A column: the property id as the view names it, and the name the base
/// gives it, if any.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BaseColumn {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BaseGroup {
    /// The value of the grouping property; `None` when not grouped.
    pub key: Option<Cell>,
    pub rows: Vec<BaseRow>,
    /// One per column: the summary the view asks for, or `None`.
    pub summaries: Vec<Option<Cell>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BaseRow {
    pub path: String,
    /// A Markdown note, whose properties a view may change.
    pub note: bool,
    /// One per column.
    pub cells: Vec<Cell>,
}

/// A value as a view shows it.
#[derive(Debug, Clone, PartialEq)]
pub enum Cell {
    Empty,
    Text(String),
    Number(f64),
    Bool(bool),
    /// A wall-clock time in the window's zone, in milliseconds since
    /// 1970-01-01T00:00 of that clock, and whether it has a time of day.
    Date {
        ms: i64,
        time: bool,
    },
    /// Milliseconds.
    Duration(f64),
    List(Vec<Cell>),
    Object(Vec<(String, Cell)>),
    /// A link as written, the text to show, and the file it resolves to.
    Link {
        target: String,
        display: Option<String>,
        path: Option<String>,
    },
    File(String),
    /// A path of the folder or a URL.
    Image(String),
    /// A Lucide icon name.
    Icon(String),
    Html(String),
    Error(EvalError),
}

/// Why a value could not be computed; `name` is the function, method,
/// formula or operator concerned.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EvalError {
    pub kind: EvalErrorKind,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EvalErrorKind {
    /// The formula is not an expression.
    Syntax,
    UnknownFunction,
    UnknownMethod,
    Arguments,
    Type,
    /// A regular expression where the method takes a text (`contains`,
    /// `startsWith`): `name` is the method (ADR 0094 item 1).
    Regex,
    /// A regular expression that is not one, or with a flag that is no
    /// flag: `name` is the literal as written.
    RegexInvalid,
    /// What the engine does not have (ADR 0094 items 2 and 4): `name` is
    /// `lookahead`, `lookbehind`, `backreference` or `flag y`, `flag d`,
    /// `flag v`.
    RegexUnsupported,
    /// A pattern past 1,000 characters or past the compiled size (ADR
    /// 0094 item 3), or one too many for a query: `name` is the literal.
    RegexTooLarge,
    /// A formula that needs itself.
    Cycle,
    /// The query ran out of steps.
    Budget,
    /// A text beyond the size a formula may build.
    TooLarge,
}

/// Something about the base as a whole: shown once, above the view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub kind: ProblemKind,
    /// What it concerns: the YAML's message, a key's path, an expression
    /// and its error, a view's name; for an evaluation, the statement or
    /// the column whose value failed.
    pub detail: String,
    /// Why an evaluation failed, as its cells say it.
    pub error: Option<EvalError>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProblemKind {
    NotABase,
    TooLong,
    Shape,
    Expression,
    Evaluation,
    UnknownView,
    Budget,
}

/// What a note says, as far as a base asks: kept per note between
/// queries, recomputed when the note's hash changes.
#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct NoteFacts {
    /// The frontmatter's keys and values, in the file's order.
    pub props: Vec<(String, Value)>,
    /// Tags of the frontmatter and of the body, without `#`, once each
    /// (compared ignoring case), in the order met.
    pub tags: Vec<String>,
    /// Wikilinks written as property values: target and alias.
    pub prop_links: Vec<(String, Option<String>)>,
}

impl NoteFacts {
    pub(crate) fn of(content: &str) -> Self {
        let document = verso_dialect::parse(content);
        let props = match document.frontmatter.map(|f| f.values) {
            Some(Ok(Value::Mapping(map))) => map,
            _ => Vec::new(),
        };
        let mut tags: Vec<String> = Vec::new();
        let mut push = |t: &str| {
            let t = t.trim().trim_start_matches('#');
            // Digits are a tag here (DL.2 = B): a body `#2024` never gets
            // this far, `body_tags` has dropped it.
            if !t.is_empty() && !tags.iter().any(|x| x.to_lowercase() == t.to_lowercase()) {
                tags.push(t.to_owned());
            }
        };
        for (k, v) in &props {
            if k == "tags" || k == "tag" {
                match v {
                    Value::Sequence(items) => {
                        for i in items {
                            if let Some(t) = verso_dialect::frontmatter_tag(i) {
                                push(&t);
                            }
                        }
                    }
                    Value::String(s) => {
                        for t in s.split([',', ' ']) {
                            push(t);
                        }
                    }
                    Value::Integer(_) => {
                        if let Some(t) = verso_dialect::frontmatter_tag(v) {
                            push(&t);
                        }
                    }
                    _ => {}
                }
            }
        }
        for t in verso_dialect::body_tags(content) {
            push(&t.name);
        }
        let mut prop_links = Vec::new();
        fn walk(v: &Value, out: &mut Vec<(String, Option<String>)>) {
            match v {
                Value::String(s) => {
                    if let Some(link) = value::as_wikilink(s) {
                        out.push(link);
                    }
                }
                Value::Sequence(items) => items.iter().for_each(|i| walk(i, out)),
                Value::Mapping(entries) => entries.iter().for_each(|(_, i)| walk(i, out)),
                _ => {}
            }
        }
        for (_, v) in &props {
            walk(v, &mut prop_links);
        }
        Self {
            props,
            tags,
            prop_links,
        }
    }
}

/// A file of the folder, as a base sees it.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FileFacts {
    pub path: String,
    pub size: u64,
    /// Wall-clock times in the window's zone (`time.rs`).
    pub ctime: Option<i64>,
    pub mtime: Option<i64>,
    pub note: bool,
}

/// A link of a note's body, from the index.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LinkFact {
    pub target: String,
    pub alias: Option<String>,
    pub embed: bool,
    /// The note it resolves to, if any; files other than notes are
    /// resolved on demand.
    pub resolved: Option<String>,
}

type Resolver<'a> = &'a dyn Fn(&str, &str) -> Option<String>;

/// Everything a query reads: the files, what each note says, the links,
/// and how a link's target finds its file.
pub(crate) struct Facts<'a> {
    pub files: Vec<FileFacts>,
    by_path: HashMap<String, usize>,
    notes: HashMap<String, &'a NoteFacts>,
    links: HashMap<String, Vec<LinkFact>>,
    resolver: Resolver<'a>,
    resolved: RefCell<HashMap<(String, String), Option<String>>>,
    backlinks: OnceCell<HashMap<String, Vec<String>>>,
}

impl<'a> Facts<'a> {
    pub(crate) fn new(
        files: Vec<FileFacts>,
        notes: HashMap<String, &'a NoteFacts>,
        links: Vec<(String, LinkFact)>,
        resolver: Resolver<'a>,
    ) -> Self {
        let by_path = files
            .iter()
            .enumerate()
            .map(|(i, f)| (f.path.clone(), i))
            .collect();
        let mut by_source: HashMap<String, Vec<LinkFact>> = HashMap::new();
        for (from, l) in links {
            by_source.entry(from).or_default().push(l);
        }
        Self {
            files,
            by_path,
            notes,
            links: by_source,
            resolver,
            resolved: RefCell::new(HashMap::new()),
            backlinks: OnceCell::new(),
        }
    }

    pub(crate) fn file(&self, path: &str) -> Option<&FileFacts> {
        self.by_path.get(path).and_then(|&i| self.files.get(i))
    }

    pub(crate) fn props(&self, path: &str) -> Option<&[(String, Value)]> {
        self.notes.get(path).map(|n| n.props.as_slice())
    }

    /// Every note property name of the folder, once each ignoring case,
    /// sorted.
    pub(crate) fn property_names(&self) -> Vec<String> {
        let mut seen: HashMap<String, String> = HashMap::new();
        for n in self.notes.values() {
            for (k, _) in &n.props {
                seen.entry(k.to_lowercase()).or_insert_with(|| k.clone());
            }
        }
        let mut names: Vec<String> = seen.into_values().collect();
        names.sort_by(|a, b| value::natural(&a.to_lowercase(), &b.to_lowercase()));
        names
    }

    pub(crate) fn tags(&self, path: &str) -> &[String] {
        self.notes.get(path).map_or(&[], |n| n.tags.as_slice())
    }

    /// The links of a note — of its body and its properties — or its
    /// embeds: target and text to show.
    pub(crate) fn links_of(&self, path: &str, embeds: bool) -> Vec<(String, Option<String>)> {
        let mut out: Vec<(String, Option<String>)> = self
            .links
            .get(path)
            .into_iter()
            .flatten()
            .filter(|l| l.embed == embeds)
            .map(|l| (l.target.clone(), l.alias.clone()))
            .collect();
        if !embeds && let Some(n) = self.notes.get(path) {
            out.extend(n.prop_links.iter().cloned());
        }
        out
    }

    /// The files a note links to or embeds, resolved.
    pub(crate) fn resolved_links(&self, path: &str) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for l in self.links.get(path).into_iter().flatten() {
            if let Some(p) = l.resolved.clone().or_else(|| self.resolve(path, &l.target)) {
                out.push(p);
            }
        }
        if let Some(n) = self.notes.get(path) {
            for (target, _) in &n.prop_links {
                if let Some(p) = self.resolve(path, target) {
                    out.push(p);
                }
            }
        }
        out
    }

    pub(crate) fn backlinks(&self, path: &str) -> Vec<String> {
        let map = self.backlinks.get_or_init(|| {
            let mut map: HashMap<String, Vec<String>> = HashMap::new();
            let sources: Vec<String> = self
                .files
                .iter()
                .filter(|f| f.note)
                .map(|f| f.path.clone())
                .collect();
            for source in sources {
                let mut targets = self.resolved_links(&source);
                targets.sort();
                targets.dedup();
                for t in targets {
                    map.entry(t).or_default().push(source.clone());
                }
            }
            map
        });
        map.get(path).cloned().unwrap_or_default()
    }

    /// The file a link's target names, read from the note `from`.
    pub(crate) fn resolve(&self, from: &str, target: &str) -> Option<String> {
        let target = value::link_target(target);
        if target.is_empty() {
            return Some(from.to_owned());
        }
        let key = (from.to_owned(), target.clone());
        if let Some(done) = self.resolved.borrow().get(&key) {
            return done.clone();
        }
        let found = if self.by_path.contains_key(&target) {
            Some(target.clone())
        } else {
            (self.resolver)(from, &target)
        };
        self.resolved.borrow_mut().insert(key, found.clone());
        found
    }
}

/// A filter with its statements read.
enum Compiled {
    And(Vec<Compiled>),
    Or(Vec<Compiled>),
    Not(Vec<Compiled>),
    Statement(Result<Expr, ExprError>, String),
}

fn compile(filter: &Filter) -> Compiled {
    match filter {
        Filter::And(items) => Compiled::And(items.iter().map(compile).collect()),
        Filter::Or(items) => Compiled::Or(items.iter().map(compile).collect()),
        Filter::Not(items) => Compiled::Not(items.iter().map(compile).collect()),
        Filter::Statement(text) => Compiled::Statement(parse_expression(text), text.clone()),
    }
}

/// Whether the file `row` passes `filter`. A statement that is not an
/// expression, or fails, does not hold; each is reported once.
fn holds(env: &Env<'_>, filter: &Compiled, row: usize, problems: &mut Problems) -> bool {
    match filter {
        Compiled::And(items) => items.iter().all(|f| holds(env, f, row, problems)),
        Compiled::Or(items) => items.iter().any(|f| holds(env, f, row, problems)),
        Compiled::Not(items) => !items.iter().any(|f| holds(env, f, row, problems)),
        Compiled::Statement(Ok(expr), text) => match env.eval(expr, row, &Vec::new()) {
            Ok(v) => v.truthy(),
            Err(e) => {
                problems.evaluation(text, &e);
                false
            }
        },
        Compiled::Statement(Err(e), text) => {
            problems.add(ProblemKind::Expression, format!("{text}: {e}"));
            false
        }
    }
}

/// The problems of a query, each once.
#[derive(Default)]
struct Problems {
    list: Vec<Problem>,
    seen: HashSet<(u8, String, Option<EvalError>)>,
}

impl Problems {
    fn add(&mut self, kind: ProblemKind, detail: String) {
        self.push(kind, detail, None);
    }

    fn push(&mut self, kind: ProblemKind, detail: String, error: Option<EvalError>) {
        if self
            .seen
            .insert((kind as u8, detail.clone(), error.clone()))
        {
            self.list.push(Problem {
                kind,
                detail,
                error,
            });
        }
    }

    /// A statement or a column that failed: a line above the view naming
    /// it, with the cell's error (ADR 0053; ADR 0094 item 5).
    fn evaluation(&mut self, text: &str, e: &EvalError) {
        if e.kind == EvalErrorKind::Budget {
            self.add(ProblemKind::Budget, String::new());
        } else {
            self.push(ProblemKind::Evaluation, text.to_owned(), Some(e.clone()));
        }
    }
}

/// The view a query evaluates when the base has none: every file, by name.
fn default_view() -> View {
    View {
        kind: "table".to_owned(),
        name: String::new(),
        limit: None,
        filters: None,
        group_by: None,
        order: vec!["file.name".to_owned()],
        sort: Vec::new(),
        summaries: Vec::new(),
        settings: Vec::new(),
    }
}

/// A property id with its `note.` taken off: `status` and `note.status`
/// are one property.
fn bare(id: &str) -> &str {
    id.strip_prefix("note.").unwrap_or(id)
}

/// Evaluate `base` for `query` over `facts`.
pub(crate) fn run(base: &Base, query: &BaseQuery, facts: &Facts<'_>) -> BaseResult {
    run_with(base, query, facts, BUDGET)
}

/// [`run`], with the number of steps it may take.
fn run_with(base: &Base, query: &BaseQuery, facts: &Facts<'_>, budget: u64) -> BaseResult {
    let mut problems = Problems::default();
    for p in &base.problems {
        match p {
            BaseProblem::Yaml(m) => problems.add(ProblemKind::NotABase, m.clone()),
            BaseProblem::TooLong => problems.add(ProblemKind::TooLong, String::new()),
            BaseProblem::Shape(at) => problems.add(ProblemKind::Shape, at.clone()),
        }
    }
    let views: Vec<BaseView> = base
        .views
        .iter()
        .map(|v| BaseView {
            name: v.name.clone(),
            kind: v.kind.clone(),
        })
        .collect();
    let fallback = default_view();
    let chosen = match query.view.as_deref() {
        Some(name) if !name.is_empty() => match base.views.iter().position(|v| v.name == name) {
            Some(i) => Some(i),
            None => {
                problems.add(ProblemKind::UnknownView, name.to_owned());
                (!base.views.is_empty()).then_some(0)
            }
        },
        _ => (!base.views.is_empty()).then_some(0),
    };
    let view = chosen.and_then(|i| base.views.get(i)).unwrap_or(&fallback);

    let formulas: Vec<(String, Result<Expr, ExprError>)> = base
        .formulas
        .iter()
        .map(|(n, t)| (n.clone(), parse_expression(t)))
        .collect();
    for (n, f) in &formulas {
        if let Err(e) = f {
            problems.add(ProblemKind::Expression, format!("formula.{n}: {e}"));
        }
    }
    let now =
        query.now_ms.clamp(-time::MAX_MS, time::MAX_MS) + i64::from(query.offset_minutes) * 60_000;
    let env = Env::new(
        facts,
        &formulas,
        query.this.as_deref(),
        &query.lang,
        query.offset_minutes,
        now,
        budget,
    );
    let filters: Vec<Compiled> = base
        .filters
        .iter()
        .chain(view.filters.iter())
        .map(compile)
        .collect();

    let mut rows: Vec<usize> = (0..facts.files.len())
        .filter(|&i| filters.iter().all(|f| holds(&env, f, i, &mut problems)))
        .collect();

    // Keys: the group first, then each sort, then the path, so that the
    // order never depends on the walk's.
    let group_values: Vec<Option<V>> = rows
        .iter()
        .map(|&r| {
            view.group_by
                .as_ref()
                .map(|g| env.property(&g.property, r).unwrap_or(V::Null))
        })
        .collect();
    let sort_values: Vec<Vec<V>> = rows
        .iter()
        .map(|&r| {
            view.sort
                .iter()
                .map(|s| env.property(&s.property, r).unwrap_or(V::Null))
                .collect()
        })
        .collect();
    let mut order: Vec<usize> = (0..rows.len()).collect();
    let lang = query.lang.as_str();
    order.sort_by(|&a, &b| {
        let mut o = std::cmp::Ordering::Equal;
        if let (Some(Some(x)), Some(Some(y))) = (group_values.get(a), group_values.get(b)) {
            let descending = view.group_by.as_ref().is_some_and(|g| g.descending);
            o = key_order(x, y, lang, descending);
        }
        for (k, s) in view.sort.iter().enumerate() {
            if o.is_ne() {
                break;
            }
            let (x, y) = (&sort_values[a][k], &sort_values[b][k]);
            o = key_order(x, y, lang, s.descending);
        }
        o.then_with(|| {
            value::natural(
                &facts.files[rows[a]].path.to_lowercase(),
                &facts.files[rows[b]].path.to_lowercase(),
            )
        })
    });
    let total = order.len();
    if let Some(limit) = view.limit {
        order.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
    }
    let sorted_groups: Vec<Option<V>> = order.iter().map(|&k| group_values[k].clone()).collect();
    rows = order.iter().map(|&k| rows[k]).collect();

    // Columns: the view's, then what the layout asked for.
    let mut ids: Vec<String> = if view.order.is_empty() {
        vec!["file.name".to_owned()]
    } else {
        view.order.clone()
    };
    for extra in &query.extra {
        if !extra.is_empty() && !ids.iter().any(|i| bare(i) == bare(extra)) {
            ids.push(extra.clone());
        }
    }
    let columns: Vec<BaseColumn> = ids
        .iter()
        .map(|id| BaseColumn {
            id: id.clone(),
            name: base
                .properties
                .iter()
                .find(|(p, _)| bare(p) == bare(id))
                .and_then(|(_, s)| s.display_name.clone()),
        })
        .collect();

    let mut resolve = |from: &str, target: &str| facts.resolve(from, target);
    let mut groups: Vec<BaseGroup> = Vec::new();
    let mut raw: Vec<Vec<Vec<V>>> = Vec::new();
    for (k, &r) in rows.iter().enumerate() {
        let key = sorted_groups.get(k).cloned().flatten();
        let key_cell = key.as_ref().map(|v| cell(v, &mut resolve));
        let same = groups
            .last()
            .is_some_and(|g| view.group_by.is_none() || g.key == key_cell);
        if !same || groups.is_empty() {
            groups.push(BaseGroup {
                key: key_cell,
                rows: Vec::new(),
                summaries: Vec::new(),
            });
            raw.push(vec![Vec::new(); ids.len()]);
        }
        let mut cells = Vec::with_capacity(ids.len());
        for (c, id) in ids.iter().enumerate() {
            match env.property(id, r) {
                Ok(v) => {
                    cells.push(cell(&v, &mut resolve));
                    if let Some(slot) = raw.last_mut().and_then(|g| g.get_mut(c)) {
                        slot.push(v);
                    }
                }
                Err(e) => {
                    problems.evaluation(id, &e);
                    cells.push(error_cell(&e));
                    if let Some(slot) = raw.last_mut().and_then(|g| g.get_mut(c)) {
                        slot.push(V::Null);
                    }
                }
            }
        }
        if let Some(g) = groups.last_mut() {
            g.rows.push(BaseRow {
                path: facts.files[r].path.clone(),
                note: facts.files[r].note,
                cells,
            });
        }
    }
    if groups.is_empty() {
        groups.push(BaseGroup {
            key: None,
            rows: Vec::new(),
            summaries: Vec::new(),
        });
        raw.push(vec![Vec::new(); ids.len()]);
    }

    // Summaries: per group, per column the view names one for.
    let custom: Vec<(String, Result<Expr, ExprError>)> = base
        .summaries
        .iter()
        .map(|(n, t)| (n.clone(), parse_expression(t)))
        .collect();
    for (g, group) in groups.iter_mut().enumerate() {
        group.summaries = ids
            .iter()
            .enumerate()
            .map(|(c, id)| {
                let (_, name) = view.summaries.iter().find(|(p, _)| bare(p) == bare(id))?;
                let values = raw
                    .get(g)
                    .and_then(|cols| cols.get(c))
                    .cloned()
                    .unwrap_or_default();
                Some(summary(
                    &env,
                    name,
                    values,
                    &custom,
                    &mut problems,
                    &mut resolve,
                ))
            })
            .collect();
    }

    if env.exhausted.get() {
        problems.add(ProblemKind::Budget, String::new());
    }
    BaseResult {
        views,
        view: chosen,
        columns,
        groups,
        total,
        problems: problems.list,
        properties: facts.property_names(),
    }
}

fn is_null(v: &V) -> bool {
    matches!(v, V::Null) || matches!(v, V::Str(s) if s.is_empty())
}

/// The order of groups and of sorted rows: empty values last, whatever the
/// direction — an order with no exception, as sorting needs one.
fn key_order(a: &V, b: &V, lang: &str, descending: bool) -> std::cmp::Ordering {
    match (is_null(a), is_null(b)) {
        (true, true) => std::cmp::Ordering::Equal,
        (true, false) => std::cmp::Ordering::Greater,
        (false, true) => std::cmp::Ordering::Less,
        (false, false) if descending => value::sort_order(b, a, lang),
        (false, false) => value::sort_order(a, b, lang),
    }
}

/// A summary of `values`, by the name the view gives it: one of the
/// defaults of "Bases syntax", or a formula of the base's `summaries`.
fn summary(
    env: &Env<'_>,
    name: &str,
    values: Vec<V>,
    custom: &[(String, Result<Expr, ExprError>)],
    problems: &mut Problems,
    resolve: &mut dyn FnMut(&str, &str) -> Option<String>,
) -> Cell {
    // A summary of the base's own comes first: it may take a default's name.
    if let Some((_, parsed)) = custom.iter().find(|(n, _)| n == name) {
        return match parsed {
            Ok(expr) => {
                let locals = vec![("values", V::List(values))];
                match env.eval(expr, 0, &locals) {
                    Ok(v) => cell(&v, resolve),
                    Err(e) => error_cell(&e),
                }
            }
            Err(e) => {
                problems.add(ProblemKind::Expression, format!("summaries.{name}: {e}"));
                Cell::Empty
            }
        };
    }
    let nums: Vec<f64> = values
        .iter()
        .filter(|v| matches!(v, V::Num(_)))
        .filter_map(to_number)
        .collect();
    let dates: Vec<i64> = values
        .iter()
        .filter_map(|v| match v {
            V::Date(ms, _) => Some(*ms),
            _ => None,
        })
        .collect();
    let number = |n: Option<f64>| n.map_or(Cell::Empty, Cell::Number);
    let count = |n: usize| Cell::Number(n as f64);
    match name {
        "Average" => number(stat("mean", &nums)),
        "Min" => number(stat("min", &nums)),
        "Max" => number(stat("max", &nums)),
        "Sum" => number(stat("sum", &nums)),
        "Median" => number(stat("median", &nums)),
        "Stddev" => number(stat("stddev", &nums)),
        "Range" if !dates.is_empty() && nums.is_empty() => {
            let (lo, hi) = (dates.iter().min(), dates.iter().max());
            match (lo, hi) {
                (Some(lo), Some(hi)) => Cell::Duration((hi - lo) as f64),
                _ => Cell::Empty,
            }
        }
        "Range" => match (stat("min", &nums), stat("max", &nums)) {
            (Some(lo), Some(hi)) => Cell::Number(hi - lo),
            _ => Cell::Empty,
        },
        "Earliest" => dates.iter().min().map_or(Cell::Empty, |ms| Cell::Date {
            ms: *ms,
            time: true,
        }),
        "Latest" => dates.iter().max().map_or(Cell::Empty, |ms| Cell::Date {
            ms: *ms,
            time: true,
        }),
        "Checked" => count(values.iter().filter(|v| matches!(v, V::Bool(true))).count()),
        "Unchecked" => count(
            values
                .iter()
                .filter(|v| matches!(v, V::Bool(false)))
                .count(),
        ),
        "Empty" => count(values.iter().filter(|v| v.is_empty()).count()),
        "Filled" => count(values.iter().filter(|v| !v.is_empty()).count()),
        "Count" => count(values.len()),
        "Unique" => {
            let mut seen: Vec<&V> = Vec::new();
            for v in values.iter().filter(|v| !v.is_empty()) {
                if !seen.iter().any(|s| env.equal(s, v)) {
                    seen.push(v);
                }
            }
            count(seen.len())
        }
        other => {
            problems.add(ProblemKind::Shape, format!("summaries: {other}"));
            Cell::Empty
        }
    }
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_regex;
