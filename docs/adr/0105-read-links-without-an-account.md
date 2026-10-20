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

Proposed (2026-10-20). Item 1 is the maintainer's choice, `[DECIDED
2026-10-20]`; the rest is `[PROPOSED]`, each with the recommendation.

1. **A read link, on UniVerso, needing no account.** `[DECIDED
   2026-10-20]`. Whoever holds the link reads, in a browser, what it
   points at, through the same web window a reader account uses, with no
   way to write. This revises [0081](0081-sharing-between-people-on-one-universo.md)
   item 4's "not now".

2. **What a link points at: a folder, or one note.** `[PROPOSED]`: a
   folder (with what is under it) or **a single note**. A note alone is
   the read-only share of one document that [0081](0081-sharing-between-people-on-one-universo.md)
   item 17 recommended "if it is asked for": being read-only, it needs no
   place for attachments or new notes; the pictures and notes it embeds
   are served with it; a link out of what was shared shows as plain text,
   "not shared". Sharing one note **to write** stays where item 17 left
   it.

3. **Who makes a link.** `[PROPOSED]`: the **owner** of the folder, as
   for every share ([0081](0081-sharing-between-people-on-one-universo.md)
   item 4: one author per share in the audit log); from the folder's
   sharing panel and from a note's menu ("Copy read link…"). The
   **administrator** may turn the whole feature off for the server; it
   starts **off** on a new server and is turned on in the console
   `[PROPOSED]`, so a server of private notes stays as it was until
   someone chooses.

4. **What the reader is served.** `[PROPOSED]`: the reader's projection
   of [0087](0087-secret-blocks-hidden-from-readers.md) — no `[!secret]`
   block anywhere: the page, search, backlinks, the graph, counts; only
   what the link points at; notes, boards, maps and statblocks drawn
   read-only (a die may roll in the reader's own window and is written
   nowhere; no tracker or mark can be changed); no room, no presence, no
   sync, no history, no MCP, no download of the folder as a whole.
   Search and backlinks cover only what was shared.

5. **The link itself.** `[PROPOSED]`: an unguessable token of 256 bits in
   the path (`/r/<token>`), stored only as a hash; shown once in full
   when made (and copyable again from the panel while it lives); the page
   sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`, and
   asks search engines to stay away. A link may carry an **expiry** (none
   by default; 1 day, 7 days, 30 days, or a date) and a **passphrase**
   (none by default). The panel lists every live link of the folder, with
   what it points at, when it was made, its expiry, and when it was last
   opened; **revoke** ends it at once, open pages included.

6. **Bounds and abuse.** `[PROPOSED]`: an anonymous request is paced per
   token and per address like the server's other routes ([0083](0083-security-hardening-of-universo.md)
   item 7); a wrong passphrase counts as a refused sign-in — the log line
   fail2ban reads and the bucket that mails the owner (0083 items 1
   and 2); every route behind a link is
   read-only and refuses anything else before the core acts; the headers
   of item 9 apply; a link never reveals the folder's path, the owner's
   e-mail or other members.

7. **What the window shows to the owner.** `[PROPOSED]`: a note or folder
   with a live read link carries a small mark in the tree, so nobody
   forgets that a page is open to the world; making a link for a folder
   that holds secret blocks says, before it is made, how many notes have
   them and that readers will not see them.

8. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)):
   the reading page in the reader's browser language, pt-BR or EN; the
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

## Status

Proposed (2026-10-20). Item 1 decided by the maintainer; items 2–8 are
recommendations for him to answer.
