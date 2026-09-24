# Decision memo: `<iframe>`, `<video>` and `<audio>` in a note (spec Q6)

- Date: 2026-09-24
- Status: **not decided.** Options and recommendations, labelled as such; the
  maintainer decides (`CLAUDE.md` §1). No code follows this memo: what a note
  may load into the window is a security boundary, and it waits for the
  answer.
- Written by Opus 5.5 overnight, standing in for Fable 5.1 by the
  maintainer's decision of 2026-09-23; read by a fresh Opus 5.5 session under
  the same decision, and corrected after that reading.
- The question: spec Q6 ([dialect spec](../spec/dialect.md), section 9) keeps
  `[OPEN]` the embedded HTML the window drops — `<iframe>`, `<video>`,
  `<audio>` — on the premise that Obsidian shows it. That premise holds for
  `<iframe>` only: Obsidian's public help shows `<iframe>` (the pages "Embed
  web pages" and "HTML content", which also says that Obsidian sanitizes the
  HTML in notes); no public page shows `<video>` or `<audio>` in a note's raw
  HTML — audio and video in the vault are documented as `![[…]]` embeds — and
  whether Obsidian resolves a vault-relative `src` in raw HTML was not
  observed. The spec repeats the unsourced part; this memo records it rather
  than repeating it.

## 1. What the window does now

The core's HTML reaches the page only through an allowlist
(`app/ui/src/sanitize.ts`): a note from a shared folder is untrusted input
([ADR 0045](../adr/0045-server-and-mcp-security.md)), so what runs, loads,
styles the page or embeds another page is dropped with everything it holds.
`iframe`, `video`, `audio`, `source` and `track` are in that list, and an
`<img>` keeps only an `https`/`http` or `data:image` address — a
relative `src` names nothing and goes. The window has no audio or video embed
of its own either (`![[clip.mp4]]` is not drawn as a player today).

Three more boundaries stand behind the allowlist:

- The network rule, [ADR 0050](../adr/0050-outbound-network-access.md): the
  window reaches the network "only in the four ways" it lists — a web note's
  page, a clicked link, a web note's icon, a remote image — and its "load
  remote content" setting covers the two that need no click.
- The content security policy (`app/src-tauri/tauri.conf.json`): media from
  the app's file protocol only, frames from the app's file protocol only.
- The navigation guard (`may_navigate`, `app/src-tauri/src/lib.rs`): the app's
  own views may go to the app's pages and the file protocol, never to
  `https:`; and it is asked for every frame, not only the window's own (wry
  passes no frame to it).

## 2. What each element brings

| | `<video>` / `<audio>` from the folder | `<video>` / `<audio>` from the web | `<iframe>` |
|---|---|---|---|
| Typical use | a clip or a recording in the attachments | a file on a site | a map, a video player, a sheet from a site |
| Runs code in the window | no (a media element; `controls`, no scripts) | no | yes, in the frame — the site's own page |
| Reaches the network | no (the app's file protocol) | yes, when shown | yes, when shown; and whatever the site's page asks for |
| Reaches the commands | no | no | not with the host's capabilities, which answer the app's own views only (`docs/review/phase-2.md`, reading 1, finding 3); a remote frame is not one |
| What can go wrong | a large file loaded when the note is shown; the file protocol has no range requests, and whether WebKit plays media through it was not checked | as a remote image: a request the user did not click | a page that looks like part of the app (a login form), tracking, heavy pages, the frame navigating itself |

## 3. The options

### 3.1 `<video>` and `<audio>`

| | (a) Keep dropping them | (b) Allow them from the folder and, with remote content on, from the web |
|---|---|---|
| Local file | nothing shown | played through the app's file protocol: a relative `src` resolved against the note, which the sanitizer does for no element today |
| Remote file | nothing shown | loaded only with "load remote content" on; off, it becomes a link, as a remote image does |
| Attributes kept | — | `src`, `controls`, `loop`, `muted`, `poster` (resolved like `src`), `preload`, `width`, `height`; `autoplay` dropped |
| Changes a decided text | no | ADR 0050: a remote video or audio is a fifth way to the network, which its setting would have to cover |

**Recommendation: (b) for files in the folder**, which adds no network
access; remote media as a separate question, since it amends ADR 0050.
Whether it "follows Obsidian" is not established (see above).

### 3.2 `<iframe>`

| | (a) Keep dropping it | (b) A click to load, remote content on | (c) Load as written, remote content on |
|---|---|---|---|
| What the note shows | nothing | a box with the site's address and a button; the frame loads on the click | the frame |
| Network | none | on the click | when the note is shown |
| Frame | — | `sandbox` with scripts and the site's own origin, no top navigation, no pop-ups; `https:` only | as (b) |
| Also changes | nothing | the CSP's frame sources; the navigation guard, which refuses `https:` for every frame of the app's views and would have to tell a note's frame from the window itself; ADR 0050 (a new way to the network, on a click) | the same, and ADR 0050's rule that nothing loads without a click unless the setting says so |
| Risk | none | a page that imitates the app, once clicked | the same, with no click |

**Recommendation: (b)**, and (a) meanwhile. A frame is the one element here
that runs someone else's code in the window, and the navigation guard that
keeps the window on the app's own pages has to learn to let a frame out
without letting the window out: that is a change to review on its own.

## 4. What this memo did not verify

- Obsidian's handling of these elements beyond its public help was not
  observed (ADR 0009 allows observing from outside; it was not done for this
  memo): what it sandboxes, whether it asks before loading, and whether a
  vault-relative `src` in raw HTML plays.
- Whether WebKit plays audio and video through the app's file protocol, which
  answers no range request.

## 5. For the maintainer

1. `<video>` / `<audio>` from the folder: (a) or (b); from the web: later, or
   with (b) and a revision of ADR 0050.
2. `<iframe>`: (a), (b) or (c).
