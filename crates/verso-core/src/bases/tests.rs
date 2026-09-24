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

struct Fixture {
    notes: HashMap<String, NoteFacts>,
    files: Vec<FileFacts>,
    links: Vec<(String, LinkFact)>,
}

fn fixture() -> Fixture {
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
fn resolve_name(target: &str) -> Option<String> {
    VAULT
        .iter()
        .map(|(p, _)| *p)
        .find(|p| {
            let name = p.rsplit('/').next().unwrap_or(p);
            name == target || name.strip_suffix(".md") == Some(target)
        })
        .map(str::to_owned)
}

fn query(view: Option<&str>) -> BaseQuery {
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

fn eval_base(yaml: &str, q: &BaseQuery) -> BaseResult {
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
        "formulas:\n  a: formula.b\n  b: formula.a\n  r: 'status.replace(/a/, \"b\")'\nfilters: type == \"npc\"\nviews:\n  - type: table\n    name: T\n    order: [formula.a, formula.r]\n",
        &query(None),
    );
    let cells = &r.groups[0].rows[0].cells;
    assert!(matches!(&cells[0], Cell::Error(e) if e.kind == EvalErrorKind::Cycle));
    assert!(matches!(&cells[1], Cell::Error(e) if e.kind == EvalErrorKind::Regex));
    let r = eval_base("views:\n  - type: table\n    name: A\n", &query(Some("B")));
    assert_eq!(
        r.problems[0],
        Problem {
            kind: ProblemKind::UnknownView,
            detail: "B".into()
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
