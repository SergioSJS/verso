// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The cases the browser's copy of this engine is held to (ADR 0092 item 1:
//! "no second protocol"). The window kept offline in a browser cannot run
//! `verso-core`, so `app/ui/src/web/offline/engine.ts` writes the same rules
//! in TypeScript; this file makes the cases — pictures of the files here,
//! there and in the base, and the plan, the conflict names, the joins of two
//! appends that this engine answers to them — and
//! `app/ui/test/offlineEngine.test.mjs` holds the TypeScript to every one.
//! The cases are deterministic, so that this test fails when the checked-in
//! file is not what this engine says today: the engine changed (the browser's
//! copy changes with it) or the file was edited by hand.
//!
//! To write the file again, after an engine change that is meant:
//!
//! ```text
//! cargo test -p verso-core sync::vectors::print -- --ignored --nocapture \
//!   | sed -n '/^==== BEGIN/,/^==== END/p' | sed '1d;$d' > app/ui/test/sync-vectors.json
//! ```

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::{
    Action, FileState, Files, State, append_merge, conflict_name, merges_by_append, plan,
    template_merge,
};

const CHECKED_IN: &str = include_str!("../../../../app/ui/test/sync-vectors.json");

/// A small deterministic generator: the cases are the same on every run.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % n as u64).unwrap_or(0)
    }
}

/// Two spellings of one name (composed and decomposed), two that differ
/// in case, and the plain ones.
const PATHS: [&str; 10] = [
    "a.md",
    "b.md",
    "pasta/c.md",
    "d.png",
    "Caf\u{e9}.md",
    "Cafe\u{301}.md",
    "Nota.md",
    "nota.md",
    "e/f.md",
    "z.txt",
];
const HASHES: [&str; 4] = ["h1", "h2", "h3", "h4"];

fn picture(rng: &mut Rng, fill: usize) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for p in PATHS {
        if rng.below(10) < fill {
            out.insert(p.to_owned(), HASHES[rng.below(HASHES.len())].to_owned());
        }
    }
    out
}

fn files(m: &BTreeMap<String, String>) -> Files {
    m.iter()
        .map(|(p, h)| {
            (
                p.clone(),
                FileState {
                    hash: h.clone(),
                    size: h.len() as u64,
                },
            )
        })
        .collect()
}

/// A picture as the vectors write it: path, hash, size, in the engine's
/// (byte) order.
fn pairs(m: &BTreeMap<String, String>) -> Value {
    Value::Array(
        m.iter()
            .map(|(p, h)| json!({"path": p, "hash": h, "size": h.len()}))
            .collect(),
    )
}

fn action(a: &Action) -> Value {
    match a {
        Action::Upload { path, base } => json!({"t": "upload", "path": path, "base": base}),
        Action::Download { path, hash } => json!({"t": "download", "path": path, "hash": hash}),
        Action::DeleteRemote { path, base } => {
            json!({"t": "deleteRemote", "path": path, "base": base})
        }
        Action::DeleteLocal { path } => json!({"t": "deleteLocal", "path": path}),
        Action::RenameRemote { from, to, base } => {
            json!({"t": "renameRemote", "from": from, "to": to, "base": base})
        }
        Action::RenameLocal { from, to } => json!({"t": "renameLocal", "from": from, "to": to}),
        Action::Conflict { path, copy, hash } => {
            json!({"t": "conflict", "path": path, "copy": copy, "hash": hash})
        }
        Action::Agree { path, hash } => json!({"t": "agree", "path": path, "hash": hash}),
    }
}

const DEVICE: &str = "Fone da Ana";
const WHEN: &str = "2026-10-15 09.30";

fn plans() -> Vec<Value> {
    let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
    let mut out = Vec::new();
    for n in 0..560 {
        // Every third case is a first sync (no base); the last sixty are a
        // folder that lost files on one side (a drive not mounted), for
        // the pause of item 9.
        let fill = 3 + rng.below(6);
        let (local, remote, base) = if n >= 500 {
            let base = picture(&mut rng, 9);
            let mut gone = base.clone();
            gone.retain(|_, _| rng.below(3) != 0);
            if n % 2 == 0 {
                (gone, base.clone(), base)
            } else {
                (base.clone(), gone, base)
            }
        } else {
            let local = picture(&mut rng, fill);
            let remote = picture(&mut rng, fill);
            let base = if n % 3 == 0 {
                BTreeMap::new()
            } else {
                picture(&mut rng, fill)
            };
            (local, remote, base)
        };
        let confirmed = rng.below(2) == 0;
        let pt = rng.below(2) == 0;
        let state = State {
            base: base.clone(),
            ..State::default()
        };
        let p = plan(
            &files(&local),
            &files(&remote),
            &state,
            confirmed,
            false,
            &|path: &str, taken: &BTreeSet<String>| conflict_name(path, DEVICE, WHEN, pt, taken),
        );
        out.push(json!({
            "local": pairs(&local),
            "remote": pairs(&remote),
            "base": base.iter().map(|(p, h)| json!({"path": p, "hash": h})).collect::<Vec<_>>(),
            "confirmed": confirmed,
            "pt": pt,
            "actions": p.actions.iter().map(action).collect::<Vec<_>>(),
            "pause": p.pause,
            "held": p.held.iter().map(|h| json!({"path": h.path, "here": h.here, "case": h.case})).collect::<Vec<_>>(),
        }));
    }
    out
}

fn names() -> Vec<Value> {
    let paths = [
        "a.md",
        "pasta/b.md",
        "sem-extensao",
        ".oculto",
        "x/y/z.tar.gz",
        "Caf\u{e9}.md",
        "e\u{301}.md",
    ];
    let devices = [
        "Fone da Ana",
        "iPhone/12: <teste>",
        "",
        "  espa\u{e7}o  ",
        "um nome muito comprido que passa de quarenta caracteres sem problema algum",
        "\u{1f4f1} fone",
    ];
    let mut out = Vec::new();
    for (i, path) in paths.iter().enumerate() {
        for (j, device) in devices.iter().enumerate() {
            let pt = (i + j) % 2 == 0;
            // None taken, then the first name taken, then the first two (the
            // second in the other case, as a folding file system holds it).
            let first = conflict_name(path, device, WHEN, pt, &BTreeSet::new());
            let second = conflict_name(path, device, WHEN, pt, &BTreeSet::from([first.clone()]));
            let third = conflict_name(
                path,
                device,
                WHEN,
                pt,
                &BTreeSet::from([first.to_uppercase(), second.clone()]),
            );
            out.push(json!({
                "path": path, "device": device, "pt": pt, "when": WHEN,
                "first": first, "second": second, "third": third,
                "taken": [first.to_uppercase(), second],
            }));
        }
    }
    out
}

fn hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

const LINES: [&str; 6] = [
    "# T\u{ed}tulo\n",
    "um paragrafo\n",
    "- item\n",
    "\n",
    "fim sem quebra",
    "outra linha com \u{e7}\n",
];

fn text(rng: &mut Rng, lines: usize) -> String {
    let mut out = String::new();
    for _ in 0..lines {
        out.push_str(LINES[rng.below(LINES.len())]);
    }
    out
}

fn merges() -> Vec<Value> {
    let mut rng = Rng(0x1234_5678_9abc_def1);
    let mut out = Vec::new();
    for n in 0..420 {
        let k = rng.below(5);
        let base = text(&mut rng, k);
        let mut local = base.clone();
        let mut remote = base.clone();
        // Mostly two appends; now and then an edit in the middle, an empty
        // side, or an append to a note with no newline at its end.
        match n % 6 {
            0..=2 => {
                let (a, b) = (1 + rng.below(3), 1 + rng.below(3));
                local.push_str(&text(&mut rng, a));
                remote.push_str(&text(&mut rng, b));
            }
            3 => {
                let (a, b) = (rng.below(3), rng.below(4));
                local.push_str(&text(&mut rng, a));
                remote = text(&mut rng, b);
            }
            4 => {
                local = format!("X{local}");
                remote.push_str(&text(&mut rng, 1));
            }
            _ => {
                local.push_str("\n\nmais");
                remote.push_str("\n\noutra");
            }
        }
        let wrong = rng.below(5) == 0;
        let base_hash = if wrong {
            hex(b"another base")
        } else {
            hex(base.as_bytes())
        };
        let joined = append_merge(&base_hash, local.as_bytes(), remote.as_bytes());
        // The same two versions, joined over a template: a side may add
        // nothing.
        let template_hash = hex(base.as_bytes());
        let by_template = template_merge(&template_hash, local.as_bytes(), remote.as_bytes());
        out.push(json!({
            "base": base_hash,
            "template": template_hash,
            "local": local,
            "remote": remote,
            "append": joined.map(|b| String::from_utf8_lossy(&b).into_owned()),
            "templated": by_template.map(|b| String::from_utf8_lossy(&b).into_owned()),
        }));
    }
    out
}

fn md() -> Vec<Value> {
    [
        "a.md",
        "A.MD",
        "pasta/b.Md",
        ".md",
        "x.mdx",
        "md",
        "a.png",
        "d/.md",
    ]
    .iter()
    .map(|p| json!({"path": p, "merges": merges_by_append(p)}))
    .collect()
}

fn vectors() -> Value {
    json!({
        "about": "Made by the Rust engine (crates/verso-core/src/sync/vectors.rs); the browser's copy of it (app/ui/src/web/offline/engine.ts) is held to every case by app/ui/test/offlineEngine.test.mjs. Do not edit by hand.",
        "device": DEVICE,
        "when": WHEN,
        "plans": plans(),
        "names": names(),
        "merges": merges(),
        "md": md(),
    })
}

fn render() -> String {
    let mut text = serde_json::to_string(&vectors()).unwrap_or_default();
    text.push('\n');
    text
}

#[test]
fn the_browsers_vectors_are_the_engines() {
    assert_eq!(
        render(),
        CHECKED_IN,
        "app/ui/test/sync-vectors.json is not what the engine says: the engine changed (then the \
         browser's copy, app/ui/src/web/offline/engine.ts, must change with it) or the file was \
         edited; write it again as this file's header says"
    );
}

#[test]
#[ignore = "writes the vectors to the output: see the header"]
fn print() {
    println!("==== BEGIN\n{}==== END", render());
}
