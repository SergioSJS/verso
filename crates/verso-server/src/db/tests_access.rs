// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Schema 20 (ADR 0113 item I): the old audience, grants, secret names and
//! image permissions carried into `campaign_access`, `campaign_files` and
//! `campaign_rights` with nothing lost, and **the equivalence test**: for
//! every old state, the veil the old tables made and the veil the new sets
//! make answer the same for every player and every path, so that the
//! per-player sync logs (`campaign_epoch`, `_viewer`, `_skip`, `_lost`,
//! `_gone`) do not move and no device is told a deletion at the upgrade.
//!
//! The old veil is not in the code any more: [`Old`] is its answers,
//! restated from `Veil::released`, `may_edit` and `group_edits` as they
//! were (ADR 0110 "As built", audience and grants), and the old writes of
//! `campaign_audience` and `campaign_grant` as a model the new ones are
//! driven against.

use std::collections::BTreeSet;

use super::*;

/// The old state of one note, as the old tables kept it.
#[derive(Debug, Clone, Default)]
struct Old {
    released: bool,
    audience: BTreeSet<String>,
    grant: OldGrant,
    secret: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
enum OldGrant {
    #[default]
    None,
    Group,
    Player(String),
}

impl Old {
    /// `Veil::released` for an account.
    fn sees(&self, a: &str) -> bool {
        self.released
            || self.audience.contains(a)
            || self.grant == OldGrant::Group
            || self.grant == OldGrant::Player(a.to_owned())
    }

    /// `Veil::released` for the public.
    fn public(&self) -> bool {
        self.released || self.grant == OldGrant::Group
    }

    /// `Veil::released` for the union of the players.
    fn union(&self) -> bool {
        self.released || !self.audience.is_empty() || self.grant != OldGrant::None
    }

    /// `Veil::may_edit`.
    fn edits(&self, a: &str) -> bool {
        match &self.grant {
            OldGrant::None => false,
            OldGrant::Group => true,
            OldGrant::Player(x) => x == a,
        }
    }

    /// The old `campaign_audience`: the audience, and the grants that no
    /// longer hold with it.
    fn audience(&mut self, to: Option<&BTreeSet<String>>, table: bool) {
        self.released = table;
        self.audience.clear();
        match (table, to) {
            (true, _) => {}
            (false, None) => self.grant = OldGrant::None,
            (false, Some(set)) => {
                self.audience.clone_from(set);
                let keep = matches!(&self.grant, OldGrant::Player(p) if set.contains(p));
                if !keep {
                    self.grant = OldGrant::None;
                }
            }
        }
    }

    /// The old `campaign_grant`: a player who edits a note that is not the
    /// table's joins its audience.
    fn grant(&mut self, g: OldGrant) {
        if let OldGrant::Player(a) = &g
            && !self.released
        {
            self.audience.insert(a.clone());
        }
        self.grant = g;
    }
}

/// Schema 19: the database as it was before ADR 0113.
fn schema_19() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(&format!(
        "PRAGMA foreign_keys = ON; {CREATE}{PASSKEYS}{SETTINGS}{CONSOLE}{SYNC}{DEVICES}{}{SHARES}{}{INVITATION_SCOPE}{SECRETS}{}{}{}{}{}{}{}{} PRAGMA user_version = 19;",
        trash::TRASH,
        proof::PROOF,
        local::PHONES,
        readlinks::READ_LINKS,
        table::TABLE,
        campaign::CAMPAIGN,
        table::TABLE_PER_TABLE,
        campaign::AUDIENCE,
        campaign::EPOCHS,
        campaign::IMAGES,
    ))
    .unwrap();
    conn
}

/// Schema 20: the database as it was before the four rights (ADR 0113 K.6).
fn schema_20() -> Connection {
    let conn = schema_19();
    conn.execute_batch(&format!("{} PRAGMA user_version = 20;", access::ACCESS))
        .unwrap();
    conn
}

const PLAYERS: [&str; 3] = ["a", "b", "c"];

fn seed(conn: &Connection) {
    let at = now();
    conn.execute_batch(&format!(
        "INSERT INTO folders (id, dir, created) VALUES ('f', 'f', {at});
         INSERT INTO campaigns (folder, root, created) VALUES ('f', '', {at});"
    ))
    .unwrap();
    for p in PLAYERS {
        conn.execute(
            "INSERT INTO accounts (id, email, email_fold, name, lang, admin, may_create, created)
             VALUES (?1, ?2, ?2, ?1, 'pt', 0, 0, ?3)",
            params![p, format!("{p}@x"), at],
        )
        .unwrap();
    }
}

/// Every state the old commands can leave a note in, and the raw ones the
/// tables could hold besides: released or not, any audience, any grant.
fn every_old_state() -> Vec<Old> {
    let mut out = Vec::new();
    for released in [false, true] {
        for mask in 0..8_u8 {
            let audience: BTreeSet<String> = PLAYERS
                .iter()
                .enumerate()
                .filter(|(i, _)| mask & (1 << i) != 0)
                .map(|(_, p)| (*p).to_owned())
                .collect();
            let mut grants = vec![OldGrant::None, OldGrant::Group];
            grants.extend(PLAYERS.iter().map(|p| OldGrant::Player((*p).to_owned())));
            for grant in grants {
                for secret in [false, true] {
                    out.push(Old {
                        released,
                        // A released note's audience rows are never read.
                        audience: audience.clone(),
                        grant: grant.clone(),
                        secret,
                    });
                }
            }
        }
    }
    out
}

fn path_of(i: usize) -> String {
    format!("N{i}.md")
}

/// `old` against what the veil of `db` says of `path`, for everyone.
fn same_as_the_old_veil(db: &Db, path: &str, old: &Old, what: &str) {
    let veil = crate::campaign::build(db, "f").unwrap().unwrap();
    assert_eq!(veil.released(path), old.public(), "{what}: public {path}");
    assert_eq!(
        veil.union().released(path),
        old.union(),
        "{what}: union {path}"
    );
    for a in PLAYERS {
        let v = veil.view(a);
        assert_eq!(v.released(path), old.sees(a), "{what}: {a} sees {path}");
        assert_eq!(!v.hides_note(path), old.sees(a), "{what}: {a} hides {path}");
        assert_eq!(
            veil.hides_note_from(path, a),
            !old.sees(a),
            "{what}: {a} hidden from {path}"
        );
        assert_eq!(
            v.may_edit(path, a),
            old.edits(a),
            "{what}: {a} edits {path}"
        );
    }
    assert_eq!(
        veil.group_edits(path),
        old.grant == OldGrant::Group,
        "{what}: group edits {path}"
    );
    assert_eq!(veil.secret_name(path), old.secret, "{what}: secret {path}");
}

/// The upgrade changes no answer of the veil, for any old state: this is
/// what keeps the per-player sync logs where they were.
#[test]
fn schema_20_answers_as_the_old_veil_did_for_every_old_state() {
    let conn = schema_19();
    seed(&conn);
    let states = every_old_state();
    for (i, n) in states.iter().enumerate() {
        let path = path_of(i);
        let (kind, who): (&str, Option<&str>) = match &n.grant {
            OldGrant::None => ("none", None),
            OldGrant::Group => ("group", None),
            OldGrant::Player(a) => ("player", Some(a.as_str())),
        };
        conn.execute(
            "INSERT INTO campaign_notes (folder, path, released, secret_name, grant_kind, grant_account)
             VALUES ('f', ?1, ?2, ?3, ?4, ?5)",
            params![path, i64::from(n.released), i64::from(n.secret), kind, who],
        )
        .unwrap();
        for a in &n.audience {
            conn.execute(
                "INSERT INTO campaign_audience (folder, path, account) VALUES ('f', ?1, ?2)",
                params![path, a],
            )
            .unwrap();
        }
    }
    let db = Db::from(conn).unwrap();
    for (i, n) in states.iter().enumerate() {
        same_as_the_old_veil(&db, &path_of(i), n, "after the upgrade");
    }
    // Nothing lost: every note the table knew is still one.
    assert_eq!(db.campaign_notes("f").unwrap().len(), states.len());
}

/// The migration is mapped as ADR 0113 item I says, row by row, and the old
/// tables are left as they were.
#[test]
fn schema_20_maps_the_old_rows_as_the_adr_says() {
    let conn = schema_19();
    seed(&conn);
    conn.execute_batch(
        "INSERT INTO campaign_notes (folder, path, released, secret_name, grant_kind, grant_account) VALUES
           ('f', 'Aberta.md', 1, 0, 'none', NULL),
           ('f', 'Grupo.md', 1, 0, 'group', NULL),
           ('f', 'Ana.md', 1, 1, 'player', 'a'),
           ('f', 'Parte.md', 0, 0, 'player', 'b'),
           ('f', 'Fechada.md', 0, 0, 'none', NULL);
         INSERT INTO campaign_audience (folder, path, account) VALUES
           ('f', 'Parte.md', 'b'), ('f', 'Parte.md', 'c');
         INSERT INTO campaign_images (folder, root, account) VALUES ('f', '', 'a');",
    )
    .unwrap();
    let db = Db::from(conn).unwrap();
    let conn = db.conn();
    let rows: Vec<(String, Option<String>, String)> = conn
        .prepare("SELECT path, account, level FROM campaign_access WHERE folder = 'f' ORDER BY path, account")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let want =
        |p: &str, a: Option<&str>, l: &str| (p.to_owned(), a.map(str::to_owned), l.to_owned());
    assert_eq!(
        rows,
        vec![
            want("Aberta.md", None, "see"),
            want("Ana.md", None, "see"),
            want("Ana.md", Some("a"), "edit"),
            want("Fechada.md", None, "none"),
            want("Grupo.md", None, "edit"),
            want("Parte.md", Some("b"), "edit"),
            want("Parte.md", Some("c"), "see"),
        ]
    );
    let secret: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM campaign_files WHERE secret_name = 1 AND path = 'Ana.md'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(secret, 1);
    let right: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM campaign_rights WHERE root = '' AND account = 'a' AND \"right\" = 'files'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(right, 1);
    // The old tables stay, read-only, for one version.
    let old: i64 = conn
        .query_row("SELECT COUNT(*) FROM campaign_notes", [], |r| r.get(0))
        .unwrap();
    assert_eq!(old, 5);
    drop(conn);
    assert!(db.image_granted("f", "a"));
}

/// The new writes (`campaign_audience`, `campaign_grant`), driven against
/// the old ones as a model, answer as the old veil did after every step.
#[test]
fn the_audience_and_grant_adapters_answer_as_the_old_writes_did() {
    let db = Db::memory().unwrap();
    let owner = db
        .create_account("o@x.co", "O", "pt", Some("uma senha longa"), true)
        .unwrap();
    let folder = db.create_folder("f", &owner.id).unwrap();
    // The veil builds from the folder's id; the accounts are named a, b, c.
    let ids: Vec<String> = PLAYERS
        .iter()
        .map(|p| {
            db.create_account(
                &format!("{p}@x.co"),
                p,
                "pt",
                Some("uma senha longa"),
                false,
            )
            .unwrap()
            .id
        })
        .collect();
    db.campaign_make(&folder.id, "").unwrap();
    // Our model and the veil speak of ids.
    let notes: Vec<String> = (0..4).map(path_of).collect();
    let mut model: Vec<Old> = vec![Old::default(); notes.len()];
    let mut seed = 0x9E37_79B9_u64;
    let mut next = move |n: u64| {
        seed = seed
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (seed >> 33) % n
    };
    let check = |db: &Db, model: &[Old], step: usize, what: &str| {
        let veil = crate::campaign::build(db, &folder.id).unwrap().unwrap();
        for (i, p) in notes.iter().enumerate() {
            let old = &model[i];
            assert_eq!(veil.released(p), old.public(), "{step} {what}: public {p}");
            assert_eq!(
                veil.union().released(p),
                old.union(),
                "{step} {what}: union {p}"
            );
            for (k, id) in ids.iter().enumerate() {
                let who = PLAYERS[k];
                assert_eq!(
                    veil.view(id).released(p),
                    old.sees(who),
                    "{step} {what}: {who} sees {p}"
                );
                assert_eq!(
                    veil.view(id).may_edit(p, id),
                    old.edits(who),
                    "{step} {what}: {who} edits {p}"
                );
            }
        }
    };
    for step in 0..400 {
        let i = usize::try_from(next(4)).unwrap();
        let path = std::slice::from_ref(&notes[i]);
        let what;
        match next(5) {
            0 => {
                db.campaign_audience(&folder.id, path, &Audience::Table)
                    .unwrap();
                model[i].audience(None, true);
                what = "table";
            }
            1 => {
                db.campaign_audience(&folder.id, path, &Audience::Hidden)
                    .unwrap();
                model[i].audience(None, false);
                what = "hidden";
            }
            2 => {
                let mask = next(7) + 1;
                let ps: BTreeSet<usize> = (0..3).filter(|k| mask & (1 << k) != 0).collect();
                let by_id: BTreeSet<String> = ps.iter().map(|k| ids[*k].clone()).collect();
                let by_name: BTreeSet<String> = ps.iter().map(|k| PLAYERS[*k].to_owned()).collect();
                db.campaign_audience(&folder.id, path, &Audience::Players(by_id))
                    .unwrap();
                model[i].audience(Some(&by_name), false);
                what = "players";
            }
            3 => {
                let k = usize::try_from(next(3)).unwrap();
                db.campaign_grant(&folder.id, &notes[i], &Grant::Player(ids[k].clone()))
                    .unwrap();
                model[i].grant(OldGrant::Player(PLAYERS[k].to_owned()));
                what = "grant player";
            }
            _ => {
                if next(2) == 0 {
                    // The command releases a note to the table before it
                    // grants it to the group.
                    model[i].audience(None, true);
                    model[i].grant(OldGrant::Group);
                    db.campaign_release(&folder.id, path, true).unwrap();
                    db.campaign_grant(&folder.id, &notes[i], &Grant::Group)
                        .unwrap();
                    what = "grant group";
                } else {
                    db.campaign_grant(&folder.id, &notes[i], &Grant::None)
                        .unwrap();
                    model[i].grant(OldGrant::None);
                    what = "grant none";
                }
            }
        }
        check(&db, &model, step, what);
    }
}

/// An audience row of a path with no note row was never read by the old
/// veil (it was made of the note rows): the migration carries none over. A
/// note the table kept hidden becomes a `none` that is marked as migrated,
/// so that it is no exception anyone made.
#[test]
fn schema_20_ignores_an_audience_with_no_note_and_marks_the_hidden_it_wrote() {
    let conn = schema_19();
    seed(&conn);
    conn.execute_batch(
        "INSERT INTO campaign_notes (folder, path, released) VALUES ('f', 'Fechada.md', 0);
         INSERT INTO campaign_audience (folder, path, account) VALUES ('f', 'Solta.md', 'a');",
    )
    .unwrap();
    let db = Db::from(conn).unwrap();
    let facts = db.access_facts("f").unwrap();
    assert!(
        facts.sets.get("solta.md").is_none(),
        "an orphan row was carried over"
    );
    assert!(
        facts.migrated.contains("fechada.md"),
        "{:?}",
        facts.migrated
    );
    // A path set on purpose is no longer a migrated one.
    db.campaign_audience("f", &["Fechada.md".to_owned()], &Audience::Table)
        .unwrap();
    assert!(
        !db.access_facts("f")
            .unwrap()
            .migrated
            .contains("fechada.md")
    );
}

/// An explicit `none` the game master sets later on a migrated path is an
/// exception someone made: it is no longer marked as migrated.
#[test]
fn an_explicit_none_on_a_migrated_path_is_no_longer_migrated() {
    let conn = schema_19();
    seed(&conn);
    conn.execute_batch(
        "INSERT INTO campaign_notes (folder, path, released) VALUES ('f', 'Fechada.md', 0);",
    )
    .unwrap();
    let db = Db::from(conn).unwrap();
    assert!(
        db.access_facts("f")
            .unwrap()
            .migrated
            .contains("fechada.md")
    );
    db.access_put("f", "Fechada.md", crate::access::NodeSet::default())
        .unwrap();
    let facts = db.access_facts("f").unwrap();
    assert!(
        !facts.migrated.contains("fechada.md"),
        "{:?}",
        facts.migrated
    );
    assert!(facts.sets.contains_key("fechada.md"));
}

/// Schema 21 (ADR 0113 K.6): *Send files* becomes four rights and no one
/// loses a power they used the day before. A `files` row stays and gains
/// `images`; a player with *Edits* on a **folder** of a table — their own row
/// or the whole table's — gets *Creates notes* and *Creates boards* there; so
/// does a folder-role editor. *Edits* on a file does not.
#[test]
fn schema_21_splits_send_files_and_keeps_what_players_could_do() {
    let conn = schema_20();
    seed(&conn);
    let at = now();
    for p in ["d", "e", "g"] {
        conn.execute(
            "INSERT INTO accounts (id, email, email_fold, name, lang, admin, may_create, created)
             VALUES (?1, ?2, ?2, ?1, 'pt', 0, 0, ?3)",
            params![p, format!("{p}@x"), at],
        )
        .unwrap();
    }
    conn.execute_batch(&format!(
        "INSERT INTO shares (id, folder, path, created) VALUES ('s1', 'f', 'Sala', {at});
         INSERT INTO share_grants (share, account, role) VALUES ('s1', 'd', 'editor'), ('s1', 'e', 'reader');
         INSERT INTO grants (folder, account, role) VALUES ('f', 'g', 'reader');
         INSERT INTO campaign_access (folder, path, account, level) VALUES
           ('f', 'Sala/Cenas', 'e', 'edit'),
           ('f', 'Mesa/Atos 1.5', 'g', 'edit'),
           ('f', 'Mesa/Atos 1.5/x.md', NULL, 'see');
         INSERT INTO campaigns (folder, root, created) VALUES ('f', 'Mesa', {at}), ('f', 'Sala', {at});
         INSERT INTO grants (folder, account, role) VALUES ('f', 'a', 'reader'), ('f', 'b', 'reader'), ('f', 'c', 'editor');
         INSERT INTO campaign_access (folder, path, account, level) VALUES
           ('f', 'Mesa/Cenas', 'a', 'edit'),
           ('f', 'Mesa/Livre.md', 'b', 'edit'),
           ('f', 'Mesa/Mapas.v2', 'b', 'see'),
           ('f', 'Sala', NULL, 'edit');
         INSERT INTO campaign_rights (folder, root, account, \"right\") VALUES ('f', 'Mesa', 'a', 'files'), ('f', 'Sala', 'c', 'files');"
    ))
    .unwrap();
    let db = Db::from(conn).unwrap();
    let got = |root: &str, account: &str| -> Vec<String> {
        let mut v: Vec<String> = db
            .conn()
            .prepare(
                "SELECT \"right\" FROM campaign_rights WHERE folder = 'f' AND root = ?1 AND account = ?2 ORDER BY \"right\"",
            )
            .unwrap()
            .query_map(params![root, account], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        v.sort();
        v
    };
    // a: had Send files at Mesa and Edits on its folder Cenas: all four.
    assert_eq!(
        got("Mesa", "a"),
        ["create_boards", "create_notes", "files", "images"]
    );
    // b: Edits on a file, Sees a folder: nothing is added.
    assert!(got("Mesa", "b").is_empty());
    // c: a folder-role editor edited every folder it saw.
    assert_eq!(got("Mesa", "c"), ["create_boards", "create_notes"]);
    // The whole table at Edits on the folder Sala: every player of the folder.
    assert_eq!(got("Sala", "a"), ["create_boards", "create_notes"]);
    assert_eq!(got("Sala", "b"), ["create_boards", "create_notes"]);
    assert_eq!(
        got("Sala", "c"),
        ["create_boards", "create_notes", "files", "images"]
    );
    // People who come in through a share only: an editor, and a reader with
    // Edits on a folder of the table.
    assert_eq!(got("Sala", "d"), ["create_boards", "create_notes"]);
    assert_eq!(got("Sala", "e"), ["create_boards", "create_notes"]);
    assert!(got("Mesa", "d").is_empty() && got("Mesa", "e").is_empty());
    // A folder with a dot in its name is a folder when something lies under it.
    assert_eq!(got("Mesa", "g"), ["create_boards", "create_notes"]);
    // The new words are the only ones the table takes.
    let conn = db.conn();
    assert!(
        conn.execute(
            "INSERT INTO campaign_rights (folder, root, account, \"right\") VALUES ('f', 'Mesa', 'b', 'dice')",
            [],
        )
        .is_err()
    );
    drop(conn);
    // What the rules read, and the admission before a message is parsed.
    let facts = db.access_facts("f").unwrap();
    assert!(facts.has_right("Mesa", "a", crate::access::Right::CreatesBoards));
    assert!(!facts.has_right("Mesa", "b", crate::access::Right::CreatesNotes));
    assert!(db.image_granted("f", "a"));
    let version: i64 = db
        .conn()
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(version, 23);
}
