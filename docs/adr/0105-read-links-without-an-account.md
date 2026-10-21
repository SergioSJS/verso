# ADR 0105 — Read links without an account: a folder or one note of a UniVerso, open to whoever holds the link

- Date: 2026-10-20
- Source: a friend of the maintainer's, relayed on 2026-10-20: being able
  to publish or share notes as a wiki for others — players — to read,
  without paying for Obsidian Publish. Asked to choose between a link
  without an account on UniVerso and a static site exported from the app,
  the maintainer: *"nesse caso A. Link de leitura sem conta, no UniVerso
  faz mais sentido"* (in that case A, a read link without an account on
  UniVerso, makes more sense). In the same exchange: *"onde no escopo está
  compartilhamento a nível de arquivo em vez de pasta?"* (where in the
  scope is sharing a file rather than a folder?) — answered by item 2.
  Written by Opus 5.5; to be read by the other model before it is
  accepted ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0073](0073-self-hosted-server-first.md),
  [0081](0081-sharing-between-people-on-one-universo.md) (item 4: links
  anyone may open, "not now"; item 17: a single document, "not in the
  first version", a read-only share of one note first if asked —
  both revised here), [0087](0087-secret-blocks-hidden-from-readers.md)
  (what a reader is served), [0083](0083-security-hardening-of-universo.md),
  [0076](0076-the-window-on-every-screen.md),
  [0035](0035-cross-cutting-requirements.md).
- Status in the briefing: not present.
- Revisions: 2026-10-21 — the maintainer marked the options of the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21), 0105.2 to 0105.8, all
  as recommended: every `[PROPOSED]` becomes `[DECIDED 2026-10-21]`, and
  the ADR is Accepted. Nothing is built. 2026-10-21, later the same day —
  built on `feat/rpg-tools` (Status, As built); the review of the batch
  found item 5 contradicting itself and recorded it as `[OPEN]` under that
  item. 2026-10-21, later — the maintainer answered RL.1a to RL.1d of the
  decisions list of 2026-10-21, all option A: item 5's `[OPEN]` is closed
  (hash only; the address shown once), and items 4 and 6 gain the notes
  below.

## Context

A game master keeps the campaign in a UniVerso folder and wants the
players to read the world — places, people, factions, the session log —
without each of them making an account. Obsidian answers with Publish, a
paid service. Verso already has most of what a reading page needs: a
UniVerso serves a folder to an account that may only read, and serves it
as a **projection without secret blocks** everywhere — screen, search,
sync bytes, counts ([0087](0087-secret-blocks-hidden-from-readers.md)).
What it does not have is a reader with no account: [0081](0081-sharing-between-people-on-one-universo.md)
item 4 decided on 2026-10-10 that links anyone may open were "not now",
because a server of private notes starts without them.

A static site exported from the app was the other road — no server, any
free host, but a new export to publish each change. The maintainer chose
the link.

## Decision

Accepted (2026-10-21). Item 1 is the maintainer's choice, `[DECIDED
2026-10-20]`; the rest is `[DECIDED 2026-10-21]`, each the option he marked
in the questionnaire of 2026-10-20.

1. **A read link, on UniVerso, needing no account.** `[DECIDED
   2026-10-20]`. Whoever holds the link reads, in a browser, what it
   points at, through the same web window a reader account uses, with no
   way to write. This revises [0081](0081-sharing-between-people-on-one-universo.md)
   item 4's "not now".

2. **What a link points at: a folder, or one note.** `[DECIDED 2026-10-21]`
   (0105.2, option A; it also answers the read half of the per-note
   permission left open in [0073](0073-self-hosted-server-first.md)): a
   folder (with what is under it) or **a single note**. A note alone is
   the read-only share of one document that [0081](0081-sharing-between-people-on-one-universo.md)
   item 17 recommended "if it is asked for": being read-only, it needs no
   place for attachments or new notes; the pictures and notes it embeds
   are served with it; a link out of what was shared shows as plain text,
   "not shared". Sharing one note **to write** stays where item 17 left
   it.

3. **Who makes a link.** `[DECIDED 2026-10-21]` (0105.3a, option A): the
   **owner** of the folder, as
   for every share ([0081](0081-sharing-between-people-on-one-universo.md)
   item 4: one author per share in the audit log); from the folder's
   sharing panel and from a note's menu ("Copy read link…"). The
   **administrator** may turn the whole feature off for the server; it
   starts **off** on a new server and is turned on in the console
   `[DECIDED 2026-10-21]` (0105.3b, option A), so a server of private notes
   stays as it was until someone chooses.

4. **What the reader is served.** `[DECIDED 2026-10-21]` (0105.4, option
   A, not also a download of the folder as a zip): the reader's projection
   of [0087](0087-secret-blocks-hidden-from-readers.md) — no `[!secret]`
   block anywhere: the page, search, backlinks, the graph, counts; only
   what the link points at; notes, boards, maps and statblocks drawn
   read-only (a die may roll in the reader's own window and is written
   nowhere; no tracker or mark can be changed); no room, no presence, no
   sync, no history, no MCP, no download of the folder as a whole.
   Search and backlinks cover only what was shared.

5. **The link itself.** `[DECIDED 2026-10-21]` (0105.5, option A, with
   passphrase and expiry): an unguessable token of 256 bits in
   the path (`/r/<token>`), stored only as a hash; shown once in full
   when made (and copyable again from the panel while it lives); the page
   sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`, and
   asks search engines to stay away. A link may carry an **expiry** (none
   by default; 1 day, 7 days, 30 days, or a date) and a **passphrase**
   (none by default). The panel lists every live link of the folder, with
   what it points at, when it was made, its expiry, and when it was last
   opened; **revoke** ends it at once, open pages included.

   ~~`[OPEN]`~~ **Closed 2026-10-21** — see the decision at the end of this
   item. (Recorded 2026-10-21 by the review of the batch; rule zero item
   3, no side picked): this item contradicts itself. It says the token is
   "stored only as a hash" and also that the address is "copyable again
   from the panel while it lives"; a store that keeps only a hash cannot
   give the panel the address of a link made in another window or before a
   restart. What was built: the hash only, and the address copyable again
   only in the window that made it, kept in memory
   (`app/ui/src/readLinks.ts`); the threat model documents that reading
   ("The address is shown once, so it cannot be recovered by the owner,
   only made again", `docs/reference/threat-model.md`). The maintainer
   answers it (question RL.1a of the decisions list of 2026-10-21): either
   "copyable again" means "in the window that made it", and this item is
   amended, or the server keeps the token encrypted at rest, a different
   decision that needs its own threat-model row.)

   **`[DECIDED 2026-10-21]` (RL.1a, option A): the hash only, as built.** The
   token is stored only as a hash; the address is shown **once**, when the
   link is made, and can be copied again only in the same window that made
   it, while that window is open. Whoever loses the address makes another
   link. The phrase "copyable again from the panel while it lives" in the
   first paragraph is to be read this way. Reason (the list's): whoever
   steals the server's database cannot open any link. The alternative, the
   address encrypted on the server so it can be copied again from anywhere
   (B), is not chosen: the database would then hold something that opens the
   folder.

6. **Bounds and abuse.** `[DECIDED 2026-10-21]` (0105.6, option A): an anonymous request is paced per
   token and per address like the server's other routes ([0083](0083-security-hardening-of-universo.md)
   item 7); a wrong passphrase counts as a refused sign-in — the log line
   fail2ban reads and the bucket that mails the owner (0083 items 1
   and 2); every route behind a link is
   read-only and refuses anything else before the core acts; the headers
   of item 9 apply; a link never reveals the folder's path, the owner's
   e-mail or other members.

   **`[DECIDED 2026-10-21]` (RL.1b and RL.1c, both option A).** The pace as
   built stays: per address and per link, 20 requests a second (a burst of
   100) and 32 connections per link; a table of six players behind the same
   router shares one address. It is measured in a real session (it is in the
   manual checks, `docs/reference/manual-checks.md`) before the numbers are
   changed. And a folder link does not show attachments (images) stored
   outside the shared folder, for example in an attachments folder at the
   root: only what is inside the shared folder appears, so the link never
   reveals anything from outside it. Serving the attachments that the
   folder's notes cite from outside it (B) is not chosen.

7. **What the window shows to the owner.** `[DECIDED 2026-10-21]`
   (0105.7, option A, the mark and the warning of secrets): a note or folder
   with a live read link carries a small mark in the tree, so nobody
   forgets that a page is open to the world; making a link for a folder
   that holds secret blocks says, before it is made, how many notes have
   them and that readers will not see them.

8. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md))
   `[DECIDED 2026-10-21]` (0105.8, option A): the reading page in the reader's browser language, pt-BR or EN; the
   panel's words in both; the page usable by keyboard and a screen
   reader, as the web window is ([0076](0076-the-window-on-every-screen.md)).

## Consequences

- Server: a table of read links (token hash, target folder and path, kind
  folder or note, made by, made at, expiry, passphrase hash, last opened,
  revoked at); the `/r/<token>` routes; the reader projection reused; the
  console switch; the audit lines; the threat model gains a row.
- Window: the panel in the folder's sharing settings and "Copy read
  link…" in a note's menu; the mark in the tree; the read-only web window
  reached through a link.
- [0081](0081-sharing-between-people-on-one-universo.md) gains a
  Revisions line for items 4 and 17.
- The static site exported from the app is not built; it may come later
  for those without a server.

## Discarded alternatives

- **A static site exported from the app** (Obsidian Publish's and
  Quartz's way): considered with the maintainer on 2026-10-20; he chose
  the link for now. It needs no server, but every change is a new export.
- **Keeping the address encrypted on the server, to copy it again from
  anywhere** (RL.1a, B): the database would hold something that opens the
  folder.
- **Serving, through a folder link, the attachments the notes cite from
  outside the folder** (RL.1c, B): the link would reveal what is outside it.

## Status

Accepted (2026-10-21). Item 1 decided by the maintainer on 2026-10-20,
items 2–8 on 2026-10-21.

As built 2026-10-21, on `feat/rpg-tools` (not pushed, not released):
`ddfcdd73` (the link, the visitor's path and the owner's commands in the
server), `95827830` (fuzzing what anyone with no account may send),
`26c44c68` (the contract's `list`, `secrets`, `create` and `revoke`
commands), `c4534607` (making and reading links in the window), `8ec0dc3f`
(end-to-end tests), `4dbe4bbb` (threat model, manual checks, changelog,
tutorial); merged by `5690057e`. Item 5's contradiction was `[OPEN]` and
was closed on 2026-10-21 (RL.1a, option A). Roadmap row V.33 stays in V1
(RL.1d, option A): it was built now and enters with V1; it is not moved to
Phase 3.
