# ADR 0112 — Confirming it is you on a linked device

- Date: 2026-10-23
- Source: the maintainer, 2026-10-23. In the Mac desktop app, on a folder
  synced with the server, he tried to make a table invitation and got the
  password prompt ("Confirme que é você"). He said *"eu não coloquei senha"*
  (I did not set a password): the app had been linked by the device code, and
  the account's password was one a test setup had set and kept in a file. The
  assistant recommended a proposal to confirm on the device instead.
- Written by Sonnet 5.5 at the session's request. Accepted in part (2026-10-28):
  items 1–3; nothing is built.
  To be read by the other model before it is accepted.
- Related: [0083](0083-security-hardening-of-universo.md) (items 4, 6 and 17:
  token revocation, the fresh proof, the device page's typed code),
  [0074](0074-accounts-and-access-on-the-server.md) (accounts, the device
  session), [0079](0079-sync-a-local-folder-with-a-server.md) (the desktop
  app connects to a server), [0096](0096-this-app-is-a-server.md) (the device
  flow, item 6: the click as the proof on the host),
  [0026](0026-core-ui-contract-inviolable-rules.md) (the contract),
  [0029](0029-guardrails-in-ci.md) (guardrails),
  [0035](0035-cross-cutting-requirements.md) (languages, accessibility),
  [0069](0069-windows-port.md) and
  [the cross-platform checklist](../reference/cross-platform-checklist.md).
- Status in the briefing: not present.

## Context

**What exists.** A sensitive route of the server (creating a token, approving
a device, an invitation that carries a folder or a share, a password change,
the admin's actions) answers 403 `prove_first` when the session's `proved_at`
is older than ten minutes. `POST /api/me/prove` takes the account password
(through the sign-in's own delay and refusal) or a passkey assertion and
stamps the session ([0083](0083-security-hardening-of-universo.md) item 6;
`tests_prove.rs`, `app/ui/test/proof.test.mjs`). The window shows "Confirme
que é você" and asks for the password again. The desktop app has a host
command `server_prove` that sends the password with the device's bearer.

**The gap.** A desktop app is linked to a server by the device flow
([0074](0074-accounts-and-access-on-the-server.md) item 8,
[0079](0079-sync-a-local-folder-with-a-server.md)): the person types a code,
approves on the server's page, and the app holds a device token. The person
may never have typed the account password on that device, may not remember it,
or may have signed up by an e-mail link and never chose one. The only proof
the server accepts for a device is that password, so the first sensitive
action on a linked device can be a dead end.

**What the person has instead.** On the host, the OS already knows who is at
the keyboard (Touch ID or the login password on macOS, Windows Hello on
Windows, polkit on some Linux desktops). [0096](0096-this-app-is-a-server.md)
item 6 already chose the click on the host as the proof for allowing a phone,
and left the OS prompt "possible later".

## Decision

Items 1–3 were decided by the maintainer on 2026-10-28 (see "Status"); the
rest below is still a proposal or `[OPEN]`. Nothing is built.

1. **`[DECIDED 2026-10-28]` = (b).** What a desktop app linked by the device flow uses to prove.**
   - (a) The account password, as today. Works everywhere; a dead end for a
     person who never set one.
   - (b) The OS's own check, then a device-bound proof to the server. The
     host asks the OS (`LocalAuthentication` on macOS, Windows Hello on
     Windows, polkit or nothing on Linux). On success it signs a server
     challenge with a **per-device key** made at linking: the key pair is
     created when the device is approved, kept in the OS keychain (Keychain,
     Credential Manager, Secret Service) marked as needing the user's
     presence where the OS supports it, and the server records the public key
     with the device session. The server never sees the OS secret; it sees a
     signature it can verify.
   - (c) Approve on another already-signed-in device (push-style): the sensitive
     action waits, a signed-in device shows "Was it you?". Needs a second
     device online.
   - `[DECIDED 2026-10-29]` (a) stays as the fallback: the maintainer, asked
     whether the password stays when there is no Touch ID or Windows Hello:
     *"pq não?"* (why not?).
   - *Recommendation:* **(b), with (a) always available as a fallback**
     (a person without a keychain key, a device linked before this exists, a
     Linux host with no OS check). On Linux with no polkit agent the app falls
     back to (a). (c) stays an option for later; it is not discarded.

2. **`[DECIDED 2026-10-28]`** = a single-use 60-second challenge, valid for 10 minutes, on the same routes as 0083 item 6. What the server accepts as a fresh proof, for how long, on which
   routes.**
   - A device proof is: the server issues a single-use challenge bound to the
     session (a random value with a short expiry, for example 60 seconds);
     the host returns the device key's signature over it; the server checks it
     against the key recorded at linking and stamps `proved_at`, exactly as a
     password does.
   - *Recommendation:* the **same ten minutes** and the **same routes** as
     [0083](0083-security-hardening-of-universo.md) item 6, no new route and
     no longer window; the constant stays a constant. The challenge is
     consumed on use, so a replay fails. A wrong signature goes through the
     sign-in's own delay and refusal (a refused sign-in line, counted).
   - Audit lines: a proof by device key, a refused one, a challenge expired
     unused; never the key, the signature or the challenge value.
   - The device key ends with the device session: when the session ends (the
     person removes the device, an admin ends it, a reset or an `admin reset`
     revokes the tokens, item 4 of 0083), the recorded public key is deleted
     in the same step, and the app deletes the private key from the keychain
     when it learns the session ended.
   - `[OPEN]` Whether a device linked before this exists is offered to make a
     key later. *Recommendation:* yes, on the next proof by password, with a
     visible line saying so.

3. **`[DECIDED 2026-10-28]` = (a), browser windows unchanged.** Browser windows.
   - (a) Unchanged: password, or a passkey where the person added one.
   - (b) Promote WebAuthn passkeys as the proof people are offered first.
   - *Recommendation:* (a) now; (b) is a separate decision, later. The
     browser has no keychain key of ours to bind to, and passkeys already
     work through `POST /api/me/prove/passkey`.

4. **Threats, as the assistant raised them.**
   - *A stolen, unlocked laptop:* the sensitive action still needs the OS
     check (Touch ID or the login password), which the thief lacks; it is no
     weaker than today, where the thief would need the account password.
   - *A copied device token without the keychain key:* the token alone gets
     `prove_first` and cannot sign the challenge; the proof fails. Where the
     keychain cannot mark presence as required, the key is still not
     exportable by an ordinary file copy.
   - *Malware running in the unlocked user session:* can ask the keychain to
     sign while the person is away only if the key does not require presence;
     where it does, the OS prompt shows. Same exposure as today's password
     typed into a hooked window; not claimed to be solved.
   - *A server that is not the one linked:* the challenge is bound to the
     session and the server's origin; a signature for one server is no proof
     for another.

5. **`[OPEN]` Contract and crates touched; the guardrail.**
   - The contract gains a command to start a device proof and one to finish it
     (the host signs, the window never sees the key); the TS types are
     generated ([0026](0026-core-ui-contract-inviolable-rules.md)). The
     existing `server_prove` stays as the fallback.
   - Crates: `verso-server` (the challenge, the recorded key, the stamp, the
     audit lines, the deletion with the session), `verso-service` only if the
     command goes through it, `app/src-tauri` (the OS check and the keychain
     are platform code; any `unsafe` they need stays within the exception
     [0029](0029-guardrails-in-ci.md) already allows, or the work asks for its
     own exception). New dependencies (a keychain crate, a signature crate)
     each need justification and a `cargo-deny` pass. The cross-platform
     checklist is read before the build.
   - Guardrail (feature group, seen failing before merge): a fresh proof by
     the device key is accepted and stamps `proved_at`; a replayed challenge,
     a signature by another device's key, a key of an ended session and an
     expired challenge are each refused with `prove_first` or the sign-in's
     refusal; the key is gone with the session; the gated routes of
     `tests_prove.rs` are exercised with a device proof as with the password.
   - *Recommendation:* the list above, as one build with the guardrail in the
     same PR.

6. **`[OPEN]` Accessibility and languages.**
   - The OS dialog is the OS's own, in the system language and with its own
     assistive support. Our dialog keeps the title and text in pt-BR and EN
     ([0035](0035-cross-cutting-requirements.md)), says which method it will
     use ("Confirm with Touch ID" or "Confirm with your password"), takes
     focus, is operable by keyboard, and offers the password as a visible
     way back so the person is never stuck. A cancelled or failed OS check is
     said in words, not silently.
   - *Recommendation:* as written; the exact strings are written with the
     build.

## Consequences

- A person who linked the app by the device code can make an invitation or
  approve a device without ever having typed a password on that machine.
- The server stores one more public key per device session and one more
  challenge table; both die with the session.
- Platform code grows on three OSes; Linux keeps the password path.
- A device whose key is missing or whose OS check is unavailable keeps
  working through the password, so no one is locked out.
- Cost: M for the server and the contract, M for the macOS and Windows hosts,
  S for Linux's fallback. Within the server's scope
  ([0073](0073-self-hosted-server-first.md)).

## Discarded alternatives

None recorded. Approving on another device (item 1 (c)) and passkeys in the
browser (item 3 (b)) are options left open, not discarded.

## Status

**Accepted in part (2026-10-28): items 1–3; not built.**

The maintainer, 2026-10-28, item 1: *"(b) Touch ID/Hello + chave"*, with the
option text he chose: *"Verificação do sistema + chave por aparelho; desafio de
60 s, vale 10 min; navegador sem mudança. Construir depois dos bloqueios da V1."*
So item 1 = (b); item 2 = a single-use 60-second challenge, a 10-minute window
and the same routes as [0083](0083-security-hardening-of-universo.md) item 6
(what the ADR recommended and what the chosen option names); item 3 = (a),
browser windows unchanged. **Build order:** after the V1 blocking items
(roadmap row [V.44](../roadmap.md)).

Still open, not answered: whether a device linked before this exists is offered
a key later (item 2's sub-item), item 5 (contract, crates, dependencies,
guardrail) and item 6 (accessibility and languages). Item 4 is the assistant's
analysis and decides nothing. Nothing is built.

*History (2026-10-23):* **Proposed.** Written by Sonnet 5.5 at the request of
the session. Items 1 to 3, 5 and 6 were `[OPEN]` for the maintainer, each with
a recommendation.
