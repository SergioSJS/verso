// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The desktop app signs in through the browser (ADR 0074 item 8; the
//! maintainer's answer K of 2026-10-09): the app asks for a code, copies
//! it to the clipboard and opens the server's page; the person — signed in
//! there — enters the code from the app's screen and approves, and the
//! app, asking meanwhile, receives a token for that device, listed among
//! the sessions and revocable there. Nobody pastes a token. The flow is
//! `gh auth login`'s (OAuth 2.0's device authorization grant), the code
//! never taken from a link (decided 2026-10-14, ADR 0083 As built).

use std::time::{Duration, Instant};

use axum::Json;
use axum::http::StatusCode;
use axum::response::Response;
use serde::Deserialize;
use serde_json::json;
use verso_service::lock;

use crate::http::{ApiError, ApiResult, Ctx, ok};

/// How long a code waits for the person.
const LIFE: Duration = Duration::from_secs(600);
/// How often the app asks.
const INTERVAL: u64 = 2;
/// Letters a person reads without mistaking one for another.
const ALPHABET: &[u8] = b"BCDFGHJKLMNPQRSTVWXZ";

pub struct Pending {
    device: String,
    poll: Vec<u8>,
    made: Instant,
    approved: Option<(String, String)>,
    /// Who asked, for the page that approves it (threat-model.md, gap
    /// 12): the address the code was asked from, and when
    /// (`YYYY-MM-DDTHH:MM:SSZ`). A person sent someone else's link sees a
    /// request that is not theirs.
    pub address: String,
    pub asked: String,
    /// The address's key (`crate::limit::address_key`), for the entries
    /// one address may keep (`crate::limit::PENDING_PER_ADDRESS`).
    key: String,
}

fn code() -> Result<String, String> {
    let mut bytes = [0_u8; 8];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    let letters: String = bytes
        .iter()
        .map(|b| char::from(ALPHABET[usize::from(*b) % ALPHABET.len()]))
        .collect();
    Ok(format!("{}-{}", &letters[..4], &letters[4..]))
}

/// Whether `c` is a Unicode format character a device's name drops
/// (general category Cf, as of Unicode 16.0's `DerivedGeneralCategory.txt`):
/// the bidi controls and isolates, the zero-width space and non-joiner, the
/// byte-order mark, the soft hyphen, the tags. The zero-width joiner,
/// U+200D, stays: it joins an emoji's parts into one picture and turns no
/// text around. The standard library has no category table, and the set
/// is small and stable.
fn is_format(c: char) -> bool {
    matches!(
        u32::from(c),
        0x00AD
            | 0x0600..=0x0605
            | 0x061C
            | 0x06DD
            | 0x070F
            | 0x0890..=0x0891
            | 0x08E2
            | 0x180E
            | 0x200B..=0x200C
            | 0x200E..=0x200F
            | 0x202A..=0x202E
            | 0x2060..=0x2064
            | 0x2066..=0x206F
            | 0xFEFF
            | 0xFFF9..=0xFFFB
            | 0x110BD
            | 0x110CD
            | 0x13430..=0x1343F
            | 0x1BCA0..=0x1BCA3
            | 0x1D173..=0x1D17A
            | 0xE0001
            | 0xE0020..=0xE007F
    )
}

/// A device's name as a session keeps it: on one line, trimmed, at most
/// 80 characters, with no format character but the emoji's joiner — a
/// bidi override or a zero-width one would turn or hide the sentence the
/// approval page puts it in; none when nothing is left.
pub(crate) fn kept_name(name: &str) -> Option<String> {
    let one_line: String = name
        .chars()
        .filter(|c| !is_format(*c))
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let kept: String = one_line.trim().chars().take(80).collect();
    let kept = kept.trim_end().to_owned();
    (!kept.is_empty()).then_some(kept)
}

#[derive(Deserialize)]
pub struct Start {
    device: String,
}

/// The app asks for a code.
pub async fn start(ctx: Ctx, Json(body): Json<Start>) -> ApiResult<Response> {
    ctx.secure()?;
    let key = format!("device:{}", ctx.peer.key());
    let wait = ctx.server.limiter.wait(&key);
    if !wait.is_zero() {
        ctx.server.signins.limited(&key, &ctx.peer.key());
        return Err(ApiError::wait(wait.as_secs() + 1));
    }
    // A start counts nothing (ADR 0083 item 18, decided 2026-10-15): only
    // failed attempts grow the delay, so a household pairing its devices
    // in one evening is never made to wait. A flood of codes is bounded
    // by the codes one address may keep waiting (`limit::room_for`) and
    // by the REST pace per address.
    let device = kept_name(&body.device);
    let code = code()?;
    let poll = crate::crypto::token()?;
    let mut devices = lock(&ctx.server.devices);
    devices.retain(|_, p| p.made.elapsed() < LIFE);
    let by = ctx.peer.key();
    if !crate::limit::room_for(&devices, &by, |p| &p.key) {
        return Err(ApiError::wait(LIFE.as_secs() / 10));
    }
    crate::limit::make_room(&mut devices, crate::limit::PENDING, |p| p.made);
    devices.insert(
        code.clone(),
        Pending {
            device: device.unwrap_or_else(|| "Verso".to_owned()),
            poll: crate::crypto::hash(&poll),
            made: Instant::now(),
            approved: None,
            address: ctx.address(),
            asked: crate::log::stamp(),
            key: by,
        },
    );
    let base = crate::auth::expected_origin(&ctx.server, &ctx.headers).unwrap_or_default();
    Ok(ok(json!({
        "code": code,
        "poll": poll,
        // The page alone: the person enters the code the app shows (decided
        // 2026-10-14, ADR 0083 As built).
        "url": format!("{base}/device"),
        "interval": INTERVAL,
        "expires": LIFE.as_secs(),
    })))
}

fn link_gone() -> ApiError {
    ApiError::new(
        StatusCode::NOT_FOUND,
        "link_gone",
        "this code is used or expired",
    )
}

/// A code as the person typed or pasted it from the device's screen (ADR
/// 0083 item 17): spaces and the dash dropped, upper-cased,
/// eight letters of [`ALPHABET`] written `XXXX-XXXX`; anything else is no
/// code.
fn read_code(code: &str) -> Option<String> {
    let letters: String = code
        .chars()
        .take(64)
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (letters.len() == 8 && letters.bytes().all(|b| ALPHABET.contains(&b)))
        .then(|| format!("{}-{}", &letters[..4], &letters[4..]))
}

/// The open code — not expired, not yet approved — that `code` names: compared with each pending code in
/// constant time, so that how long a wrong guess takes says nothing of how
/// near it was. Every lookup first waits out the `device:` delay of the
/// address, and a wrong code counts against it, as a wrong poll secret does
/// (ADR 0083 items 8 and 17): a code is 8 letters, which a delay protects.
/// A right one does not clear it: approving one's own code is no way to
/// guess more.
fn open_code(ctx: &Ctx, code: &str) -> ApiResult<String> {
    let key = format!("device:{}", ctx.peer.key());
    let wait = ctx.server.limiter.wait(&key);
    if !wait.is_zero() {
        ctx.server.signins.limited(&key, &ctx.peer.key());
        return Err(ApiError::wait(wait.as_secs() + 1));
    }
    let found = read_code(code).and_then(|wanted| {
        let devices = lock(&ctx.server.devices);
        let mut hit = None;
        for (pending, p) in devices.iter() {
            let open = p.made.elapsed() < LIFE && p.approved.is_none();
            if crate::crypto::same(pending.as_bytes(), wanted.as_bytes()) && open {
                hit = Some(pending.clone());
            }
        }
        hit
    });
    found.ok_or_else(|| {
        ctx.server.limiter.failed(&key);
        link_gone()
    })
}

/// A code in a request's body, as the person entered it on the page from
/// the device's own screen: never taken from the address, where a link
/// sent by someone else would put it (ADR 0083 item 17; decided
/// 2026-10-14, As built).
#[derive(Deserialize)]
pub struct Typed {
    code: String,
}

/// What is asking, for the page that approves it: the device's name as
/// it gave it, and the address and time it asked from (gap 12), with the
/// code as the server read it, for the page to show beside them.
pub async fn describe_typed(ctx: Ctx, Json(body): Json<Typed>) -> ApiResult<Response> {
    ctx.changes()?;
    describing(&ctx, &body.code)
}

fn describing(ctx: &Ctx, code: &str) -> ApiResult<Response> {
    // A signed-in session's, as approving and refusing are: a personal
    // access token is refused before the code is looked at.
    if ctx.who()?.session().is_none() {
        return Err(ApiError::forbidden("not with an access token"));
    }
    let code = open_code(ctx, code)?;
    let devices = lock(&ctx.server.devices);
    let p = devices.get(&code).ok_or_else(link_gone)?;
    Ok(ok(json!({
        "code": code,
        "device": p.device,
        "address": p.address,
        "asked": p.asked,
    })))
}

/// The person says it was not them: the code is gone, and the app that
/// asked hears `link_gone` (gap 12).
pub async fn refuse_typed(ctx: Ctx, Json(body): Json<Typed>) -> ApiResult<Response> {
    ctx.changes()?;
    refusing(&ctx, &body.code)
}

fn refusing(ctx: &Ctx, code: &str) -> ApiResult<Response> {
    let who = ctx.who()?;
    if !matches!(who.via, crate::auth::Via::Browser { .. }) {
        return Err(ApiError::forbidden("refused in the browser"));
    }
    let code = open_code(ctx, code)?;
    let refused = {
        let mut devices = lock(&ctx.server.devices);
        let open = devices
            .get(&code)
            .is_some_and(|p| p.made.elapsed() < LIFE && p.approved.is_none());
        if open { devices.remove(&code) } else { None }
    }
    .ok_or_else(link_gone)?;
    crate::log::info(&format!(
        "a device's sign-in refused: {} asked from {} at {}",
        refused.device, refused.address, refused.asked
    ));
    ctx.audit("device_refused", Some(&refused.device), None, true);
    Ok(ok(json!(null)))
}

/// The person approves the code they entered, signed in in the browser.
pub async fn approve_typed(ctx: Ctx, Json(body): Json<Typed>) -> ApiResult<Response> {
    ctx.changes()?;
    approving(&ctx, &body.code)
}

fn approving(ctx: &Ctx, code: &str) -> ApiResult<Response> {
    let who = ctx.who()?.clone();
    if !matches!(who.via, crate::auth::Via::Browser { .. }) {
        return Err(ApiError::forbidden("approved in the browser"));
    }
    // A fresh proof first, before the code is looked at (ADR 0083 item 6).
    ctx.proved()?;
    let code = open_code(ctx, code)?;
    let device = {
        let devices = lock(&ctx.server.devices);
        devices
            .get(&code)
            .filter(|p| p.made.elapsed() < LIFE && p.approved.is_none())
            .map(|p| p.device.clone())
            .ok_or_else(link_gone)?
    };
    let (token, _) =
        ctx.server
            .db
            .create_session(&who.account.id, "device", &device, &ctx.address())?;
    if let Some(p) = lock(&ctx.server.devices).get_mut(&code) {
        p.approved = Some((token, who.account.id.clone()));
    }
    ctx.audit("device_approved", Some(&device), None, true);
    Ok(ok(json!(null)))
}

#[derive(Deserialize)]
pub struct Poll {
    code: String,
    poll: String,
}

/// The app asks whether the person approved: `pending` until then, the
/// device's token once, `link_gone` after. A code unknown or a wrong poll
/// secret counts against the `device:` key of the address, as a start does
/// (ADR 0083 item 8, F17): past the free failures the next wrong one waits
/// its delay. The app that holds the right secret is answered whatever the
/// address's delay — a stranger sharing it, behind the same NAT, cannot
/// keep it from signing in (ADR 0074 item 9: never a lock a stranger can
/// use); the secret is 256 bits, not a thing a delay protects.
pub async fn poll(ctx: Ctx, Json(body): Json<Poll>) -> ApiResult<Response> {
    ctx.secure()?;
    // Past the server's pace of refusals, every sign-in waits its turn
    // (ADR 0083 item 2).
    let turn = ctx.server.signins.turn();
    if !turn.is_zero() {
        tokio::time::sleep(turn).await;
    }
    let code = body.code.to_ascii_uppercase();
    let mut devices = lock(&ctx.server.devices);
    let right = devices
        .get(&code)
        .is_some_and(|p| crate::crypto::same(&p.poll, &crate::crypto::hash(&body.poll)));
    if !right {
        let known = devices.contains_key(&code);
        drop(devices);
        let key = format!("device:{}", ctx.peer.key());
        let wait = ctx.server.limiter.wait(&key);
        if !wait.is_zero() {
            ctx.server.signins.limited(&key, &ctx.peer.key());
            return Err(ApiError::wait(wait.as_secs() + 1));
        }
        ctx.server.limiter.failed(&key);
        // A wrong poll secret for a code that exists is a guess at a
        // device's sign-in: said as a refused one, under no e-mail (ADR
        // 0083 item 1). A code unknown — expired, or never made — is not.
        if known {
            crate::signin::refused(&ctx.server, &ctx.peer.key(), None, None);
        }
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code is used or expired",
        ));
    }
    let Some(p) = devices.get(&code) else {
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code is used or expired",
        ));
    };
    if p.made.elapsed() >= LIFE {
        devices.remove(&code);
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code expired",
        ));
    }
    let Some((token, account)) = p.approved.clone() else {
        return Ok(ok(json!({ "pending": true, "interval": INTERVAL })));
    };
    devices.remove(&code);
    drop(devices);
    ctx.server.signins.succeeded(&ctx.peer.key(), None);
    let account = ctx
        .server
        .db
        .account(&account)?
        .ok_or_else(ApiError::not_found)?;
    Ok(ok(
        json!({ "token": token, "account": crate::api::account_json(&account) }),
    ))
}

#[derive(Deserialize)]
pub struct Rename {
    device: String,
}

/// The device names itself again (ADR 0079 item 8, ADR 0074 item 8;
/// decided 2026-10-11): the person set this computer's name in the app's
/// Settings › Servers, and the session the device signed in with takes it
/// — the list of sessions and the folders' change log say it from now on.
/// Only a device's own session, with its own token.
pub async fn rename(ctx: Ctx, Json(body): Json<Rename>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.who()?;
    let crate::auth::Via::Device { session } = &who.via else {
        return Err(ApiError::forbidden(
            "a device names itself, with its own session",
        ));
    };
    let Some(device) = kept_name(&body.device) else {
        return Err(ApiError::bad("bad_request", "a name"));
    };
    if !ctx.server.db.rename_device(session, &device)? {
        return Err(ApiError::not_found());
    }
    ctx.audit("device_renamed", Some(&device), None, true);
    Ok(ok(json!({ "device": device })))
}

#[cfg(test)]
mod tests {
    use super::kept_name;

    /// A device's name is shown inside a sentence on the approval page and
    /// in the list of sessions: a Unicode format character in it — a bidi
    /// override, an isolate, a zero-width space or joiner, a tag — could
    /// turn the sentence around it or hide what it says, and is dropped.
    #[test]
    fn a_device_name_keeps_no_format_character() {
        for (given, kept) in [
            ("Verso\u{202E}kooBcaM", Some("VersokooBcaM")),
            ("\u{2066}Verso\u{2069} · Mac", Some("Verso · Mac")),
            ("Ver\u{200B}so\u{FEFF}", Some("Verso")),
            ("\u{200F}\u{200E}\u{061C}", None),
            ("Mac\u{E0041}\u{E007F}", Some("Mac")),
            ("Verso\u{00AD}Mac", Some("VersoMac")),
        ] {
            assert_eq!(kept_name(given).as_deref(), kept, "{given:?}");
        }
    }

    /// What was kept before stays: a control character becomes a space,
    /// the ends are trimmed, 80 characters at most.
    /// The zero-width joiner joins an emoji's parts and turns no text
    /// around: a family, a flag of a region, a profession keep their one
    /// picture; the bidi controls beside it still go.
    #[test]
    fn a_joined_emoji_survives_and_a_bidi_control_does_not() {
        let family = "Verso · \u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}";
        assert_eq!(kept_name(family).as_deref(), Some(family), "a joined emoji");
        let cook = "\u{1F9D1}\u{200D}\u{1F373} Mac";
        assert_eq!(kept_name(cook).as_deref(), Some(cook));
        assert_eq!(
            kept_name("\u{1F469}\u{200D}\u{1F4BB}\u{202E}caM").as_deref(),
            Some("\u{1F469}\u{200D}\u{1F4BB}caM"),
            "an RLO beside a joined emoji"
        );
        for bidi in [
            '\u{061C}', '\u{200E}', '\u{200F}', '\u{202A}', '\u{202B}', '\u{202C}', '\u{202D}',
            '\u{202E}', '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}',
        ] {
            assert_eq!(
                kept_name(&format!("a{bidi}b")).as_deref(),
                Some("ab"),
                "{bidi:?}"
            );
        }
    }

    #[test]
    fn a_device_name_is_one_trimmed_line() {
        assert_eq!(kept_name(" Verso\n· Mac ").as_deref(), Some("Verso · Mac"));
        assert_eq!(
            kept_name(&"é".repeat(100)).map(|n| n.chars().count()),
            Some(80)
        );
        assert_eq!(kept_name(" \t "), None);
        assert_eq!(kept_name("Verso · 日本").as_deref(), Some("Verso · 日本"));
    }
}
