# Decision memo: `<iframe>`, `<video>` and `<audio>` in a note (spec Q6)

- Date: 2026-09-24
- Status: **not decided.** Options and recommendations, labelled as such; the
  maintainer decides (`CLAUDE.md` §1). No code follows this memo: what a note
  may load into the window is a security boundary, and it waits for the
  answer.
- The question: spec Q6 ([dialect spec](../spec/dialect.md), section 9) keeps
  `[OPEN]` the embedded HTML that Obsidian's public documentation shows in a
  note and the window drops — `<iframe>`, `<video>`, `<audio>`. The answer of
  2026-09-23 rested on "the reading view follows Obsidian", which does not
  hold for these three (`docs/review/phase-2.md` §7).

## 1. What the window does now

The core's HTML reaches the page only through an allowlist
(`app/ui/src/sanitize.ts`): a note from a shared folder is untrusted input
([ADR 0045](../adr/0045-server-and-mcp-security.md)), so what runs, loads,
styles the page or embeds another page is dropped with everything it holds.
`iframe`, `video`, `audio`, `source` and `track` are in that list. A note
that embeds a video from its attachments, or a map from a site, shows nothing
in their place.

The network rule is [ADR 0050](../adr/0050-outbound-network-access.md): the
window asks the network only for addresses written in the notes or clicked,
and a "load remote content" setting covers what loads with no click (today a
remote image and a web note's icon).

## 2. What each element brings

| | `<video>` / `<audio>` from the folder | `<video>` / `<audio>` from the web | `<iframe>` |
|---|---|---|---|
| Typical use | a clip or a recording in the attachments | a file on a site | a map, a video player, a sheet from a site |
| Runs code in the window | no (media element; `controls`, no scripts) | no | yes, in the frame — the site's own page |
| Reaches the network | no (the app's file protocol) | yes, when shown | yes, when shown; and whatever the site's page asks for |
| Reaches the commands | no | no | not with the host's capabilities, which answer the app's own views only (review phase 2, B3); a remote frame is not one |
| What can go wrong | a large file loaded when the note is shown | as a remote image: a request the user did not click | a page that looks like part of the app (a login form), tracking, heavy pages, and the frame navigating itself |

## 3. The options

### 3.1 `<video>` and `<audio>`

| | (a) Keep dropping them | (b) Allow them, sources resolved like images |
|---|---|---|
| Local file | nothing shown | played through the app's file protocol, as `![[clip.mp4]]` would be |
| Remote file | nothing shown | loaded only with "load remote content" on; off, it becomes a link, as a remote image does (ADR 0050) |
| Attributes kept | — | `src`, `controls`, `loop`, `muted`, `poster` (resolved like `src`), `preload`, `width`, `height`; `autoplay` dropped |

**Recommendation: (b).** It follows Obsidian for the common case — media in
the vault — and adds no network access the setting does not already govern.

### 3.2 `<iframe>`

| | (a) Keep dropping it | (b) A click to load, remote content on | (c) Load as written, remote content on |
|---|---|---|---|
| What the note shows | nothing | a box with the site's address and a button; the frame loads on the click | the frame |
| Network | none | on the click (ADR 0050 point 1: clicked by the user) | when the note is shown |
| Frame | — | `sandbox` with scripts and the site's own origin, no top navigation, no pop-ups, no forms reaching the app; `https:` only | as (b) |
| Risk | none | a page that imitates the app, once clicked | the same, with no click |

**Recommendation: (b)**, and (a) meanwhile. A frame is the one element here
that runs someone else's code in the window; a click keeps it an act of the
user's, as ADR 0050 asks of everything that is not set to load by itself.

## 4. What this memo did not verify

- Obsidian's own handling of these elements beyond its public documentation
  (which shows them in a note) was not observed: what it sandboxes, and
  whether it asks before loading, were not checked (ADR 0009 allows observing
  from outside; it was not done for this memo).
- The window's content security policy was not re-read for media and frame
  sources; whichever option is chosen, the policy has to allow it too, and
  that is a second change.

## 5. For the maintainer

1. `<video>` / `<audio>`: (a) or (b).
2. `<iframe>`: (a), (b) or (c).
