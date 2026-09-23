// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The generator's determinism and shape, and the driver end to end on a
//! vault small enough for a test. This crate's `clippy.toml` allows the
//! `std::fs` reads: the files under test are its own, in a temporary
//! directory.

use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

use serde_json::{Value, json};
use verso_bench::generate::{self, FOLDERS, GENERATOR_VERSION, RARE_WORD, Shape};

#[cfg(test)]
mod support {
    use super::*;

    /// Every file under `root`, relative path and bytes, sorted.
    pub fn files(root: &Path) -> Vec<(String, Vec<u8>)> {
        fn walk(dir: &Path, root: &Path, out: &mut Vec<(String, Vec<u8>)>) {
            for entry in std::fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    walk(&path, root, out);
                } else {
                    let rel = path
                        .strip_prefix(root)
                        .unwrap()
                        .to_string_lossy()
                        .into_owned();
                    out.push((rel, std::fs::read(&path).unwrap()));
                }
            }
        }
        let mut out = Vec::new();
        walk(root, root, &mut out);
        out.sort();
        out
    }

    pub fn bench(args: &[&str], baseline: &Path) -> std::process::Output {
        Command::new(env!("CARGO_BIN_EXE_verso-bench"))
            .args(args)
            .arg("--baseline")
            .arg(baseline)
            .output()
            .unwrap()
    }

    pub fn json_lines(out: &std::process::Output) -> Vec<Value> {
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter(|l| l.starts_with('{'))
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }
}
use support::*;

#[test]
fn the_same_seed_writes_the_same_bytes_in_the_decided_shape() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let shape = Shape {
        notes: 300,
        seed: 7,
    };
    let va = generate::generate(a.path(), &shape).unwrap();
    let vb = generate::generate(b.path(), &shape).unwrap();
    let fa = files(a.path());
    assert_eq!(fa, files(b.path()));
    assert_eq!(va.most_linked, vb.most_linked);
    assert_eq!(GENERATOR_VERSION, 1);

    // 1 % placeholders, the rest notes; 37 folders; the rare word once.
    assert_eq!((va.notes, va.placeholders, va.to_change.len()), (297, 3, 3));
    assert_eq!(
        fa.iter().filter(|(p, _)| p.ends_with(".md.icloud")).count(),
        3
    );
    let folders: HashSet<&str> = fa.iter().filter_map(|(p, _)| p.split('/').next()).collect();
    assert_eq!(folders.len(), FOLDERS);
    let rare = fa
        .iter()
        .filter(|(_, bytes)| String::from_utf8_lossy(bytes).contains(RARE_WORD))
        .count();
    assert_eq!(rare, 1);
    assert!(va.most_linked.ends_with(".md"), "{}", va.most_linked);

    // Each note: ~4 KB, frontmatter, one heading, one ^id, four wikilinks.
    for (p, bytes) in fa.iter().filter(|(p, _)| p.ends_with(".md")) {
        assert!(
            (3_000..6_000).contains(&bytes.len()),
            "{p}: {} bytes",
            bytes.len()
        );
        let t = String::from_utf8_lossy(bytes);
        assert!(t.starts_with("---\ntags: [campanha, sessão, pasta-"), "{p}");
        assert_eq!(t.matches("\n# Sessão ").count(), 1, "{p}");
        assert_eq!(t.matches(" ^s").count(), 1, "{p}");
        assert_eq!(t.matches("[[").count(), 4, "{p}");
    }

    // Another seed, other links; the changed step rewrites exactly the 1 %.
    let c = tempfile::tempdir().unwrap();
    generate::generate(
        c.path(),
        &Shape {
            notes: 300,
            seed: 8,
        },
    )
    .unwrap();
    assert_ne!(fa, files(c.path()));
    assert_eq!(generate::change(&va).unwrap(), 3);
    assert_ne!(fa, files(a.path()));
}

#[test]
fn a_tiny_run_reports_the_seven_operations_and_a_regression_is_red() {
    let dir = tempfile::tempdir().unwrap();
    let baseline = dir.path().join("baselines.json");
    let common = ["--sizes", "100", "--reps", "1", "--machine", "test"];

    // Record: seven operations, sane results, seven entries in the file.
    let out = bench(&[&common[..], &["--record", "--json"]].concat(), &baseline);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let lines = json_lines(&out);
    let ops: Vec<&str> = lines
        .iter()
        .map(|l| l["operation"].as_str().unwrap())
        .collect();
    assert_eq!(
        ops,
        [
            "fresh_index",
            "index_unchanged",
            "index_changed",
            "search_common",
            "search_rare",
            "backlinks",
            "unresolved"
        ]
    );
    // 99 notes and one placeholder (the hundredth); the common word hits
    // the cap of 20; the rare word is in one note; the most-linked note
    // has backlinks.
    assert_eq!(lines[0]["result"], 99, "{}", lines[0]);
    assert_eq!(lines[1]["result"], 99);
    assert_eq!(lines[2]["result"], 99);
    assert_eq!(lines[3]["result"], 20);
    assert_eq!(lines[4]["result"], 1);
    assert!(lines[5]["result"].as_u64().unwrap() >= 1);
    assert!(lines[6]["result"].as_u64().unwrap() >= 1);
    assert!(lines[0]["index_bytes"].as_u64().unwrap() > 0);
    assert!(lines[0]["notes_per_s"].as_f64().unwrap() > 0.0);
    assert_eq!(lines[3]["notes_per_s"], Value::Null);
    assert_eq!(lines[0]["samples_ms"].as_array().unwrap().len(), 1);
    assert_eq!(lines[0]["generator"], 1);
    let text = std::fs::read_to_string(&baseline).unwrap();
    let recorded: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(recorded["entries"].as_array().unwrap().len(), 7);
    assert_eq!(recorded["entries"][0]["machine"], "test");

    // The same code against its own baseline: green.
    let out = bench(&common, &baseline);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(!String::from_utf8_lossy(&out.stdout).contains("REGRESSION"));

    // A baseline that says the index used to be one byte: red, exit 1,
    // the metric named. (Size has no noise, so this is deterministic.)
    let mut doctored = recorded;
    for e in doctored["entries"].as_array_mut().unwrap() {
        e["index_bytes"] = json!(1);
    }
    std::fs::write(&baseline, doctored.to_string()).unwrap();
    let out = bench(&common, &baseline);
    assert_eq!(out.status.code(), Some(1));
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        stdout.contains("REGRESSION 100 fresh_index index_bytes"),
        "{stdout}"
    );

    // Another machine: nothing to compare with, green, and it says so.
    let other = ["--sizes", "100", "--reps", "1", "--machine", "other"];
    let out = bench(&other, &baseline);
    assert!(out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("no baseline for machine other"));

    // Usage errors.
    let out = bench(&["--record"], &baseline);
    assert_eq!(out.status.code(), Some(2));
    let out = bench(&["--sizes", "0"], &baseline);
    assert_eq!(out.status.code(), Some(2));
}

#[test]
fn the_child_reports_the_index_size_as_it_is_once_the_connection_closes() {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault");
    let config = dir.path().join("config");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(&config).unwrap();
    generate::generate(
        &vault,
        &Shape {
            notes: 100,
            seed: 7,
        },
    )
    .unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_verso-bench"))
        .args(["--child", "fresh_index"])
        .arg(&vault)
        .arg(&config)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    let report: Value = serde_json::from_str(stdout.lines().last().unwrap()).unwrap();
    // What the process left behind: the index file, its write-ahead log
    // folded into it on close and gone. That size is the one reported —
    // measured with the connection open, the `-wal` beside it was left out.
    let left: Vec<std::path::PathBuf> = std::fs::read_dir(config.join("index"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    let index = left
        .iter()
        .find(|p| p.extension().is_some_and(|e| e == "sqlite"))
        .unwrap();
    assert!(
        !left.iter().any(|p| p.to_string_lossy().ends_with("-wal")),
        "{left:?}"
    );
    assert_eq!(
        report["index_bytes"].as_u64().unwrap(),
        std::fs::metadata(index).unwrap().len()
    );
}
