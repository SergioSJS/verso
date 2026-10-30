// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The commands of a shared note's room, as the connection runs them
//! (`rpc.rs`): the role judged, a share's path joined to the shared
//! folder's, the room's path as confinement reads it.

use std::sync::Arc;

use serde_json::Value;
use verso_contract::ContractError;

use crate::auth::Who;
use crate::rpc::{arg, blocking, refused, to_value};
use crate::state::Server;

/// The commands of a shared note (ADR 0073 item 7): a reader joins and is
/// seen, and writes nothing.
pub(crate) async fn collab_command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    // One question, one answer (ADR 0113): the rules decide who types in
    // a room and who only reads it.
    let door = crate::access::Door::of(server, who, client)?;
    let scope = door.scope.clone();
    let typing = matches!(
        cmd,
        "collab_update" | "collab_save" | "collab_resolve" | "collab_canvas"
    );
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let path: String = arg(args, "path")?;
    // A share's path joined to the shared folder's (ADR 0081 item 12): one
    // room for the note, whoever opens it through what.
    let path = match &scope {
        Some(s) if typing => s.to_full_write(&path)?,
        Some(s) => s.to_full(&path)?,
        None => path,
    };
    // One room per file: the path as confinement reads it, so that
    // `./n.md` and `n.md` are one room.
    let path = {
        let (s, k) = (Arc::clone(server), key.clone());
        let confined = blocking(move || {
            s.service
                .with_key(&k, |ws| ws.confined(&path).map_err(Into::into))
        })
        .await;
        match &scope {
            Some(s) => confined.map_err(|e| s.error(e))?,
            None => confined?,
        }
    };
    // Who types in the room: the rules' Edit on the file. A board a player
    // edits is edited by element, in a shadow of its room made of what the
    // player sees (ADR 0113 H); one a player only sees is followed by its
    // file, as it is saved.
    let board_of_a_player =
        door.veiled() && crate::access::Kind::of_path(&path) == crate::access::Kind::Board;
    let writes = door.may_path(crate::access::Action::Edit, &path).allowed();
    // The document a window joins is the whole one for whoever the rules let
    // see the secret blocks — the game master's read-only credential too
    // (ADR 0113 item 6) — and the projection's for the rest; typing is the
    // writers' alone.
    let whole = writes
        || (!board_of_a_player
            && door
                .may_path(crate::access::Action::SeeSecretBlocks, &path)
                .allowed());
    // A conflict between the room and the disk is the game master's to
    // choose: it closes the room for everyone.
    if board_of_a_player && cmd == "collab_resolve" {
        return Err(refused(
            "the game master chooses between the board and the file",
        ));
    }
    if typing && !writes {
        return Err(refused("you may only read this folder"));
    }
    // A note a player does not edit is one it sees, or is not there.
    if door.veiled()
        && !writes
        && let Some(p) = crate::campaign::player(server, who, client)?
    {
        let (s, k, v, q) = (Arc::clone(server), key.clone(), p.veil, path.clone());
        let hidden = blocking(move || {
            s.service
                .with_key(&k, |ws| Ok(crate::campaign_serve::is_hidden_in(ws, &v, &q)))
        })
        .await?;
        if hidden {
            return Err(verso_contract::ContractError {
                kind: verso_contract::ErrorKind::NotFound,
                message: "not found".to_owned(),
            });
        }
    }
    let s = Arc::clone(server);
    let c = client.to_owned();
    let cmd = cmd.to_owned();
    let args = args.clone();
    let user = who.account.name.clone();
    let account = who.account.id.clone();
    let held = scope.clone();
    let answer = blocking(move || match cmd.as_str() {
        // Whether someone is in the note: a write that is not a keystroke
        // joins the room to be made there (ADR 0082).
        "collab_present" => Ok(Value::Bool(s.rooms.occupied(&key, &path))),
        "collab_join" if board_of_a_player && writes => {
            to_value(crate::collab::players::join_shadow(
                &s,
                (&c, &account),
                &key,
                &path,
                &user,
                held.as_ref(),
            )?)
        }
        "collab_join" => {
            let mut joined = crate::collab::join(&s, (&c, !whole), &key, &path, &user)?;
            // Whoever the rules (ADR 0113 `may`) do not let edit this note
            // is told so: the window opens read-only, in the room, to follow
            // it. Its updates are refused above all the same.
            joined.read_only |= !writes;
            to_value(joined)
        }
        "collab_update" => {
            let update: String = arg(&args, "update")?;
            crate::collab::update(&s, (&c, &account), &key, &path, &update)?;
            Ok(Value::Null)
        }
        "collab_awareness" => {
            let update: String = arg(&args, "update")?;
            let sender = crate::presence::Sender {
                client: &c,
                account: &account,
                name: &user,
            };
            crate::collab::awareness(&s, &sender, &key, &path, &update)?;
            Ok(Value::Null)
        }
        "collab_leave" => {
            crate::collab::leave(&s, &c, &key, &path);
            Ok(Value::Null)
        }
        // Dice (ADR 0088 item 4): the server rolls, a reader too.
        "collab_roll" => {
            let notation: String = arg(&args, "notation")?;
            let source: Option<String> = arg(&args, "source")?;
            let sender = crate::presence::Sender {
                client: &c,
                account: &account,
                name: &user,
            };
            let styles: Option<verso_contract::DiceStyles> = arg(&args, "styles")?;
            let secret: Option<bool> = arg(&args, "secret")?;
            let occurrence: Option<u32> = arg(&args, "occurrence")?;
            let opts = crate::collab::RollOpts {
                source,
                styles,
                secret: secret.unwrap_or(false),
                occurrence,
            };
            to_value(crate::collab::roll(
                &s, &sender, &key, &path, &notation, opts,
            )?)
        }
        // The oracle's draws (ADR 0102 item 5): the same, drawn by the server.
        "collab_oracle" => {
            let ask: verso_contract::OracleAsk = arg(&args, "ask")?;
            let sender = crate::presence::Sender {
                client: &c,
                account: &account,
                name: &user,
            };
            to_value(crate::collab::oracle(&s, &sender, &key, &path, &ask)?)
        }
        "collab_save" => to_value(crate::collab::save(&s, &key, &path)?),
        "collab_canvas" => {
            let at: String = arg(&args, "at")?;
            let json: String = arg(&args, "json")?;
            crate::collab::canvas(&s, &c, &key, &path, &at, json)?;
            Ok(Value::Null)
        }
        _ => {
            let keep: String = arg(&args, "keep")?;
            to_value(crate::collab::resolve(&s, &key, &path, &keep)?)
        }
    })
    .await;
    // A share's error in the share's paths.
    match &scope {
        Some(s) => answer.map_err(|e| s.error(e)),
        None => answer,
    }
}
