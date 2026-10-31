// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A small campaign folder, bases over it, and what each view shows.

use std::collections::HashMap;

use verso_dialect::bases::parse_base;

use super::time::from_parts;
use super::*;

/// The notes of a campaign, and two files that are not notes.
const VAULT: &[(&str, &str)] = &[
    (
        "PdMs/Grom.md",
        "---\ntype: npc\nfacção: \"[[Forja]]\"\nnível: 5\nstatus: aliado\naparição: 2025-03-02\ntags: [anão, ferreiro]\n---\n# Grom\nFerreiro da [[Forja]]. #importante\n",
    ),
    (
        "PdMs/Lia.md",
        "---\ntype: npc\nnível: 3\nstatus: inimiga\naparição: 2025-04-10\ntags:\n  - elfa\n---\nEspiã. Vista na [[Taverna]].\n",
    ),
    (
        "PdMs/Velho.md",
        "---\ntype: npc\nnível: 12\n---\nSem status. [[Grom]]\n",
    ),
    (
        "Locais/Forja.md",
        "---\ntype: local\n---\nOnde [[Grom]] trabalha. ![[mapa.png]]\n",
    ),
    ("Locais/Taverna.md", "Taverna do Pônei.\n"),
    (
        "Sessões/Sessão 2.md",
        "---\ndata: 2025-05-20\n---\nCom [[Lia]].\n",
    ),
    (
        "Sessões/Sessão 10.md",
        "---\ndata: 2025-09-01T20:00:00\n---\n",
    ),
    ("mapa.png", ""),
    ("Campanha.base", ""),
];

pub(super) struct Fixture {
    pub(super) notes: HashMap<String, NoteFacts>,
    pub(super) files: Vec<FileFacts>,
    pub(super) links: Vec<(String, LinkFact)>,
}

pub(super) fn fixture() -> Fixture {
    let mut notes = HashMap::new();
    let mut files = Vec::new();
    let mut links = Vec::new();
    for (i, (path, content)) in VAULT.iter().enumerate() {
        let note = path.ends_with(".md");
        files.push(FileFacts {
            path: (*path).to_owned(),
            size: content.len() as u64,
            ctime: Some(from_parts(2025, 1, 1, 0, 0, 0, 0) + i as i64),
            mtime: Some(from_parts(2025, 6, 1, 0, 0, 0, 0) + i as i64),
            note,
        });
        if note {
            notes.insert((*path).to_owned(), NoteFacts::of(content));
            let doc = verso_dialect::parse(content);
            for l in &doc.links {
                links.push((
                    (*path).to_owned(),
                    LinkFact {
                        target: l.target.clone(),
                        alias: l.alias.clone(),
                        embed: false,
                        resolved: resolve_name(&l.target),
                    },
                ));
            }
            for e in &doc.embeds {
                links.push((
                    (*path).to_owned(),
                    LinkFact {
                        target: e.target.clone(),
                        alias: None,
                        embed: true,
                        resolved: None,
                    },
                ));
            }
        }
    }
    Fixture {
        notes,
        files,
        links,
    }
}

/// Resolution by bare name, as the index would do it in this folder.
pub(super) fn resolve_name(target: &str) -> Option<String> {
    VAULT
        .iter()
        .map(|(p, _)| *p)
        .find(|p| {
            let name = p.rsplit('/').next().unwrap_or(p);
            name == target || name.strip_suffix(".md") == Some(target)
        })
        .map(str::to_owned)
}

pub(super) fn query(view: Option<&str>) -> BaseQuery {
    BaseQuery {
        view: view.map(str::to_owned),
        // 2025-06-15 12:00 at UTC−3.
        now_ms: from_parts(2025, 6, 15, 15, 0, 0, 0),
        offset_minutes: -180,
        lang: "pt-BR".to_owned(),
        this: Some("Campanha.base".to_owned()),
        ..BaseQuery::default()
    }
}

pub(super) fn eval_base(yaml: &str, q: &BaseQuery) -> BaseResult {
    let f = fixture();
    let resolver = |_: &str, t: &str| resolve_name(t);
    let notes = f.notes.iter().map(|(k, v)| (k.clone(), v)).collect();
    let facts = Facts::new(f.files.clone(), notes, f.links.clone(), &resolver);
    run(&parse_base(yaml), q, &facts)
}

fn paths(r: &BaseResult) -> Vec<&str> {
    r.groups
        .iter()
        .flat_map(|g| g.rows.iter().map(|row| row.path.as_str()))
        .collect()
}

#[test]
fn a_table_of_npcs_sorted_by_level() {
    let r = eval_base(
        "filters:\n  and:\n    - type == \"npc\"\nviews:\n  - type: table\n    name: PdMs\n    order: [file.name, nível, status]\n    sort:\n      - property: nível\n        direction: DESC\n",
        &query(None),
    );
    assert_eq!(r.problems, vec![]);
    assert_eq!(
        paths(&r),
        vec!["PdMs/Velho.md", "PdMs/Grom.md", "PdMs/Lia.md"]
    );
    assert_eq!(r.total, 3);
    assert_eq!(r.view, Some(0));
    let first = &r.groups[0].rows[0];
    assert_eq!(first.cells[0], Cell::Text("Velho.md".into()));
    assert_eq!(first.cells[1], Cell::Number(12.0));
    assert_eq!(first.cells[2], Cell::Empty);
}

#[test]
fn file_functions_filter_by_folder_tag_and_link() {
    let one = |f: &str| {
        let r = eval_base(&format!("filters: '{f}'\n"), &query(None));
        assert_eq!(r.problems, vec![], "{f}");
        paths(&r).into_iter().map(str::to_owned).collect::<Vec<_>>()
    };
    assert_eq!(
        one("file.inFolder(\"Locais\")"),
        vec!["Locais/Forja.md", "Locais/Taverna.md"]
    );
    // A tag of the body and of the frontmatter; nested tags count.
    assert_eq!(one("file.hasTag(\"importante\")"), vec!["PdMs/Grom.md"]);
    assert_eq!(one("file.hasTag(\"#ELFA\", \"nada\")"), vec!["PdMs/Lia.md"]);
    // A link in the body, and one in a property (`facção: "[[Forja]]"`).
    assert_eq!(
        one("file.hasLink(\"Grom\")"),
        vec!["Locais/Forja.md", "PdMs/Velho.md"]
    );
    assert_eq!(one("file.hasLink(\"Forja\")"), vec!["PdMs/Grom.md"]);
    assert_eq!(one("file.ext == \"png\""), vec!["mapa.png"]);
    assert_eq!(one("file.hasProperty(\"data\")").len(), 2);
    assert_eq!(one("file.embeds.length > 0"), vec!["Locais/Forja.md"]);
}

#[test]
fn this_is_the_file_the_base_is_seen_from() {
    let mut q = query(None);
    q.this = Some("PdMs/Grom.md".into());
    let r = eval_base("filters: file.hasLink(this.file)\n", &q);
    assert_eq!(paths(&r), vec!["Locais/Forja.md", "PdMs/Velho.md"]);
    let r = eval_base("filters: file.hasLink(this)\n", &q);
    assert_eq!(paths(&r), vec!["Locais/Forja.md", "PdMs/Velho.md"]);
    // `author == this`: a link property naming the embedding note.
    q.this = Some("Locais/Forja.md".into());
    let r = eval_base("filters: facção == this\n", &q);
    assert_eq!(paths(&r), vec!["PdMs/Grom.md"]);
}

#[test]
fn a_kanban_groups_by_status_with_the_empty_group_last() {
    let r = eval_base(
        "filters: type == \"npc\"\nviews:\n  - type: kanban\n    name: Relações\n    groupBy:\n      property: status\n      direction: ASC\n",
        &query(Some("Relações")),
    );
    let keys: Vec<Option<Cell>> = r.groups.iter().map(|g| g.key.clone()).collect();
    assert_eq!(
        keys,
        vec![
            Some(Cell::Text("aliado".into())),
            Some(Cell::Text("inimiga".into())),
            Some(Cell::Empty)
        ]
    );
    assert_eq!(r.groups[2].rows[0].path, "PdMs/Velho.md");
    let r = eval_base(
        "filters: type == \"npc\"\nviews:\n  - type: kanban\n    name: K\n    groupBy:\n      property: status\n      direction: DESC\n",
        &query(None),
    );
    assert_eq!(r.groups[0].key, Some(Cell::Text("inimiga".into())));
    assert_eq!(r.groups[2].key, Some(Cell::Empty));
}

#[test]
fn dates_compare_and_move() {
    let one = |f: &str| {
        let r = eval_base(&format!("filters: '{f}'\n"), &query(None));
        assert_eq!(r.problems, vec![], "{f}");
        paths(&r).into_iter().map(str::to_owned).collect::<Vec<_>>()
    };
    assert_eq!(one("aparição < date(\"2025-04-01\")"), vec!["PdMs/Grom.md"]);
    assert_eq!(one("data > today()"), vec!["Sessões/Sessão 10.md"]);
    assert_eq!(one("data < today() - \"2w\""), vec!["Sessões/Sessão 2.md"]);
    assert_eq!(one("aparição.month == 4"), vec!["PdMs/Lia.md"]);
    assert_eq!(one("file.mtime > now() - \"1 week\"").len(), 0);
    let r = eval_base(
        "formulas:\n  dia: 'data.format(\"dddd, D [de] MMMM\")'\n  rel: data.relative()\nfilters: data\nviews:\n  - type: table\n    name: T\n    order: [formula.dia, formula.rel]\n    sort:\n      - property: data\n        direction: ASC\n",
        &query(None),
    );
    assert_eq!(
        r.groups[0].rows[0].cells[0],
        Cell::Text("terça-feira, 20 de maio".into())
    );
    // Moment's thresholds: 26 days and more are "a month".
    assert_eq!(r.groups[0].rows[0].cells[1], Cell::Text("há um mês".into()));
    assert_eq!(
        r.groups[0].rows[1].cells[1],
        Cell::Text("em 3 meses".into())
    );
}

#[test]
fn formulas_lists_and_summaries() {
    let r = eval_base(
        "filters: type == \"npc\"\nformulas:\n  dobro: nível * 2\n  rótulo: 'file.basename + \" (\" + formula.dobro + \")\"'\n  tags: file.tags.map(value.lower()).join(\" \")\nsummaries:\n  meu: values.filter(value > 5).length\nviews:\n  - type: table\n    name: T\n    order: [formula.rótulo, nível, formula.tags]\n    sort:\n      - property: file.name\n        direction: ASC\n    summaries:\n      nível: Sum\n      formula.rótulo: Filled\n",
        &query(None),
    );
    assert_eq!(r.problems, vec![]);
    let rows = &r.groups[0].rows;
    assert_eq!(rows[0].cells[0], Cell::Text("Grom (10)".into()));
    assert_eq!(
        rows[0].cells[2],
        Cell::Text("#anão #ferreiro #importante".into())
    );
    assert_eq!(
        r.groups[0].summaries,
        vec![Some(Cell::Number(3.0)), Some(Cell::Number(20.0)), None]
    );
    let r = eval_base(
        "filters: type == \"npc\"\nsummaries:\n  acima: values.filter(value > 4).length\nviews:\n  - type: table\n    name: T\n    order: [nível]\n    summaries:\n      nível: acima\n",
        &query(None),
    );
    assert_eq!(r.groups[0].summaries, vec![Some(Cell::Number(2.0))]);
}

#[test]
fn optional_arguments_left_out_are_left_out() {
    let r = eval_base(
        "formulas:\n  a: '\"a,b,c\".split(\",\").length'\n  b: '\"abcd\".slice(1)'\n  c: '[1,2,3].slice(-2)'\n  d: '\"a,b,c\".split(\",\", 2).length'\nfilters: file.name == \"Grom.md\"\nviews:\n  - type: table\n    name: T\n    order: [formula.a, formula.b, formula.c, formula.d]\n",
        &query(None),
    );
    assert_eq!(
        r.groups[0].rows[0].cells,
        vec![
            Cell::Number(3.0),
            Cell::Text("bcd".into()),
            Cell::List(vec![Cell::Number(2.0), Cell::Number(3.0)]),
            Cell::Number(2.0)
        ]
    );
}

#[test]
fn limit_counts_the_total_and_display_names_come_from_properties() {
    let r = eval_base(
        "properties:\n  nível:\n    displayName: Nível\nviews:\n  - type: list\n    name: L\n    limit: 2\n    order: [note.nível]\n    filters: type == \"npc\"\n",
        &query(Some("L")),
    );
    assert_eq!(r.total, 3);
    assert_eq!(paths(&r).len(), 2);
    assert_eq!(r.columns[0].name.as_deref(), Some("Nível"));
}

#[test]
fn what_cannot_be_evaluated_is_said_never_guessed() {
    let r = eval_base("filters: nada(1)\n", &query(None));
    assert_eq!(paths(&r).len(), 0);
    assert_eq!(r.problems[0].kind, ProblemKind::Evaluation);
    let r = eval_base("filters: 'a +'\n", &query(None));
    assert_eq!(r.problems[0].kind, ProblemKind::Expression);
    let r = eval_base(
        "formulas:\n  a: formula.b\n  b: formula.a\n  r: 'status.replace(/(?<=a)l/, \"b\")'\nfilters: type == \"npc\"\nviews:\n  - type: table\n    name: T\n    order: [formula.a, formula.r]\n",
        &query(None),
    );
    let cells = &r.groups[0].rows[0].cells;
    assert!(matches!(&cells[0], Cell::Error(e) if e.kind == EvalErrorKind::Cycle));
    // What the regular expressions' engine lacks (ADR 0094 item 2).
    assert!(
        matches!(&cells[1], Cell::Error(e) if e.kind == EvalErrorKind::RegexUnsupported && e.name == "lookbehind")
    );
    let r = eval_base("views:\n  - type: table\n    name: A\n", &query(Some("B")));
    assert_eq!(
        r.problems[0],
        Problem {
            kind: ProblemKind::UnknownView,
            detail: "B".into(),
            error: None,
        }
    );
    assert_eq!(r.view, Some(0));
}

#[test]
fn an_empty_base_lists_every_file_by_name() {
    let r = eval_base("", &query(None));
    assert_eq!(r.view, None);
    assert_eq!(r.total, VAULT.len());
    assert_eq!(r.columns[0].id, "file.name");
    // Natural order: Sessão 2 before Sessão 10.
    let p = paths(&r);
    let two = p.iter().position(|x| *x == "Sessões/Sessão 2.md");
    let ten = p.iter().position(|x| *x == "Sessões/Sessão 10.md");
    assert!(two < ten);
}

#[test]
fn the_budget_stops_a_formula_that_would_never_end() {
    let f = fixture();
    let resolver = |_: &str, t: &str| resolve_name(t);
    let notes = f.notes.iter().map(|(k, v)| (k.clone(), v)).collect();
    let facts = Facts::new(f.files.clone(), notes, f.links.clone(), &resolver);
    let base = parse_base(
        "formulas:\n  big: '\"x\".repeat(100000).split(\"\").map(\"y\".repeat(1000).split(\"\").map(value).length).length'\nviews:\n  - type: table\n    name: T\n    order: [formula.big]\n",
    );
    let started = std::time::Instant::now();
    let r = run_with(&base, &query(None), &facts, 200_000);
    assert!(started.elapsed().as_secs() < 10);
    assert!(r.problems.iter().any(|p| p.kind == ProblemKind::Budget));
    assert!(
        matches!(&r.groups[0].rows[0].cells[0], Cell::Error(e) if e.kind == EvalErrorKind::Budget)
    );
}

#[test]
fn a_summary_of_the_base_may_take_a_default_name() {
    let r = eval_base(
        "filters: type == \"npc\"\nsummaries:\n  Count: values.length * 10\nviews:\n  - type: table\n    name: T\n    order: [nível]\n    summaries:\n      nível: Count\n",
        &query(None),
    );
    let npcs = r.total as f64;
    assert_eq!(r.groups[0].summaries, vec![Some(Cell::Number(npcs * 10.0))]);
}

#[test]
fn links_to_no_file_are_equal_only_as_written() {
    let r = eval_base(
        "filters: type == \"npc\"\nformulas:\n  a: 'link(\"Nada\") == link(\"Nada\")'\n  b: 'link(\"Nada\") == link(\"nada\")'\n  c: 'link(\"Nada\") == \"nada\"'\nviews:\n  - type: table\n    name: T\n    order: [formula.a, formula.b, formula.c]\n",
        &query(None),
    );
    assert_eq!(
        r.groups[0].rows[0].cells[..3],
        [Cell::Bool(true), Cell::Bool(false), Cell::Bool(false)]
    );
}

#[test]
fn a_base_cannot_make_the_evaluation_outgrow_its_bounds() {
    let fx = fixture();
    let resolver = |_: &str, t: &str| resolve_name(t);
    let notes = fx.notes.iter().map(|(k, v)| (k.clone(), v)).collect();
    let facts = Facts::new(fx.files.clone(), notes, fx.links.clone(), &resolver);
    let formulas = [
        // A list doubled forty times.
        "[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40].reduce(acc + acc, [1]).length",
        // A one-letter pattern and a long replacement.
        "\"x\".repeat(100000).replace(\"x\", \"y\".repeat(100000))",
        // A long separator between many items.
        "\"x\".repeat(100000).split(\"\").join(\"y\".repeat(100000))",
        // A list nested a thousand deep.
        "\"x\".repeat(1000).split(\"\").reduce([acc], [])",
        // Every pair of a long list compared.
        "\"x\".repeat(100000).split(\"\").map(index).unique().length",
    ];
    for f in formulas {
        let base = parse_base(&format!(
            "filters: type == \"npc\"\nformulas:\n  f: '{f}'\nviews:\n  - type: table\n    name: T\n    order: [formula.f]\n"
        ));
        let started = std::time::Instant::now();
        let r = run_with(&base, &query(None), &facts, 5_000_000);
        assert!(started.elapsed().as_secs() < 10, "{f}");
        let cell = &r.groups[0].rows[0].cells[0];
        assert!(
            matches!(cell, Cell::Error(e) if matches!(e.kind, EvalErrorKind::TooLarge | EvalErrorKind::Budget)),
            "{f}: {cell:?}"
        );
    }
}

#[test]
fn a_chain_of_formulas_stops_at_the_depth_bound() {
    // On a thread with room to spare: a test's own thread has less stack
    // than the app's, and a test is built without optimizations.
    let r = std::thread::Builder::new()
        .stack_size(64 << 20)
        .spawn(|| {
            let mut yaml = String::from("filters: type == \"npc\"\nformulas:\n  f0: '1'\n");
            for i in 1..400 {
                yaml.push_str(&format!("  f{i}: formula.f{} + 1\n", i - 1));
            }
            yaml.push_str(
                "views:\n  - type: table\n    name: T\n    order: [formula.f399, formula.f50]\n",
            );
            eval_base(&yaml, &query(None))
        })
        .unwrap()
        .join()
        .unwrap();
    let cells = &r.groups[0].rows[0].cells;
    assert!(matches!(&cells[0], Cell::Error(e) if e.kind == EvalErrorKind::TooLarge));
    assert_eq!(cells[1], Cell::Number(51.0));
}

#[test]
fn a_sort_over_mixed_values_is_an_order() {
    // Numbers, a number that is not one, durations, texts and empties in
    // one column: the sort must not find a contradiction.
    let r = eval_base(
        "formulas:\n  k: 'if(file.name.contains(\"a\"), 0/0, if(file.name.contains(\"e\"), \"\", if(file.name.contains(\"o\"), duration(\"1M\"), file.name.length)))'\nviews:\n  - type: table\n    name: T\n    order: [formula.k]\n    sort:\n      - property: formula.k\n        direction: DESC\n",
        &query(None),
    );
    assert_eq!(r.total, VAULT.len());
}

#[test]
fn a_date_moved_past_the_calendar_stops_at_its_edge() {
    let r = eval_base(
        "filters: type == \"npc\"\nformulas:\n  far: 'date(\"2025-01-01\") + duration(\"99999999999 years\")'\n  back: 'date(\"2025-01-01\") - duration(\"99999999999 years\") - date(\"2025-01-01\")'\nviews:\n  - type: table\n    name: T\n    order: [formula.far, formula.back]\n",
        &query(None),
    );
    let cells = &r.groups[0].rows[0].cells;
    assert!(matches!(cells[0], Cell::Date { ms, .. } if ms == time::MAX_MS));
    assert!(matches!(cells[1], Cell::Number(n) if n < 0.0));
}

#[test]
fn a_query_within_folders_sees_only_what_is_under_them() {
    // The whole folder.
    let all = BaseQuery::default();
    assert!(all.sees("Segredo.md"));
    // A share of "Mesa" with its attachments folder (ADR 0081 item 11).
    let share = BaseQuery {
        within: vec!["Mesa".to_owned(), "Anexos".to_owned()],
        ..BaseQuery::default()
    };
    assert!(share.sees("Mesa"));
    assert!(share.sees("Mesa/Notas.md"));
    assert!(share.sees("Mesa/Sub/Funda.md"));
    assert!(share.sees("Anexos/p.png"));
    assert!(!share.sees("Segredo.md"));
    assert!(!share.sees("Mesa2/Fora.md"));
    assert!(!share.sees("Mesa.md"));
    assert!(!share.sees("Diario/Mesa/x.md"));
}

/// DL.2 = B (maintainer, 2026-10-21): a number in the frontmatter's `tags`
/// is the tag of its text, as in the index; a boolean or a float is none.
#[test]
fn a_number_in_tags_is_a_tag_in_a_base_as_in_the_index() {
    let facts = NoteFacts::of("---\ntags: [2025, yes, true, 1.5, \"7\"]\n---\nCorpo #2024 #x\n");
    assert_eq!(facts.tags, ["2025", "yes", "7", "x"]);
    assert_eq!(NoteFacts::of("---\ntags: 2024\n---\n").tags, ["2024"]);
}
