// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table is a campaign folder (ADR 0110), against a running server: the
//! game master turns the folder into a table, a player invited as a reader
//! sees only what is released, and tries every door to the rest. One test
//! per path a player reads by (ADR 0110 item 18), as ADR 0087's did for
//! secret blocks: the list of commands, the room, sync, the files under
//! `/f/`, the events, the boards, the table's own entries; then the
//! grants on every write path, the closed table and the limits.

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use crate::db::Role;
use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, folder_id, get, next, sign_in, start,
};

/// Words and names only the hidden notes and files hold. The name of a
/// hidden note written in a link without an alias is drawn as the text of
/// the link with a lock (MC.4 = B): that is by design, and `Barão Zq` and
/// `Cripta Zq` are not on this list; the path, the folder, the headings and
/// ids, the words are, and the name of a note whose name is a secret.
const LEAKS: &[&str] = &[
    "Mundo Zq",
    "Cripta Zq.md",
    "Mapa Zq",
    "Barão Zq.md",
    "zqbody",
    "zqtag",
    "zqhead",
    "zqid",
    "zqcripta",
    "zqmapa",
    "zqfechado",
];

const ABERTA: &str = "# Aberta\n\nVeja [[Barão Zq]], [[Mundo Zq/Cripta Zq|um lugar]], [[Mapa Zq]] e [[Livre]].\n\n![[Mundo Zq/Cripta Zq#^zqid]]\n\n![[aberto.png]]\n\n#aberta\n";
const LIVRE: &str = "Livre palavrachave\n";
const BARAO: &str = "zqbody do barão palavrachave #zqtag\n[[Aberta]]\n";
const CRIPTA: &str = "# Cripta Zq\n\n## Zqhead\n\nzqcripta ^zqid\n";
const MAPA: &str = "zqmapa\n";
pub(crate) const PNG: &str = "iVBORw0KGgo=";
const BOARD: &str = r#"{"nodes":[{"id":"1","type":"file","file":"Barão Zq.md","x":0,"y":0,"width":100,"height":100},{"id":"2","type":"text","text":"ver [[Barão Zq]] zqboard","x":0,"y":0,"width":100,"height":100},{"id":"3","type":"file","file":"Livre.md","x":0,"y":0,"width":100,"height":100}],"edges":[]}"#;

/// A socket and the ids of its requests.
pub(crate) struct Win {
    pub(crate) ws: Socket,
    n: u64,
}

impl Win {
    pub(crate) async fn open(r: &Running, b: &Browser, id: &str) -> (Self, Value) {
        let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let info = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        (Self { ws, n: 10 }, info)
    }

    pub(crate) async fn call(&mut self, cmd: &str, args: Value) -> Value {
        self.n += 1;
        call(&mut self.ws, self.n, cmd, args).await
    }

    /// The same, every message heard on the way checked for what a player
    /// must not hear.
    pub(crate) async fn ask(&mut self, cmd: &str, args: Value) -> Value {
        self.n += 1;
        let id = self.n;
        self.ws
            .send(Message::Text(
                json!({ "id": id, "cmd": cmd, "args": args })
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        loop {
            let m = tokio::time::timeout(std::time::Duration::from_secs(30), self.ws.next())
                .await
                .expect("an answer in time")
                .unwrap()
                .unwrap();
            let text = match m {
                Message::Text(t) => t.to_string(),
                Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
                _ => continue,
            };
            clean(&format!("{cmd} (or an event before its answer)"), &text);
            let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            if v.get("id").and_then(Value::as_u64) == Some(id) {
                return v;
            }
        }
    }

    /// What the window hears for `ms` milliseconds, unchecked: after a
    /// release the note is the player's.
    pub(crate) async fn hear(&mut self, ms: u64) -> Vec<Value> {
        let mut out = Vec::new();
        let until = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
        while let Ok(Some(Ok(m))) = tokio::time::timeout_at(until, self.ws.next()).await {
            if let Message::Text(t) = m {
                out.push(serde_json::from_str(&t).unwrap_or(Value::Null));
            }
        }
        out
    }

    /// What the window hears for `ms` milliseconds, each message checked.
    pub(crate) async fn listen(&mut self, ms: u64) -> Vec<Value> {
        let mut out = Vec::new();
        let until = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
        while let Ok(Some(Ok(m))) = tokio::time::timeout_at(until, self.ws.next()).await {
            if let Message::Text(t) = m {
                clean("an event", &t);
                out.push(serde_json::from_str(&t).unwrap_or(Value::Null));
            }
        }
        out
    }
}

fn clean(what: &str, text: &str) {
    let all = crate::tests_secret::heard(text);
    for s in LEAKS {
        assert!(!all.contains(s), "{what}: {s:?} reached a player: {text}");
    }
}

pub(crate) fn strings(v: &Value) -> Vec<String> {
    let mut out: Vec<String> = v
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .filter_map(|x| x.as_str().map(str::to_owned))
        .collect();
    out.sort();
    out
}

/// The cast: the folder's owner, a player (Ana, a reader of the folder)
/// and a second player (Bia).
pub(crate) struct Mesa {
    pub(crate) r: Running,
    pub(crate) id: String,
    pub(crate) admin: Browser,
    pub(crate) owner: Win,
    pub(crate) ana: Win,
    pub(crate) ana_id: String,
    pub(crate) bia: Win,
    pub(crate) bia_id: String,
}

/// A folder with the notes above, made a table; Aberta and Livre released,
/// "Mapa Zq" with a secret name. The players have it open.
pub(crate) async fn mesa() -> Mesa {
    let r = start().await;
    let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &admin).await;
    let (mut owner, _) = Win::open(&r, &admin, &id).await;
    for (name, text) in [
        ("Aberta", ABERTA),
        ("Livre", LIVRE),
        ("Barão Zq", BARAO),
        ("Mundo Zq/Cripta Zq", CRIPTA),
        ("Mapa Zq", MAPA),
    ] {
        let made = owner
            .call("create_note", json!({ "name": name, "text": text }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
    }
    for path in ["Anexos/aberto.png", "Anexos/zqfechado.png"] {
        let made = owner
            .call("create_file", json!({ "path": path, "base64": PNG }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
    }
    let made = owner
        .call(
            "create_file",
            json!({ "path": "Tabuleiro.canvas", "base64": base64::engine::general_purpose::STANDARD.encode(BOARD) }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    // The walk sees the files the commands made.
    let walked = owner.call("reindex", json!({})).await;
    assert!(walked.get("ok").is_some(), "{walked}");
    let made = owner.call("campaign_make", json!({ "root": "" })).await;
    assert_eq!(made["ok"]["viewer"], "owner", "{made}");
    let released = owner
        .call(
            "campaign_release",
            json!({ "paths": ["Aberta.md", "Livre.md"], "released": true }),
        )
        .await;
    assert!(released.get("ok").is_some(), "{released}");
    let secret = owner
        .call(
            "campaign_secret_name",
            json!({ "path": "Mapa Zq.md", "on": true }),
        )
        .await;
    assert!(secret.get("ok").is_some(), "{secret}");
    // The players come after the table is made: what it keeps from them was
    // never theirs (a reader who had a file before the table is told it went).
    let mut people = Vec::new();
    for (email, name, password) in [
        ("ana@casa.lan", "Ana", "a senha da ana"),
        ("bia@casa.lan", "Bia", "a senha da bia"),
    ] {
        let a = r
            .server
            .db
            .create_account(email, name, "pt", Some(password), false)
            .unwrap();
        r.server.db.grant(&id, &a.id, Role::Reader).unwrap();
        people.push((email, password, a.id));
    }
    let (e, p, ana_id) = &people[0];
    let b = sign_in(&r, e, p).await;
    let (ana, o) = Win::open(&r, &b, &id).await;
    assert!(o.get("ok").is_some(), "{o}");
    let (e, p, bia_id) = &people[1];
    let b = sign_in(&r, e, p).await;
    let (bia, o) = Win::open(&r, &b, &id).await;
    assert!(o.get("ok").is_some(), "{o}");
    Mesa {
        r,
        id,
        admin,
        owner,
        ana,
        ana_id: ana_id.clone(),
        bia,
        bia_id: bia_id.clone(),
    }
}

#[test]
fn only_the_owner_makes_a_folder_a_table_and_it_can_be_undone() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (mut owner, _) = Win::open(&r, &admin, &id).await;
        let a = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &a.id, Role::Reader).unwrap();
        let b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let (mut ana, _) = Win::open(&r, &b, &id).await;
        // A player runs none of the game master's commands.
        for (cmd, args) in [
            ("campaign_make", json!({ "root": "" })),
            ("campaign_unmake", json!({ "root": "" })),
            ("campaign_settings", json!({ "root": "", "open": false })),
            (
                "campaign_release",
                json!({ "paths": ["Sessao.md"], "released": true }),
            ),
            ("campaign_release_all", json!({ "root": "" })),
            (
                "campaign_secret_name",
                json!({ "path": "Sessao.md", "on": true }),
            ),
            (
                "campaign_grant",
                json!({ "path": "Sessao.md", "grant": { "kind": "group" } }),
            ),
            ("campaign_invite", json!({ "root": "" })),
        ] {
            let refused = ana.call(cmd, args).await;
            assert_eq!(refused["err"]["kind"], "refused", "{cmd}: {refused}");
        }
        assert_eq!(
            ana.call("campaign_status", json!({})).await["ok"]["viewer"],
            "none"
        );
        // The owner makes it, and a folder that is not there is refused.
        let bad = owner
            .call("campaign_make", json!({ "root": "NaoExiste" }))
            .await;
        assert_eq!(bad["err"]["kind"], "refused", "{bad}");
        for root in ["../x", "/x", ".oculta"] {
            let bad = owner.call("campaign_make", json!({ "root": root })).await;
            assert_eq!(bad["err"]["kind"], "refused", "{root}: {bad}");
        }
        let made = owner.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(made["ok"]["tables"][0]["root"], "", "{made}");
        assert_eq!(made["ok"]["tables"][0]["open"], true);
        assert_eq!(made["ok"]["tables"][0]["log_max"], 20_000);
        assert_eq!(made["ok"]["tables"][0]["image_max"], 10 * 1024 * 1024);
        // Every note starts hidden (MC.2 = A): the player sees none.
        assert_eq!(
            ana.call("list_notes", json!({})).await["ok"],
            json!([]),
            "notes hidden by default"
        );
        // A player's status: a player, the table, no notes to edit.
        let status = ana.call("campaign_status", json!({})).await;
        assert_eq!(status["ok"]["viewer"], "player", "{status}");
        assert_eq!(status["ok"]["players"], json!([]));
        assert_eq!(status["ok"]["notes"], json!([]));
        // "Release all", then undone: the player sees every note again, as
        // a reader of an ordinary folder.
        owner
            .call("campaign_release_all", json!({ "root": "" }))
            .await;
        assert_eq!(
            strings(&ana.call("list_notes", json!({})).await["ok"]),
            ["Sessao.md"]
        );
        let hidden = owner
            .call(
                "campaign_release",
                json!({ "paths": ["Sessao.md"], "released": false }),
            )
            .await;
        assert!(hidden.get("ok").is_some(), "{hidden}");
        assert_eq!(ana.call("list_notes", json!({})).await["ok"], json!([]));
        let undone = owner.call("campaign_unmake", json!({ "root": "" })).await;
        assert_eq!(undone["ok"]["viewer"], "none", "{undone}");
        assert_eq!(
            strings(&ana.call("list_notes", json!({})).await["ok"]),
            ["Sessao.md"]
        );
        // The note's file was never touched.
        assert_eq!(r.campanha_text("Sessao.md"), "# Sessao\n");
    });
}

#[test]
fn a_closed_table_keeps_its_players_out_and_not_its_owner() {
    block_on(async {
        let mut m = mesa().await;
        // Open: Ana reads, then the owner closes it.
        assert!(
            m.ana
                .call("list_notes", json!({}))
                .await
                .get("ok")
                .is_some()
        );
        let closed = m
            .owner
            .call("campaign_settings", json!({ "root": "", "open": false }))
            .await;
        assert_eq!(closed["ok"]["tables"][0]["open"], false, "{closed}");
        // The player in the table is sent out and every command of it is
        // refused as the table is.
        let gone = m.ana.listen(300).await;
        assert!(
            gone.iter()
                .any(|e| e["gone"] == "folder" && e["reason"] == "closed"),
            "{gone:?}"
        );
        let refused = m.ana.call("list_notes", json!({})).await;
        assert!(refused.get("err").is_some(), "{refused}");
        // Opening it again answers "a mesa está fechada".
        let b = sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        let (_, opened) = Win::open(&m.r, &b, &m.id).await;
        assert_eq!(opened["err"]["message"], "a mesa está fechada", "{opened}");
        // The files route says the same, the folder list still names it.
        let (status, _) = get(&m.r, &format!("/f/{}/Anexos/aberto.png", m.id), Some(&b)).await;
        assert_eq!(status, 403);
        // The owner always enters; and opens it.
        assert!(
            m.owner
                .call("list_notes", json!({}))
                .await
                .get("ok")
                .is_some()
        );
        let (mut again, o) = Win::open(&m.r, &m.admin, &m.id).await;
        assert!(o.get("ok").is_some(), "{o}");
        assert_eq!(
            again.call("campaign_status", json!({})).await["ok"]["tables"][0]["open"],
            false
        );
        let open = m
            .owner
            .call("campaign_settings", json!({ "root": "", "open": true }))
            .await;
        assert_eq!(open["ok"]["tables"][0]["open"], true);
        // The player shut out hears it at once (not at the next try), the
        // owner's own window does not get the news of its own act.
        let heard = m.ana.listen(300).await;
        assert!(
            heard
                .iter()
                .any(|e| e["event"] == "table-opened" && e["payload"]["folder"] == m.id.as_str()),
            "{heard:?}"
        );
        let own = m.owner.listen(100).await;
        assert!(own.iter().all(|e| e["event"] != "table-opened"), "{own:?}");
        let (mut ana, o) = Win::open(&m.r, &b, &m.id).await;
        assert!(o.get("ok").is_some(), "{o}");
        assert!(ana.call("list_notes", json!({})).await.get("ok").is_some());
    });
}

/// 2026-10-23: the game master pressed "make a table" and saved a limit on
/// a table that existed; a player found it closed. Neither command closes
/// a table, and a closed one stays closed through both.
#[test]
fn making_a_table_again_and_changing_limits_leave_open_alone() {
    block_on(async {
        let mut m = mesa().await;
        let made = m.owner.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(made["ok"]["tables"][0]["open"], true, "{made}");
        let sets = m
            .owner
            .call("campaign_settings", json!({ "root": "", "logMax": 5000 }))
            .await;
        assert_eq!(sets["ok"]["tables"][0]["open"], true, "{sets}");
        m.owner
            .call("campaign_settings", json!({ "root": "", "open": false }))
            .await;
        let made = m.owner.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(made["ok"]["tables"][0]["open"], false, "{made}");
        let sets = m
            .owner
            .call(
                "campaign_settings",
                json!({ "root": "", "open": null, "imageMax": 2_097_152 }),
            )
            .await;
        assert_eq!(sets["ok"]["tables"][0]["open"], false, "{sets}");
    });
}

/// ADR 0110 item 18: every read path of a player, one by one.
#[test]
fn a_hidden_note_is_not_in_the_lists_a_player_reads() {
    block_on(async {
        let mut m = mesa().await;
        let owner_notes = strings(&m.owner.call("list_notes", json!({})).await["ok"]);
        assert_eq!(
            owner_notes.len(),
            6,
            "the owner sees every note: {owner_notes:?}"
        );
        let ana = &mut m.ana;
        // list notes, files, folders, entries.
        assert_eq!(
            strings(&ana.ask("list_notes", json!({})).await["ok"]),
            ["Aberta.md", "Livre.md"]
        );
        assert_eq!(
            strings(&ana.ask("list_files", json!({})).await["ok"]),
            ["Anexos/aberto.png"],
            "an attachment only a released note links"
        );
        let folders = strings(&ana.ask("list_folders", json!({})).await["ok"]);
        assert!(folders.contains(&"Anexos".to_owned()), "{folders:?}");
        assert!(!folders.iter().any(|f| f.contains("Mundo")), "{folders:?}");
        let entries = ana.ask("list_entries", json!({})).await;
        let mut paths: Vec<&str> = entries["ok"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|e| e["path"].as_str())
            .filter(|p| !p.is_empty())
            .collect();
        paths.sort_unstable();
        assert_eq!(
            paths,
            ["Aberta.md", "Anexos", "Anexos/aberto.png", "Livre.md"],
            "{entries}"
        );
        // search: the words only a hidden note holds are nowhere, the
        // words of a released note are found.
        assert_eq!(
            ana.ask("search", json!({ "words": "zqbody", "limit": 20 }))
                .await["ok"],
            json!([])
        );
        let found = ana
            .ask("search", json!({ "words": "palavrachave", "limit": 20 }))
            .await;
        let hits: Vec<&str> = found["ok"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|h| h["path"].as_str())
            .collect();
        assert_eq!(hits, ["Livre.md"], "{found}");
        // the note's name: quick open searches names too.
        assert_eq!(
            ana.ask("search", json!({ "words": "Cripta", "limit": 20 }))
                .await["ok"],
            json!([])
        );
        // graph and backlinks, tags, block ids, mentions.
        // Only the edge between two released notes.
        assert_eq!(
            ana.ask("graph", json!({})).await["ok"],
            json!([{ "from": "Aberta.md", "to": "Livre.md" }])
        );
        assert_eq!(
            ana.ask("backlinks", json!({ "path": "Aberta.md" })).await["ok"],
            json!([]),
            "the hidden note that links to it is no backlink"
        );
        let tags = ana.ask("list_tags", json!({})).await;
        assert_eq!(tags["ok"].as_array().map(Vec::len), Some(1), "{tags}");
        assert_eq!(tags["ok"][0]["name"], "aberta");
        let blocks = ana
            .ask(
                "list_block_ids",
                json!({ "kinds": ["table", "list", "paragraph"] }),
            )
            .await;
        assert!(!blocks.to_string().contains("zqid"), "{blocks}");
        let unresolved = ana.ask("graph_unresolved", json!({})).await;
        assert!(unresolved.get("ok").is_some(), "{unresolved}");
        // the attachments: the one a released note embeds resolves, the
        // other does not.
        assert_eq!(
            ana.ask(
                "resolve_attachment",
                json!({ "source": "Aberta.md", "target": "aberto.png" })
            )
            .await["ok"],
            "Anexos/aberto.png"
        );
        assert_eq!(
            ana.ask(
                "resolve_attachment",
                json!({ "source": "Aberta.md", "target": "zqfechado.png" })
            )
            .await["ok"],
            Value::Null
        );
        // the size of the folder counts what the player sees.
        let space = ana.ask("folder_space", json!({})).await;
        assert_eq!(space["ok"]["files"], 3, "{space}");
        // the summary of the folder counts what the player sees.
        let info = ana.ask("current_folder", json!({})).await;
        assert_eq!(info["ok"]["index"]["unchanged"], 2, "{info}");
        assert_eq!(info["ok"]["index"]["problems"], json!([]));
        // focuses are the game master's.
        let focuses = ana.ask("get_focuses", json!({})).await;
        assert_eq!(focuses["ok"]["focuses"], json!([]), "{focuses}");
        ana.listen(200).await;
    });
}

#[test]
fn a_hidden_note_answers_as_a_note_that_does_not_exist() {
    block_on(async {
        let mut m = mesa().await;
        for cmd in [
            "read_note",
            "read_text",
            "read_file_text",
            "links",
            "backlinks",
        ] {
            let hidden = m.ana.ask(cmd, json!({ "path": "Barão Zq.md" })).await;
            let absent = m.ana.ask(cmd, json!({ "path": "Barão Xx.md" })).await;
            // The same answer, but for the name the player typed.
            let said = |v: &Value| {
                v.to_string()
                    .replace("Barão Zq.md", "N")
                    .replace("Barão Xx.md", "N")
            };
            assert_eq!(
                said(&hidden["err"].clone()),
                said(&absent["err"].clone()),
                "{cmd}: hidden {hidden} / absent {absent}"
            );
            assert_eq!(hidden["ok"], absent["ok"], "{cmd}");
        }
        // Under another spelling of the path.
        for path in ["./Barão Zq.md", "barão zq.md", "Mundo Zq/../Barão Zq.md"] {
            let r = m.ana.ask("read_note", json!({ "path": path })).await;
            assert!(r.get("err").is_some(), "{path}: {r}");
        }
        let hidden = m
            .ana
            .ask("unlinked_mentions", json!({ "path": "Mapa Zq.md" }))
            .await;
        let absent = m
            .ana
            .ask("unlinked_mentions", json!({ "path": "Mapa Xx.md" }))
            .await;
        assert_eq!(hidden["ok"], absent["ok"]);
        for cmd in ["map_open", "board_preview"] {
            let hidden = m
                .ana
                .ask(cmd, json!({ "path": "Barão Zq.md", "json": "{}" }))
                .await;
            assert!(
                hidden.get("ok").is_none() || hidden["ok"].is_null(),
                "{cmd}: {hidden}"
            );
        }
        // The owner reads it.
        let whole = m
            .owner
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert!(whole["ok"]["text"].as_str().unwrap().contains("zqbody"));
    });
}

#[test]
fn a_link_to_a_hidden_note_is_text_with_a_lock_in_what_a_player_reads() {
    block_on(async {
        let mut m = mesa().await;
        let note = m.ana.ask("read_note", json!({ "path": "Aberta.md" })).await;
        let text = note["ok"]["text"].as_str().unwrap();
        assert!(text.contains("Barão Zq 🔒"), "{text}");
        assert!(text.contains("um lugar 🔒"), "an alias is shown: {text}");
        assert!(text.contains("▒▒▒▒"), "a secret name: {text}");
        assert!(
            text.contains("[[Livre]]"),
            "a released note stays a link: {text}"
        );
        assert!(text.contains("🔒 ("), "an embed of a hidden note: {text}");
        assert!(text.contains("![[aberto.png]]"));
        // What is derived from the text is derived from this one.
        let html = note["ok"]["html"].as_str().unwrap();
        assert!(!html.contains("Cripta") && !html.contains("Mapa"), "{html}");
        assert!(note["ok"]["headings"].as_array().unwrap().len() == 1);
        // The links command says the same, and resolves none of them.
        let links = m.ana.ask("links", json!({ "path": "Aberta.md" })).await;
        let shown: Vec<(String, bool)> = links["ok"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| {
                (
                    l["target"].as_str().unwrap().to_owned(),
                    l["resolved"].is_null(),
                )
            })
            .collect();
        assert!(shown.contains(&("Barão Zq".to_owned(), true)), "{shown:?}");
        assert!(shown.contains(&("um lugar".to_owned(), true)), "{shown:?}");
        assert!(shown.contains(&("▒▒▒▒".to_owned(), true)), "{shown:?}");
        // The file as read as text and as bytes.
        let t = m.ana.ask("read_text", json!({ "path": "Aberta.md" })).await;
        assert_eq!(t["ok"]["text"], note["ok"]["text"]);
        let f = m
            .ana
            .ask("read_file_text", json!({ "path": "Aberta.md" }))
            .await;
        assert_eq!(f["ok"], note["ok"]["text"]);
        // Released later, the link is a link again, to everyone.
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": ["Barão Zq.md"], "released": true }),
            )
            .await;
        let again = m
            .ana
            .call("read_note", json!({ "path": "Aberta.md" }))
            .await;
        assert!(
            again["ok"]["text"]
                .as_str()
                .unwrap()
                .contains("[[Barão Zq]]")
        );
        let barao = m
            .ana
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert!(barao["ok"]["text"].as_str().unwrap().contains("zqbody"));
        // The owner's text is the file's.
        let mine = m
            .owner
            .call("read_note", json!({ "path": "Aberta.md" }))
            .await;
        assert_eq!(mine["ok"]["text"], ABERTA);
    });
}

/// A player's served text never holds a hidden note's path, whatever the
/// notes around it write: generated notes, every way to write a link.
#[test]
fn a_players_text_never_holds_a_hidden_notes_path_or_words() {
    block_on(async {
        let mut m = mesa().await;
        let forms = [
            "[[Mundo Zq/Cripta Zq]]",
            "[[Cripta Zq#Zqhead]]",
            "[[Mundo Zq/Cripta Zq.md#^zqid|alias]]",
            "![[Cripta Zq]]",
            "![[Mundo Zq/Cripta Zq#Zqhead]]",
            "[x](Mundo%20Zq/Cripta%20Zq.md)",
            "![](Mundo Zq/Cripta Zq.md)",
            "[[Mapa Zq]]",
            "![[Mapa Zq]]",
            "[[Mapa Zq|outro nome]]",
            "[[Barão Zq.md]]",
        ];
        let around = ["", "> ", "- ", "# ", "| a | ", "**", "`", "_"];
        let mut seed: u64 = 11;
        let mut next_n = move || {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (seed >> 33) as usize
        };
        let mut paths = Vec::new();
        for i in 0..12 {
            let mut text = String::from("---\nrel: \"[[Mundo Zq/Cripta Zq]]\"\n---\n");
            for _ in 0..(1 + next_n() % 5) {
                text.push_str(around[next_n() % around.len()]);
                text.push_str(forms[next_n() % forms.len()]);
                text.push_str(" fim\n");
            }
            let name = format!("Gerada {i}");
            let made = m
                .owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
            paths.push(format!("{name}.md"));
        }
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": paths, "released": true }),
            )
            .await;
        for p in &paths {
            let n = m.ana.ask("read_note", json!({ "path": p })).await;
            assert!(n.get("ok").is_some(), "{n}");
            for f in [
                m.ana.ask("read_text", json!({ "path": p })).await,
                m.ana.ask("links", json!({ "path": p })).await,
                m.ana.ask("read_file_text", json!({ "path": p })).await,
            ] {
                assert!(f.get("ok").is_some(), "{f}");
            }
        }
        for w in ["Cripta", "Zqhead", "zqcripta", "alias"] {
            let found = m
                .ana
                .ask("search", json!({ "words": w, "limit": 50 }))
                .await;
            assert!(found.get("ok").is_some(), "{found}");
        }
        // And what a device syncs.
        let state = m.ana.ask("sync_state", json!({})).await;
        for f in state["ok"]["files"].as_array().unwrap() {
            let p = f["path"].as_str().unwrap();
            if paths.iter().any(|q| q == p) {
                let read = m
                    .ana
                    .ask("sync_read", json!({ "path": p, "offset": 0 }))
                    .await;
                assert!(read.get("ok").is_some(), "{read}");
            }
        }
        m.ana.listen(200).await;
    });
}

#[test]
fn a_board_card_of_a_hidden_note_is_locked_for_a_player() {
    block_on(async {
        let mut m = mesa().await;
        // The board is hidden itself until released.
        let hidden = m
            .ana
            .ask("read_text", json!({ "path": "Tabuleiro.canvas" }))
            .await;
        assert!(hidden.get("err").is_some(), "{hidden}");
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": ["Tabuleiro.canvas"], "released": true }),
            )
            .await;
        let board = m
            .ana
            .ask("read_text", json!({ "path": "Tabuleiro.canvas" }))
            .await;
        let json: Value = serde_json::from_str(board["ok"]["text"].as_str().unwrap()).unwrap();
        let nodes = json["nodes"].as_array().unwrap();
        assert_eq!(nodes[0]["type"], "text", "{json}");
        assert!(
            nodes[0]["text"].as_str().unwrap().starts_with("🔒"),
            "{json}"
        );
        assert!(nodes[0].get("file").is_none());
        assert!(
            nodes[1]["text"].as_str().unwrap().contains("Barão Zq 🔒"),
            "{json}"
        );
        assert_eq!(nodes[2]["file"], "Livre.md", "a released note's card stays");
        // The owner's board is the file.
        let mine = m
            .owner
            .call("read_text", json!({ "path": "Tabuleiro.canvas" }))
            .await;
        assert!(mine["ok"]["text"].as_str().unwrap().contains("Barão Zq.md"));
    });
}

#[test]
fn no_command_of_the_contract_hands_a_player_a_hidden_note() {
    block_on(async {
        let mut m = mesa().await;
        let reaching = json!({
            "id": m.id, "path": "Barão Zq.md", "words": "zqbody", "limit": 50, "since": 0,
            "offset": 0, "name": "Barão Zq", "text": "nada", "json": "{}", "notation": "1d6",
            "source": "Barão Zq.md", "target": "Mundo Zq/Cripta Zq", "key": "nenhuma",
            "keep": "disk", "at": "", "update": "", "builtinIgnores": true, "gitignore": true,
            "level": "INFO", "message": "x", "revision": "x", "from": "Barão Zq.md",
            "to": "Outra.md", "paths": ["Barão Zq.md"], "folder": "", "base64": "",
            "enabled": false, "focuses": [], "stamp": null, "days": 30, "root": "",
            "released": true, "on": false, "grant": { "kind": "group" },
            "query": {
                "text": "views:\n  - type: table\n    name: T\n    order: [file.name, file.tags, file.links, file.size]\n",
                "extra": [], "now": 0, "offset": 0, "lang": "en"
            },
        });
        let listed = |cmd: &str| {
            verso_service::reader::READER_COMMANDS
                .iter()
                .any(|(c, _)| *c == cmd)
                || crate::readers::SERVER_READS.iter().any(|(c, _)| *c == cmd)
        };
        for cmd in crate::tests_secret::every_command() {
            let answer = m.ana.ask(&cmd, reaching.clone()).await;
            if answer.get("ok").is_some() {
                assert!(
                    listed(&cmd),
                    "a player may call {cmd}: say how it answers a reader (ADR 0087, ADR 0110)"
                );
            }
        }
        // Nothing changed for the owner's table by what it tried.
        let status = m.owner.call("campaign_status", json!({})).await;
        assert_eq!(
            status["ok"]["notes"].as_array().unwrap().len(),
            3,
            "{status}"
        );
        m.ana.listen(300).await;
    });
}

#[test]
fn the_files_route_serves_a_player_only_what_a_released_note_opens() {
    block_on(async {
        let m = mesa().await;
        let b = sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        let id = &m.id;
        let (open, _) = get(&m.r, &format!("/f/{id}/Anexos/aberto.png"), Some(&b)).await;
        assert_eq!(open, 200);
        for path in [
            "Anexos/zqfechado.png",
            "Barão Zq.md",
            "Mundo Zq/Cripta Zq.md",
            "Anexos/../Anexos/zqfechado.png",
            "Tabuleiro.canvas",
        ] {
            let (status, _) = get(&m.r, &format!("/f/{id}/{path}"), Some(&b)).await;
            assert_eq!(status, 404, "{path}");
        }
        let (gone, _) = get(&m.r, &format!("/f/{id}/Anexos/nunca.png"), Some(&b)).await;
        assert_eq!(gone, 404, "a hidden file answers as a missing one");
        // The owner is sent them all.
        let (mine, _) = get(
            &m.r,
            &format!("/f/{id}/Anexos/zqfechado.png"),
            Some(&m.admin),
        )
        .await;
        assert_eq!(mine, 200);
    });
}

#[test]
fn what_a_players_device_syncs_follows_the_releases() {
    block_on(async {
        let mut m = mesa().await;
        let files = |state: &Value| -> Vec<String> {
            let mut v: Vec<String> = state["ok"]["files"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| f["path"].as_str().unwrap().to_owned())
                .collect();
            v.sort();
            v
        };
        let state = m.ana.ask("sync_state", json!({})).await;
        let seen = files(&state);
        assert!(
            seen.contains(&"Aberta.md".to_owned()) && seen.contains(&"Livre.md".to_owned()),
            "{seen:?}"
        );
        assert!(seen.contains(&"Anexos/aberto.png".to_owned()), "{seen:?}");
        for hidden in [
            "Barão Zq.md",
            "Mapa Zq.md",
            "Anexos/zqfechado.png",
            "Tabuleiro.canvas",
        ] {
            assert!(!seen.contains(&hidden.to_owned()), "{hidden} in {seen:?}");
        }
        // The log a new device replays names none of them either.
        let log = m.ana.ask("sync_changes", json!({ "since": 0 })).await;
        let head = log["ok"]["head"].as_i64().unwrap();
        let named: Vec<&str> = log["ok"]["changes"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|c| c["path"].as_str())
            .collect();
        for hidden in ["Barão Zq.md", "Mapa Zq.md", "Tabuleiro.canvas"] {
            assert!(!named.contains(&hidden), "{hidden} in the log {named:?}");
        }
        // The bytes of a released note are the veiled text.
        let piece = m
            .ana
            .ask("sync_read", json!({ "path": "Aberta.md", "offset": 0 }))
            .await;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(piece["ok"]["data"].as_str().unwrap())
            .unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(
            text.contains("Barão Zq 🔒") && !text.contains("[[Barão Zq]]"),
            "{text}"
        );
        let shown = &seen.iter().filter(|p| *p == "Aberta.md").count();
        assert_eq!(*shown, 1);
        // A hidden file is refused by every name.
        for p in ["Barão Zq.md", "Anexos/zqfechado.png"] {
            let r = m
                .ana
                .ask("sync_read", json!({ "path": p, "offset": 0 }))
                .await;
            assert!(r.get("err").is_some(), "{p}: {r}");
        }
        // Released: the next change is the note, with its veiled hash.
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": ["Barão Zq.md"], "released": true }),
            )
            .await;
        let events = m.ana.hear(300).await;
        assert!(
            events.iter().any(|e| e["event"] == "sync-changed"),
            "{events:?}"
        );
        // And it is told as a folder is told, of the note it now has.
        assert!(
            events.iter().any(|e| e["event"] == "folder-changed"
                && e["payload"]["changed"] == json!(["Barão Zq.md"])),
            "{events:?}"
        );
        let after = m.ana.call("sync_changes", json!({ "since": head })).await;
        let new: Vec<(&str, bool)> = after["ok"]["changes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| (c["path"].as_str().unwrap(), c["deleted"].as_bool().unwrap()))
            .collect();
        assert!(new.contains(&("Barão Zq.md", false)), "{new:?}");
        let got = m
            .ana
            .call("sync_read", json!({ "path": "Barão Zq.md", "offset": 0 }))
            .await;
        assert!(got.get("ok").is_some(), "{got}");
        // The file written again with the same bytes (its time moves, its
        // hash does not) keeps what the device was told of it.
        let w = m
            .owner
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        let text = w["ok"]["text"].as_str().unwrap().to_owned();
        let same = m
            .owner
            .call(
                "write_note",
                json!({ "path": "Barão Zq.md", "text": text, "revision": w["ok"]["revision"] }),
            )
            .await;
        assert!(same.get("ok").is_some(), "{same}");
        // Hidden again: the device is told to let it go.
        let head = after["ok"]["head"].as_i64().unwrap();
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": ["Barão Zq.md"], "released": false }),
            )
            .await;
        let later = m.ana.call("sync_changes", json!({ "since": head })).await;
        let gone: Vec<(&str, bool)> = later["ok"]["changes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| (c["path"].as_str().unwrap(), c["deleted"].as_bool().unwrap()))
            .collect();
        assert!(gone.contains(&("Barão Zq.md", true)), "{gone:?}");
        let state = m.ana.call("sync_state", json!({})).await;
        assert!(!files(&state).contains(&"Barão Zq.md".to_owned()));
        // The owner's device sees the folder whole.
        let mine = m.owner.call("sync_state", json!({})).await;
        assert!(files(&mine).contains(&"Barão Zq.md".to_owned()));
    });
}

#[test]
fn a_hidden_note_never_comes_up_in_a_room_or_an_event_of_a_player() {
    block_on(async {
        let mut m = mesa().await;
        let refused = m
            .ana
            .ask("collab_join", json!({ "path": "Barão Zq.md" }))
            .await;
        assert_eq!(refused["err"]["kind"], "not_found", "{refused}");
        for cmd in ["collab_present", "collab_leave"] {
            let r = m.ana.ask(cmd, json!({ "path": "Barão Zq.md" })).await;
            assert!(
                r.get("ok").is_none() || r["ok"] == Value::Bool(false) || r["ok"].is_null(),
                "{cmd}: {r}"
            );
        }
        // A released note's room is the player's own document, veiled.
        let joined = m
            .ana
            .ask("collab_join", json!({ "path": "Aberta.md" }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let text = crate::tests_secret::heard(&joined.to_string());
        assert!(text.contains("Barão Zq 🔒"), "{text}");
        let mine = m
            .owner
            .call("collab_join", json!({ "path": "Aberta.md" }))
            .await;
        let whole = crate::tests_secret::heard(&mine.to_string());
        assert!(whole.contains("[[Barão Zq]]"), "{whole}");
        // The owner edits the hidden note: the player hears nothing.
        let w = m
            .owner
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        let written = m
            .owner
            .call(
                "write_note",
                json!({ "path": "Barão Zq.md", "text": "zqbody mudou", "revision": w["ok"]["revision"] }),
            )
            .await;
        assert!(written.get("ok").is_some(), "{written}");
        let heard = m.ana.listen(900).await;
        assert!(
            !heard.iter().any(|e| e["event"] == "folder-changed"
                && e["payload"]["changed"].to_string().contains("Bar")),
            "{heard:?}"
        );
        // Released: the room closes for the player, who joins again over
        // the new text.
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": ["Barão Zq.md"], "released": true }),
            )
            .await;
        let heard = m.ana.hear(300).await;
        assert!(
            heard.iter().any(|e| e["event"] == "collab-closed"),
            "{heard:?}"
        );
        let again = m
            .ana
            .call("collab_join", json!({ "path": "Aberta.md" }))
            .await;
        assert!(crate::tests_secret::heard(&again.to_string()).contains("[[Barão Zq]]"));
    });
}

#[test]
fn the_table_does_not_tell_a_player_the_note_a_roll_was_made_in() {
    block_on(async {
        let mut m = mesa().await;
        for ws in [&mut m.owner, &mut m.ana] {
            let joined = ws
                .call("table_join", json!({ "color": "#3b82f6", "styles": null }))
                .await;
            assert!(joined.get("ok").is_some(), "{joined}");
        }
        let rolled = m
            .owner
            .call(
                "table_roll",
                json!({ "notation": "1d20", "source": null, "path": "Barão Zq.md", "secret": false, "styles": null }),
            )
            .await;
        assert!(rolled.get("ok").is_some(), "{rolled}");
        let entry = m.ana.listen(400).await;
        assert!(
            entry.iter().any(|e| e["event"] == "table-entry"),
            "the roll reaches the player: {entry:?}"
        );
        let page = m
            .ana
            .ask("table_history", json!({ "before": null, "limit": 20 }))
            .await;
        assert!(
            page["ok"]["entries"]
                .as_array()
                .unwrap()
                .iter()
                .all(|e| e["path"].is_null()),
            "{page}"
        );
        // The owner is told it.
        let mine = m
            .owner
            .call("table_history", json!({ "before": null, "limit": 20 }))
            .await;
        assert!(mine.to_string().contains("Barão Zq.md"), "{mine}");
    });
}

#[test]
fn an_image_at_the_table_is_seen_by_everyone_at_it() {
    block_on(async {
        let mut m = mesa().await;
        for ws in [&mut m.owner, &mut m.ana] {
            ws.call("table_join", json!({ "color": "#3b82f6", "styles": null }))
                .await;
        }
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        png.extend_from_slice(&[0, 0, 0, 13, b'I', b'H', b'D', b'R', 0, 0, 0, 1, 0, 0, 0, 1]);
        let sent = m
            .owner
            .call(
                "table_send_image",
                json!({ "base64": base64::engine::general_purpose::STANDARD.encode(&png) }),
            )
            .await;
        let path = sent["ok"]["image"].as_str().unwrap().to_owned();
        let b = sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        let (status, _) = get(&m.r, &format!("/f/{}/{path}", m.id), Some(&b)).await;
        assert_eq!(status, 200, "{path}");
    });
}

#[test]
fn a_new_note_in_a_table_starts_hidden_and_follows_its_renames() {
    block_on(async {
        let mut m = mesa().await;
        let made = m
            .owner
            .call(
                "create_note",
                json!({ "name": "Nova", "text": "zqbody novo\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        assert!(
            !strings(&m.ana.ask("list_notes", json!({})).await["ok"])
                .contains(&"Nova.md".to_owned())
        );
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": ["Nova.md"], "released": true }),
            )
            .await;
        assert!(
            strings(&m.ana.call("list_notes", json!({})).await["ok"])
                .contains(&"Nova.md".to_owned())
        );
        // A rename carries the state; a deletion drops it.
        let renamed = m
            .owner
            .call(
                "rename_note",
                json!({ "from": "Nova.md", "to": "Nova2.md" }),
            )
            .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        let names = strings(&m.ana.call("list_notes", json!({})).await["ok"]);
        assert!(names.contains(&"Nova2.md".to_owned()), "{names:?}");
        m.owner
            .call("delete_note", json!({ "path": "Nova2.md" }))
            .await;
        let status = m.owner.call("campaign_status", json!({})).await;
        assert!(!status.to_string().contains("Nova2"), "{status}");
        // "Release all" releases what is there, and the next note is hidden.
        m.owner
            .call("campaign_release_all", json!({ "root": "" }))
            .await;
        assert_eq!(
            strings(&m.ana.call("list_notes", json!({})).await["ok"]).len(),
            6
        );
        m.owner
            .call("create_note", json!({ "name": "Depois", "text": "d\n" }))
            .await;
        assert_eq!(
            strings(&m.ana.call("list_notes", json!({})).await["ok"]).len(),
            6
        );
    });
}

#[test]
fn a_subfolder_table_is_a_share_and_its_players_see_it_re_rooted() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (mut owner, _) = Win::open(&r, &admin, &id).await;
        for (name, text) in [
            ("Campanha/Aberta", "Veja [[Segredo]] e [[Fora]]\n"),
            ("Campanha/Segredo", "zqbody\n"),
            ("Fora", "fora\n"),
        ] {
            owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
        }
        let made = owner
            .call("campaign_make", json!({ "root": "Campanha" }))
            .await;
        assert_eq!(made["ok"]["tables"][0]["root"], "Campanha", "{made}");
        owner
            .call(
                "campaign_release",
                json!({ "paths": ["Campanha/Aberta.md"], "released": true }),
            )
            .await;
        let a = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        let share = r.server.db.make_share(&id, "Campanha").unwrap();
        r.server
            .db
            .grant_share(&share.id, &a.id, Role::Reader)
            .unwrap();
        let b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let (mut ana, o) = Win::open(&r, &b, &share.id).await;
        assert!(o.get("ok").is_some(), "{o}");
        assert_eq!(
            strings(&ana.call("list_notes", json!({})).await["ok"]),
            ["Aberta.md"]
        );
        let note = ana.call("read_note", json!({ "path": "Aberta.md" })).await;
        let text = note["ok"]["text"].as_str().unwrap();
        assert!(text.contains("Segredo 🔒"), "{text}");
        assert!(!text.contains("[[Segredo]]"));
        assert!(
            ana.call("read_note", json!({ "path": "Segredo.md" }))
                .await
                .get("err")
                .is_some()
        );
        // The share's window knows its own paths and the table as its whole.
        owner
            .call(
                "campaign_grant",
                json!({ "path": "Campanha/Aberta.md", "grant": { "kind": "group" } }),
            )
            .await;
        let heard = ana.hear(300).await;
        let told = heard.iter().find(|e| e["event"] == "campaign-changed");
        assert_eq!(
            told.map(|e| e["payload"]["paths"].clone()),
            Some(json!([])),
            "{heard:?}"
        );
        let st = ana.call("campaign_status", json!({})).await;
        assert_eq!(st["ok"]["viewer"], "player", "{st}");
        assert_eq!(st["ok"]["tables"][0]["root"], "", "{st}");
        assert_eq!(st["ok"]["notes"][0]["path"], "Aberta.md", "{st}");
        // A closed table keeps the share's players out too.
        owner
            .call(
                "campaign_settings",
                json!({ "root": "Campanha", "open": false }),
            )
            .await;
        let (mut shut, o) = Win::open(&r, &b, &share.id).await;
        assert_eq!(o["err"]["message"], "a mesa está fechada", "{o}");
        // A player of another subfolder's share, in the folder meanwhile.
        owner
            .call(
                "create_note",
                json!({ "name": "Outra/Nota", "text": "o\n" }),
            )
            .await;
        let dora = r
            .server
            .db
            .create_account(
                "dora@casa.lan",
                "Dora",
                "pt",
                Some("a senha da dora"),
                false,
            )
            .unwrap();
        let other = r.server.db.make_share(&id, "Outra").unwrap();
        r.server
            .db
            .grant_share(&other.id, &dora.id, Role::Reader)
            .unwrap();
        let db = sign_in(&r, "dora@casa.lan", "a senha da dora").await;
        let (mut dora_win, o) = Win::open(&r, &db, &other.id).await;
        assert!(o.get("ok").is_some(), "{o}");
        // The table opens: the share's player shut out hears it at once,
        // with the share's id; the other subfolder's player does not.
        owner
            .call(
                "campaign_settings",
                json!({ "root": "Campanha", "open": true }),
            )
            .await;
        let heard = shut.listen(300).await;
        assert!(
            heard.iter().any(
                |e| e["event"] == "table-opened" && e["payload"]["folder"] == share.id.as_str()
            ),
            "{heard:?}"
        );
        let not = dora_win.listen(200).await;
        assert!(not.iter().all(|e| e["event"] != "table-opened"), "{not:?}");
        owner
            .call(
                "campaign_settings",
                json!({ "root": "Campanha", "open": false }),
            )
            .await;
        // A reader of the whole folder is not locked out by a closed table
        // inside it: it reads the rest, and none of the table.
        let bia = r
            .server
            .db
            .create_account("bia@casa.lan", "Bia", "pt", Some("a senha da bia"), false)
            .unwrap();
        r.server.db.grant(&id, &bia.id, Role::Reader).unwrap();
        let bb = sign_in(&r, "bia@casa.lan", "a senha da bia").await;
        let (mut bia, o) = Win::open(&r, &bb, &id).await;
        assert!(o.get("ok").is_some(), "{o}");
        let names = strings(&bia.call("list_notes", json!({})).await["ok"]);
        assert!(names.contains(&"Fora.md".to_owned()), "{names:?}");
        assert!(
            !names.iter().any(|n| n.starts_with("Campanha/")),
            "{names:?}"
        );
    });
}

#[test]
fn a_locked_card_of_a_board_a_player_reads_is_the_same_whatever_the_reason() {
    block_on(async {
        let mut m = mesa().await;
        let board = json!({ "nodes": [
            { "id": "k-hid", "type": "file", "file": "Barão Zq.md", "x": 1, "y": 2, "width": 3, "height": 4 },
            { "id": "k-sec", "type": "file", "file": "Mapa Zq.md", "x": 1, "y": 2, "width": 3, "height": 4 },
            { "id": "k-gone", "type": "file", "file": "Nada Zq.md", "x": 1, "y": 2, "width": 3, "height": 4 },
        ], "edges": [] })
        .to_string();
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": "Trio.canvas", "base64": base64::engine::general_purpose::STANDARD.encode(board) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        m.owner
            .call(
                "campaign_release",
                json!({ "paths": ["Trio.canvas"], "released": true }),
            )
            .await;
        let read = m
            .ana
            .ask("read_text", json!({ "path": "Trio.canvas" }))
            .await;
        let json: Value = serde_json::from_str(read["ok"]["text"].as_str().unwrap()).unwrap();
        let nodes = json["nodes"].as_array().unwrap();
        let strip = |n: &Value| {
            let mut n = n.clone();
            n["id"] = json!("");
            n.to_string()
        };
        assert_eq!(nodes.len(), 3, "{json}");
        assert!(
            nodes[0]["text"].as_str().unwrap().starts_with("🔒"),
            "{json}"
        );
        assert_eq!(strip(&nodes[0]), strip(&nodes[1]), "hidden vs secret name");
        assert_eq!(strip(&nodes[0]), strip(&nodes[2]), "hidden vs not there");
    });
}
