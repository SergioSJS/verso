// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso-bench`: the ladder of synthetic vaults, seven operations each,
//! medians against a recorded baseline (`docs/reference/bench-decision.md`,
//! decided 2026-09-22). Every measured operation runs in a child process —
//! this same binary in `--child` mode — wrapped in `/usr/bin/time`, so the
//! wall time is taken around the operation alone and the peak resident
//! memory is that process's, not the driver's (a process's peak cannot be
//! read per operation from inside it, and `getrusage` would need `unsafe`,
//! which the workspace forbids). Each repetition regenerates the vault, so
//! the page cache starts the same; the first repetition is a warm-up and is
//! discarded; the median is what is compared (§4.3).
//!
//! Exit 0: no regression, or nothing to compare with; 1: a regression
//! beyond the tolerances; 2: usage; 3: the run itself failed.

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use verso_bench::baseline::{self, Baselines, Entry};
use verso_bench::generate::{self, COMMON_WORD, DEFAULT_SEED, GENERATOR_VERSION, RARE_WORD, Shape};
use verso_core::Workspace;

const USAGE: &str = "usage: verso-bench [--sizes N,N,...] [--reps N] [--seed N] [--machine NAME]
                   [--baseline FILE] [--record] [--json]

  --sizes     notes per step of the ladder; default 1000,10000,50000
  --reps      measured repetitions per size, after one warm-up; default 3
  --seed      the generator's seed; default 20260922
  --machine   the baseline to compare with (and to record); no comparison without it
  --baseline  the baseline file; default crates/verso-bench/baselines.json
  --record    write this run's medians into the baseline for --machine
  --json      one JSON object per (size, operation) instead of the table

Run it in release: cargo run --release -p verso-bench -- ...";

/// The seven operations of bench-decision §3.1, in the order they run.
const OPERATIONS: [&str; 7] = [
    "fresh_index",
    "index_unchanged",
    "index_changed",
    "search_common",
    "search_rare",
    "backlinks",
    "unresolved",
];
const DEFAULT_SIZES: [usize; 3] = [1_000, 10_000, 50_000];
const DEFAULT_REPS: usize = 3;
const SEARCH_LIMIT: usize = 20;

/// What a child prints on its last line of stdout.
#[derive(Serialize, Deserialize)]
struct ChildReport {
    wall_ns: u128,
    index_bytes: u64,
    /// Notes indexed, hits, backlinks or unresolved targets: a sanity
    /// number, so a run that measured nothing is visible.
    result: u64,
}

/// One child run, as the driver keeps it.
#[derive(Clone)]
struct Sample {
    wall_ms: f64,
    peak_rss_bytes: Option<u64>,
    index_bytes: u64,
    result: u64,
}

/// One (size, operation), after the repetitions.
struct Measured {
    operation: &'static str,
    median_ms: f64,
    samples_ms: Vec<f64>,
    peak_rss_bytes: Option<u64>,
    index_bytes: u64,
    result: u64,
}

struct Options {
    sizes: Vec<usize>,
    reps: usize,
    seed: u64,
    machine: Option<String>,
    baseline: PathBuf,
    record: bool,
    json: bool,
}

enum Failure {
    Usage(String),
    Run(Box<dyn std::error::Error>),
}

impl<E: std::error::Error + 'static> From<E> for Failure {
    fn from(e: E) -> Self {
        Self::Run(Box::new(e))
    }
}

impl Failure {
    fn run(message: impl Into<String>) -> Self {
        Self::Run(message.into().into())
    }
}

fn parse(args: &[String]) -> Result<Options, Failure> {
    let mut o = Options {
        sizes: DEFAULT_SIZES.to_vec(),
        reps: DEFAULT_REPS,
        seed: DEFAULT_SEED,
        machine: None,
        baseline: Path::new(env!("CARGO_MANIFEST_DIR")).join("baselines.json"),
        record: false,
        json: false,
    };
    let mut it = args.iter();
    let value = |flag: &str, v: Option<&String>| {
        v.cloned()
            .ok_or_else(|| Failure::Usage(format!("{flag} needs a value")))
    };
    while let Some(a) = it.next() {
        match a.as_str() {
            "--sizes" => {
                o.sizes = value(a, it.next())?
                    .split(',')
                    .map(|s| s.trim().parse::<usize>())
                    .collect::<Result<_, _>>()
                    .map_err(|e| Failure::Usage(format!("--sizes: {e}")))?;
            }
            "--reps" => {
                o.reps = value(a, it.next())?
                    .parse()
                    .map_err(|e| Failure::Usage(format!("--reps: {e}")))?;
            }
            "--seed" => {
                o.seed = value(a, it.next())?
                    .parse()
                    .map_err(|e| Failure::Usage(format!("--seed: {e}")))?;
            }
            "--machine" => o.machine = Some(value(a, it.next())?),
            "--baseline" => o.baseline = PathBuf::from(value(a, it.next())?),
            "--record" => o.record = true,
            "--json" => o.json = true,
            other => return Err(Failure::Usage(format!("unknown argument {other}"))),
        }
    }
    if o.sizes.is_empty() || o.sizes.contains(&0) {
        return Err(Failure::Usage(
            "--sizes needs at least one size above 0".into(),
        ));
    }
    if o.reps == 0 {
        return Err(Failure::Usage("--reps needs at least 1".into()));
    }
    if o.record && o.machine.is_none() {
        return Err(Failure::Usage("--record needs --machine".into()));
    }
    Ok(o)
}

/// `--child OP VAULT CONFIG [ARG]`: open the workspace, do the one
/// operation, report. The timing wraps the open too, as `verso` does.
fn child(args: &[String]) -> Result<ChildReport, Failure> {
    let [op, vault, config, rest @ ..] = args else {
        return Err(Failure::Usage("--child OP VAULT CONFIG [ARG]".into()));
    };
    let arg = rest.first().map(String::as_str);
    let start = Instant::now();
    let mut ws = Workspace::open(Path::new(vault), Some(Path::new(config)))?;
    let result = match op.as_str() {
        "fresh_index" | "index_unchanged" | "index_changed" => {
            let r = ws.index()?;
            (r.indexed + r.unchanged) as u64
        }
        "search_common" | "search_rare" => {
            let words = arg.ok_or_else(|| Failure::run("search needs the words"))?;
            ws.search(words, SEARCH_LIMIT)?.len() as u64
        }
        "backlinks" => {
            let note = arg.ok_or_else(|| Failure::run("backlinks needs a note"))?;
            ws.backlinks(note)?.map_or(0, |b| b.len() as u64)
        }
        "unresolved" => ws.unresolved()?.len() as u64,
        other => return Err(Failure::run(format!("unknown operation {other}"))),
    };
    let wall_ns = start.elapsed().as_nanos();
    let index_bytes = std::fs::metadata(ws.index_path())?.len();
    Ok(ChildReport {
        wall_ns,
        index_bytes,
        result,
    })
}

/// `/usr/bin/time`'s flag for the peak resident set, when the binary is
/// there: `-l` on macOS (bytes), `-v` for GNU time (kbytes).
fn time_flag() -> Option<&'static str> {
    Path::new("/usr/bin/time")
        .is_file()
        .then_some(if cfg!(target_os = "macos") {
            "-l"
        } else {
            "-v"
        })
}

/// "maximum resident set size" as `/usr/bin/time` printed it, in bytes.
fn peak_rss_from(stderr: &str) -> Option<u64> {
    let line = stderr
        .lines()
        .find(|l| l.to_ascii_lowercase().contains("maximum resident set size"))?;
    let n: u64 = line
        .split(|c: char| !c.is_ascii_digit())
        .find(|s| !s.is_empty())?
        .parse()
        .ok()?;
    Some(if line.to_ascii_lowercase().contains("kbytes") {
        n * 1024
    } else {
        n
    })
}

fn run_child(
    op: &str,
    vault: &Path,
    config: &Path,
    arg: Option<&str>,
    time: Option<&str>,
) -> Result<Sample, Failure> {
    let exe = std::env::current_exe()?;
    let mut cmd = match time {
        Some(flag) => {
            let mut c = Command::new("/usr/bin/time");
            c.arg(flag).arg(&exe);
            c
        }
        None => Command::new(&exe),
    };
    cmd.arg("--child").arg(op).arg(vault).arg(config);
    if let Some(a) = arg {
        cmd.arg(a);
    }
    let out = cmd.stdin(Stdio::null()).output()?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        return Err(Failure::run(format!(
            "{op}: the child failed: {}",
            stderr.trim()
        )));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let last = stdout
        .lines()
        .rev()
        .find(|l| l.starts_with('{'))
        .ok_or_else(|| Failure::run(format!("{op}: the child printed no report")))?;
    let report: ChildReport = serde_json::from_str(last)?;
    Ok(Sample {
        wall_ms: report.wall_ns as f64 / 1e6,
        peak_rss_bytes: peak_rss_from(&stderr),
        index_bytes: report.index_bytes,
        result: report.result,
    })
}

fn median(values: &[f64]) -> f64 {
    let mut v = values.to_vec();
    v.sort_by(f64::total_cmp);
    match v.len() {
        0 => 0.0,
        n if n % 2 == 1 => v[n / 2],
        n => (v[n / 2 - 1] + v[n / 2]) / 2.0,
    }
}

/// One step of the ladder: `reps` measured repetitions after a warm-up,
/// each on a vault generated afresh and removed afterwards.
fn run_size(size: usize, o: &Options, time: Option<&str>) -> Result<Vec<Measured>, Failure> {
    let mut samples: Vec<Vec<Sample>> = vec![Vec::new(); OPERATIONS.len()];
    for rep in 0..=o.reps {
        let tmp =
            std::env::temp_dir().join(format!("verso-bench-{}-{size}-{rep}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let vault_dir = tmp.join("vault");
        let config = tmp.join("config");
        std::fs::create_dir_all(&vault_dir)?;
        std::fs::create_dir_all(&config)?;
        let vault = generate::generate(
            &vault_dir,
            &Shape {
                notes: size,
                seed: o.seed,
            },
        )?;
        let args: [Option<String>; 7] = [
            None,
            None,
            None,
            Some(COMMON_WORD.to_owned()),
            Some(RARE_WORD.to_owned()),
            Some(vault.most_linked.clone()),
            None,
        ];
        for (k, op) in OPERATIONS.iter().enumerate() {
            if *op == "index_changed" {
                generate::change(&vault)?;
            }
            let s = run_child(op, &vault_dir, &config, args[k].as_deref(), time)?;
            if rep > 0 {
                samples[k].push(s);
            }
        }
        std::fs::remove_dir_all(&tmp)?;
    }
    Ok(OPERATIONS
        .iter()
        .zip(samples)
        .map(|(op, s)| {
            let samples_ms: Vec<f64> = s.iter().map(|x| x.wall_ms).collect();
            let rss: Vec<f64> = s
                .iter()
                .filter_map(|x| x.peak_rss_bytes)
                .map(|b| b as f64)
                .collect();
            Measured {
                operation: op,
                median_ms: median(&samples_ms),
                samples_ms,
                peak_rss_bytes: (!rss.is_empty()).then(|| median(&rss) as u64),
                index_bytes: s.last().map_or(0, |x| x.index_bytes),
                result: s.last().map_or(0, |x| x.result),
            }
        })
        .collect())
}

fn commit() -> String {
    Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
        .unwrap_or_else(|| "unknown".to_owned())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn mib(bytes: u64) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

fn run(args: &[String]) -> Result<ExitCode, Failure> {
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("{USAGE}");
        return Ok(ExitCode::SUCCESS);
    }
    let o = parse(args)?;
    let time = time_flag();
    if time.is_none() {
        eprintln!("verso-bench: /usr/bin/time not found; peak memory will not be measured");
    }
    let commit = commit();
    let os = std::env::consts::OS;
    let mut baselines = Baselines::read(&o.baseline)?;
    let mut regressions = 0usize;
    for &size in &o.sizes {
        let measured = run_size(size, &o, time)?;
        let mut missing = false;
        for m in &measured {
            let is_index = m.operation.contains("index");
            let notes_per_s =
                (is_index && m.median_ms > 0.0).then(|| size as f64 / (m.median_ms / 1000.0));
            let entry = Entry {
                machine: o.machine.clone().unwrap_or_default(),
                os: os.to_owned(),
                generator: GENERATOR_VERSION,
                size,
                operation: m.operation.to_owned(),
                median_ms: m.median_ms,
                peak_rss_bytes: m.peak_rss_bytes,
                index_bytes: m.index_bytes,
                commit: commit.clone(),
                recorded_at: now_secs(),
            };
            let found = o
                .machine
                .as_deref()
                .and_then(|machine| baselines.find(machine, GENERATOR_VERSION, size, m.operation));
            let regs = found.map_or_else(Vec::new, |base| baseline::compare(&entry, base));
            missing |= o.machine.is_some() && found.is_none();
            if o.json {
                let regs: Vec<serde_json::Value> = regs
                    .iter()
                    .map(|r| {
                        serde_json::json!({"metric": r.metric, "now": r.now, "baseline": r.baseline, "tolerance": r.tolerance})
                    })
                    .collect();
                println!(
                    "{}",
                    serde_json::json!({
                        "generator": GENERATOR_VERSION,
                        "machine": o.machine,
                        "os": os,
                        "commit": commit,
                        "size": size,
                        "operation": m.operation,
                        "median_ms": m.median_ms,
                        "samples_ms": m.samples_ms,
                        "peak_rss_bytes": m.peak_rss_bytes,
                        "index_bytes": m.index_bytes,
                        "notes_per_s": notes_per_s,
                        "result": m.result,
                        "regressions": regs,
                    })
                );
            } else {
                let rss = m
                    .peak_rss_bytes
                    .map_or_else(|| "     n/a".to_owned(), |b| format!("{:8.1}", mib(b)));
                let nps = notes_per_s.map_or_else(String::new, |n| format!("  {n:8.0} notes/s"));
                println!(
                    "{size:>6} {:<16} median {:>9.1} ms  rss {rss} MiB  index {:7.2} MiB  result {:>6}{nps}",
                    m.operation,
                    m.median_ms,
                    mib(m.index_bytes),
                    m.result
                );
            }
            for r in &regs {
                regressions += 1;
                println!(
                    "REGRESSION {size} {} {}: {:.1} against {:.1} in the baseline (more than {}x)",
                    m.operation, r.metric, r.now, r.baseline, r.tolerance
                );
            }
            if o.record {
                baselines.record(entry);
            }
        }
        if missing && !o.record {
            eprintln!(
                "verso-bench: no baseline for machine {}, generator {GENERATOR_VERSION}, size {size}: run with --record to take one",
                o.machine.as_deref().unwrap_or("")
            );
        }
    }
    if o.record {
        baselines.write(&o.baseline)?;
        eprintln!("verso-bench: baseline recorded in {}", o.baseline.display());
    }
    Ok(if regressions > 0 {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    })
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--child") {
        return match child(args.get(1..).unwrap_or(&[])) {
            Ok(report) => {
                println!("{}", serde_json::to_string(&report).unwrap_or_default());
                ExitCode::SUCCESS
            }
            Err(Failure::Usage(m)) => {
                eprintln!("verso-bench child: {m}");
                ExitCode::from(2)
            }
            Err(Failure::Run(e)) => {
                eprintln!("verso-bench child: {e}");
                ExitCode::from(3)
            }
        };
    }
    match run(&args) {
        Ok(code) => code,
        Err(Failure::Usage(m)) => {
            eprintln!("verso-bench: {m}\n\n{USAGE}");
            ExitCode::from(2)
        }
        Err(Failure::Run(e)) => {
            eprintln!("verso-bench: {e}");
            ExitCode::from(3)
        }
    }
}
