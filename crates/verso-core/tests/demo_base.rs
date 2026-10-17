// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The tutorial's base, evaluated by the core over the demo vault (ADR
//! 0058; ADR 0094, Consequences): its regular expression formula and its
//! map view, which the browser harness cannot evaluate. The vault is
//! copied through `verso-fs` (this crate's tests may not call `std::fs`).

use std::path::Path;

use verso_core::Workspace;
use verso_core::bases::{BaseQuery, Cell};

fn query(view: &str, extra: &[&str]) -> BaseQuery {
    BaseQuery {
        path: Some("Projetos.base".to_owned()),
        this: Some("Projetos.base".to_owned()),
        view: Some(view.to_owned()),
        extra: extra.iter().map(|s| (*s).to_owned()).collect(),
        lang: "pt-BR".to_owned(),
        ..BaseQuery::default()
    }
}

#[test]
fn the_tutorials_base_evaluates_its_regular_expression_and_its_map() {
    let demo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../demo-vault");
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let mut source = verso_fs::Root::open(&demo, vec![]).unwrap();
    let mut target = verso_fs::Root::open(vault.path(), vec![]).unwrap();
    let walk = source.walk();
    for e in walk
        .entries
        .iter()
        .filter(|e| e.kind != verso_fs::EntryKind::Directory)
    {
        let bytes = source.read(e.handle).unwrap().0;
        let _ = target.create(&e.relative, &bytes).unwrap();
    }
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let table = ws.query_base(&query("Todos os Projetos", &[])).unwrap();
    assert_eq!(table.problems, vec![], "{:?}", table.problems);
    let mes = table
        .columns
        .iter()
        .position(|c| c.id == "formula.mes")
        .unwrap();
    let rows = &table.groups[0].rows;
    assert_eq!(rows.len(), 3);
    for row in rows {
        assert_eq!(row.cells[mes], Cell::Text("09/2026".into()), "{}", row.path);
    }
    let map = ws.query_base(&query("Mapa", &["note.local"])).unwrap();
    assert_eq!(map.problems, vec![], "{:?}", map.problems);
    let at = map
        .columns
        .iter()
        .position(|c| c.id == "note.local")
        .unwrap();
    let places: Vec<&Cell> = map.groups[0].rows.iter().map(|r| &r.cells[at]).collect();
    assert_eq!(places.len(), 3);
    assert!(
        places.contains(&&Cell::Text("-23.5505, -46.6333".into())),
        "{places:?}"
    );
    assert!(
        places.contains(&&Cell::List(vec![
            Cell::Number(38.7223),
            Cell::Number(-9.1393)
        ])),
        "{places:?}"
    );
}
