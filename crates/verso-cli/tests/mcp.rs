// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso mcp` end to end: the built binary is spawned as a client would
//! spawn it, spoken to in JSON-RPC over its stdin, and its stdout is read
//! line by line. The vault is built with `tempfile` (the `std::fs`
//! guardrail holds for tests); the configuration directory is a
//! temporary one through `VERSO_CONFIG_DIR`.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::{Value, json};
use tempfile::{Builder, NamedTempFile};

#[cfg(test)]
mod support {
    use super::*;

    pub fn note(dir: &Path, name: &str, content: &str) -> NamedTempFile {
        let mut file = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempfile_in(dir)
            .unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();
        file
    }

    /// A running `verso mcp`, spoken to one request at a time.
    pub struct Session {
        child: std::process::Child,
        stdin: Option<std::process::ChildStdin>,
        stdout: BufReader<std::process::ChildStdout>,
    }

    impl Session {
        pub fn start(vault: &Path, config: &Path) -> Self {
            let mut child = Command::new(env!("CARGO_BIN_EXE_verso"))
                .arg("mcp")
                .arg(vault)
                .env("VERSO_CONFIG_DIR", config)
                .env("VERSO_LANG", "en")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            let stdin = child.stdin.take();
            let stdout = BufReader::new(child.stdout.take().unwrap());
            Self {
                child,
                stdin,
                stdout,
            }
        }

        /// Send a request and read its response (a notification gets none).
        pub fn request(&mut self, r: &Value) -> Value {
            let stdin = self.stdin.as_mut().unwrap();
            writeln!(stdin, "{r}").unwrap();
            stdin.flush().unwrap();
            if r.get("id").is_none() {
                return Value::Null;
            }
            let mut line = String::new();
            loop {
                line.clear();
                assert!(
                    self.stdout.read_line(&mut line).unwrap() > 0,
                    "server closed stdout"
                );
                if line.trim().is_empty() {
                    continue;
                }
                let v: Value = serde_json::from_str(&line).unwrap();
                if v.get("id") == r.get("id") {
                    return v;
                }
            }
        }

        /// Send everything, in order; one response per request with an id.
        pub fn requests(&mut self, rs: &[Value]) -> Vec<Value> {
            rs.iter()
                .map(|r| self.request(r))
                .filter(|v| !v.is_null())
                .collect()
        }

        /// Close stdin: the server must end on its own, with exit 0.
        pub fn close(mut self) -> String {
            drop(self.stdin.take());
            let out = self.child.wait_with_output().unwrap();
            let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
            assert_eq!(out.status.code(), Some(0), "{stderr}");
            stderr
        }
    }

    pub fn initialize(version: &str) -> Vec<Value> {
        vec![
            json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":version,"capabilities":{},"clientInfo":{"name":"test","version":"0"}}}),
            json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
        ]
    }

    pub fn call(id: u64, name: &str, arguments: Value) -> Value {
        json!({"jsonrpc":"2.0","id":id,"method":"tools/call","params":{"name":name,"arguments":arguments}})
    }

    /// The structured content of a tool result.
    pub fn structured(v: &Value) -> &Value {
        &v["result"]["structuredContent"]
    }

    /// Does `schema` describe `value`? The part of JSON Schema these tools
    /// declare: `anyOf`, `type` (one name or a list), `properties` with
    /// `required`, `items`, and `$ref` into the root's `$defs`. Stricter
    /// than a validator in one respect: every key of an object must be a
    /// declared property, so a shape the schema does not know is caught.
    pub fn describes(root: &Value, schema: &Value, value: &Value) -> bool {
        if let Some(reference) = schema["$ref"].as_str() {
            let name = reference.trim_start_matches("#/$defs/");
            return describes(root, &root["$defs"][name], value);
        }
        if let Some(branches) = schema["anyOf"].as_array() {
            return branches.iter().any(|b| describes(root, b, value));
        }
        let of_type = |t: &str| match t {
            "object" => value.is_object(),
            "array" => value.is_array(),
            "string" => value.is_string(),
            "boolean" => value.is_boolean(),
            "integer" => value.is_i64() || value.is_u64(),
            "number" => value.is_number(),
            "null" => value.is_null(),
            _ => true,
        };
        let typed = match &schema["type"] {
            Value::String(t) => of_type(t),
            Value::Array(ts) => ts.iter().any(|t| t.as_str().is_some_and(of_type)),
            _ => true,
        };
        if !typed {
            return false;
        }
        if let (Some(properties), Some(object)) =
            (schema["properties"].as_object(), value.as_object())
        {
            let required: Vec<&str> = schema["required"]
                .as_array()
                .map_or_else(Vec::new, |r| r.iter().filter_map(Value::as_str).collect());
            return required.iter().all(|k| object.contains_key(*k))
                && object
                    .iter()
                    .all(|(k, v)| properties.get(k).is_some_and(|s| describes(root, s, v)));
        }
        if let (Some(items), Some(array)) = (schema.get("items"), value.as_array()) {
            return array.iter().all(|v| describes(root, items, v));
        }
        true
    }
}
use support::*;

#[test]
fn a_client_initializes_lists_the_tools_and_walks_the_graph() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _a = note(
        vault.path(),
        "Taverna.md",
        "# Taverna\n\nO [[Barão Vermelho]] bebe aqui. ^b1\n\n## Porão\n",
    );
    let _b = note(
        vault.path(),
        "Barão Vermelho.md",
        "Governa o distrito norte. Ver [[Taverna#Porão]] e [[Nada]].\n",
    );
    let _hidden = note(vault.path(), ".secreto.md", "escondido\n");

    let mut session = Session::start(vault.path(), config.path());
    let mut requests = initialize("2025-06-18");
    requests.extend([
        json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
        call(3, "search", json!({"words":"DISTRITO"})),
        call(4, "read_note", json!({"path":"Taverna"})),
        call(5, "links", json!({"path":"Barão Vermelho.md"})),
        call(6, "backlinks", json!({"path":"Taverna.md"})),
        call(7, "unresolved", json!({})),
        call(8, "list_notes", json!({})),
        call(9, "read_note", json!({"path":"../fora"})),
        call(10, "read_note", json!({"path":".secreto"})),
        call(11, "backlinks", json!({"path":"Nada"})),
        call(12, "index", json!({})),
        call(
            13,
            "read_note",
            json!({"path":"Taverna","from_line":3,"to_line":3}),
        ),
        // The confined path is the key and the echo (finding 2).
        call(14, "read_note", json!({"path":"./Taverna"})),
        call(15, "links", json!({"path":"Taverna/"})),
        call(16, "read_note", json!({"path":""})),
        // Windows that make no sense are refused, not answered empty (finding 5).
        call(17, "read_note", json!({"path":"Taverna","from_line":0})),
        call(18, "read_note", json!({"path":"Taverna","from_line":2000})),
        call(
            19,
            "read_note",
            json!({"path":"Taverna","from_line":4,"to_line":3}),
        ),
        call(20, "read_note", json!({"path":"Taverna","from_line":5})),
    ]);
    let r = session.requests(&requests);
    let stderr = session.close();
    assert_eq!(r.len(), 20, "{r:?}");
    // stderr carries the human line; stdout carried only the protocol.
    assert!(stderr.starts_with("verso mcp: serving "), "{stderr}");

    // initialize: a negotiated version and the server's name.
    assert_eq!(r[0]["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(r[0]["result"]["serverInfo"]["name"], "verso");
    assert!(
        r[0]["result"]["instructions"]
            .as_str()
            .unwrap()
            .contains("read-only")
    );

    // The seven tools, and nothing that writes a note.
    let mut names: Vec<&str> = r[1]["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    names.sort_unstable();
    assert_eq!(
        names,
        [
            "backlinks",
            "index",
            "links",
            "list_notes",
            "read_note",
            "search",
            "unresolved"
        ]
    );

    // Every tool declares an object schema (MCP asks for `type: object` at
    // the root) that describes what it answers — its errors included, so
    // a client that validates structured content accepts an `isError`
    // result as it accepts a success (finding 19).
    let tools = r[1]["result"]["tools"].as_array().unwrap();
    for t in tools {
        assert_eq!(t["outputSchema"]["type"], "object", "{}", t["name"]);
    }
    let schema_of = |name: &str| &tools.iter().find(|t| t["name"] == name).unwrap()["outputSchema"];
    for (i, tool) in [
        (2, "search"),
        (3, "read_note"),
        (8, "read_note"),
        (10, "backlinks"),
        (11, "index"),
    ] {
        let schema = schema_of(tool);
        assert!(
            describes(schema, schema, structured(&r[i])),
            "{tool}: {} is not described by {schema}",
            structured(&r[i])
        );
    }

    // search: accents and case folded, path relative with .md.
    let s = structured(&r[2]);
    assert_eq!(s["hits"][0]["path"], "Barão Vermelho.md");
    assert_eq!(s["truncated"], false);

    // read_note: numbered lines, headings, the ^id with its position, not stale.
    let n = structured(&r[3]);
    assert_eq!(n["path"], "Taverna.md");
    assert_eq!(n["line_count"], 5);
    assert_eq!(n["lines"][2]["n"], 3);
    assert_eq!(n["lines"][2]["text"], "O [[Barão Vermelho]] bebe aqui. ^b1");
    assert_eq!(n["blocks"][0]["id"], "b1");
    assert_eq!(n["blocks"][0]["line"], 3);
    assert_eq!(n["headings"][1]["text"], "Porão");
    assert_eq!(n["headings"][1]["line"], 5);
    assert_eq!(n["stale"], false);
    assert_eq!(n["unverified"], false);

    // links: resolved and unresolved, positions.
    let l = structured(&r[4]);
    assert_eq!(l["links"][0]["target"], "Taverna");
    assert_eq!(l["links"][0]["resolved"], "Taverna.md");
    assert_eq!(l["links"][0]["heading"], "Porão");
    assert_eq!(l["links"][1]["target"], "Nada");
    assert_eq!(l["links"][1]["resolved"], Value::Null);

    // backlinks of Taverna: one, from Barão Vermelho, line 1.
    let b = structured(&r[5]);
    assert_eq!(b["backlinks"][0]["from"], "Barão Vermelho.md");
    assert_eq!(b["backlinks"][0]["line"], 1);

    // unresolved: Nada, once.
    let u = structured(&r[6]);
    assert_eq!(u["unresolved"][0]["target"], "Nada");
    assert_eq!(u["unresolved"][0]["count"], 1);

    // list_notes: the hidden note is not there (ADR 0044).
    let ls = structured(&r[7]);
    assert_eq!(ls["notes"], json!(["Barão Vermelho.md", "Taverna.md"]));
    assert_eq!(ls["count"], 2);

    // Confinement on every path a client sends: `..` and a hidden entry
    // are refused — as tool errors the model reads, not protocol errors
    // (finding 3), typed by `kind`, echoing what was sent.
    assert_eq!(r[8]["result"]["isError"], true, "{:?}", r[8]);
    assert_eq!(structured(&r[8])["kind"], "refused");
    assert_eq!(structured(&r[8])["path"], "../fora");
    assert!(
        structured(&r[8])["message"]
            .as_str()
            .unwrap()
            .contains("`..`")
    );
    assert_eq!(r[9]["result"]["isError"], true);
    assert_eq!(structured(&r[9])["kind"], "refused");
    assert!(
        structured(&r[9])["message"]
            .as_str()
            .unwrap()
            .contains("hidden")
    );
    // A note the index does not know: named by its key.
    assert_eq!(r[10]["result"]["isError"], true);
    assert_eq!(structured(&r[10])["kind"], "unknown_note");
    assert_eq!(structured(&r[10])["path"], "Nada.md");

    // index: nothing changed since the start.
    let i = structured(&r[11]);
    assert_eq!(i["unchanged"], 2);
    assert_eq!(i["indexed"], 0);

    // A window of lines.
    let w = structured(&r[12]);
    assert_eq!(w["lines"].as_array().unwrap().len(), 1);
    assert_eq!(w["lines"][0]["n"], 3);
    assert_eq!(w["from_line"], 3);
    assert_eq!(w["to_line"], 3);
    assert_eq!(w["truncated"], false);

    // `./Taverna` is Taverna.md: the same key, the same positions, not
    // stale — before, the raw string reached the index and found nothing.
    let n = structured(&r[13]);
    assert_eq!(r[13]["result"]["isError"], false, "{:?}", r[13]);
    assert_eq!(n["path"], "Taverna.md");
    assert_eq!(n["stale"], false);
    assert_eq!(n["headings"].as_array().unwrap().len(), 2);
    assert_eq!(n["blocks"][0]["id"], "b1");
    let l = structured(&r[14]);
    assert_eq!(l["path"], "Taverna.md");
    assert_eq!(l["links"][0]["target"], "Barão Vermelho");
    // An empty path is refused as empty, not as a hidden `.md`.
    assert_eq!(structured(&r[15])["kind"], "refused");
    assert!(
        structured(&r[15])["message"]
            .as_str()
            .unwrap()
            .contains("empty")
    );
    // Bad windows, each with the reason and the note's length to re-ask.
    for (i, what) in [(16, "1-based"), (17, "5 lines"), (18, "before")] {
        assert_eq!(r[i]["result"]["isError"], true, "{:?}", r[i]);
        assert_eq!(structured(&r[i])["kind"], "bad_window", "{:?}", r[i]);
        assert_eq!(structured(&r[i])["path"], "Taverna.md");
        assert!(
            structured(&r[i])["message"]
                .as_str()
                .unwrap()
                .contains(what),
            "{:?}",
            r[i]
        );
    }
    // The last line alone: a window that reaches the end is not truncated.
    let w = structured(&r[19]);
    assert_eq!(w["lines"].as_array().unwrap().len(), 1);
    assert_eq!(w["lines"][0]["n"], 5);
    assert_eq!(w["truncated"], false);
}

#[test]
fn index_reports_a_walk_problem_as_the_object_the_cli_prints() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "um\n");
    let d = Builder::new()
        .prefix("d")
        .rand_bytes(0)
        .tempdir_in(vault.path())
        .unwrap();
    // A symlink loop, made as `chmod` is elsewhere in these tests: the
    // `std::fs` guardrail holds for tests too.
    let status = std::process::Command::new("ln")
        .args(["-s", ".", "loop"])
        .current_dir(d.path())
        .status()
        .unwrap();
    assert!(status.success());
    let mut session = Session::start(vault.path(), config.path());
    session.requests(&initialize("2025-06-18"));
    let r = session.request(&call(2, "index", json!({})));
    session.close();
    let p = &structured(&r)["problems"][0];
    assert_eq!(p["kind"], "loop", "{r:?}");
    assert_eq!(p["path"], "d/loop");
    assert!(p["first_seen"].is_string());
    assert!(p.get("error").is_none());
}

#[test]
fn a_placeholder_is_unavailable_and_an_edit_makes_read_note_stale() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "um\ndois\n");
    let _ph = note(vault.path(), ".Evicted.md.icloud", "<plist/>");
    let mut session = Session::start(vault.path(), config.path());
    let r = session.requests(&initialize("2025-03-26"));
    // An older protocol date is negotiated as asked.
    assert_eq!(r[0]["result"]["protocolVersion"], "2025-03-26");

    // Present, content unavailable: a tool error the model reads, never an
    // empty note (ADR 0043) — that is how the agent learns of the placeholder.
    let r = session.request(&call(2, "read_note", json!({"path":"Evicted"})));
    assert_eq!(r["result"]["isError"], true, "{r:?}");
    assert_eq!(structured(&r)["kind"], "unavailable");
    assert_eq!(structured(&r)["path"], "Evicted.md");
    assert!(
        structured(&r)["message"]
            .as_str()
            .unwrap()
            .contains("placeholder")
    );
    // Known to the index all the same, as a link target.
    let r = session.request(&call(3, "list_notes", json!({})));
    assert_eq!(structured(&r)["notes"], json!(["Evicted.md", "Nota.md"]));

    // Fresh now; edited through verso-fs while the server runs: the text
    // is the new one and `stale` says the graph is behind it, until
    // `index` catches up.
    let r = session.request(&call(4, "read_note", json!({"path":"Nota"})));
    assert_eq!(structured(&r)["stale"], false);
    {
        let mut root = verso_fs::Root::open(vault.path(), vec![]).unwrap();
        let h = root.handle(Path::new("Nota.md")).unwrap();
        let (_, stamp) = root.read(h).unwrap();
        let _ = root.write(h, b"um\ndois\ntr\xc3\xaas\n", &stamp).unwrap();
    }
    let r = session.request(&call(5, "read_note", json!({"path":"Nota"})));
    let n = structured(&r);
    assert_eq!(n["line_count"], 3);
    assert_eq!(n["stale"], true);
    let r = session.request(&call(6, "index", json!({})));
    assert_eq!(structured(&r)["indexed"], 1);
    let r = session.request(&call(7, "read_note", json!({"path":"Nota"})));
    assert_eq!(structured(&r)["stale"], false);
    session.close();
}

#[test]
fn an_empty_note_answers_an_empty_window() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _vazia = note(vault.path(), "Vazia.md", "");
    let mut session = Session::start(vault.path(), config.path());
    session.requests(&initialize("2025-06-18"));
    // No window asked: a note with no lines has no last line for `to_line`
    // to default to, and that was refused as a window that made no sense.
    let r = session.request(&call(2, "read_note", json!({"path":"Vazia"})));
    assert_eq!(r["result"]["isError"], false, "{r:?}");
    let n = structured(&r);
    assert_eq!(n["line_count"], 0);
    assert_eq!(n["lines"], json!([]));
    assert_eq!(n["from_line"], 1);
    assert_eq!(n["to_line"], 0);
    assert_eq!(n["truncated"], false);
    // A window that starts past the end is still refused, with the length.
    let r = session.request(&call(3, "read_note", json!({"path":"Vazia","from_line":2})));
    assert_eq!(structured(&r)["kind"], "bad_window", "{r:?}");
    assert!(
        structured(&r)["message"]
            .as_str()
            .unwrap()
            .contains("0 lines")
    );
    session.close();
}
