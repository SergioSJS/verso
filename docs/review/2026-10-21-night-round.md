# Critical review — the night round of 2026-10-21 (`feat/rpg-tools`, `345eed15..HEAD`)

- Date: 2026-10-21
- Reviewer: Fable 5.1, read-only, in a session that received the repository
  and the diff and not the authors' sessions
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). Three Sonnet
  subagents read areas 4 to 6; the reviewer re-verified each of their
  findings against the code, and marked PLAUSIBLE the ones he could not
  confirm.
- Author of what is under review: Sonnet 5.5 agents coordinated by Opus 5.5
  (107 commits, 502 files).
- Fixers: Sonnet 5.5 agents, the documents and the draft fixtures on
  `docs/review-docs`, the code in parallel branches.
- Input: the review file of the reviewer
  (`verso-revisao-fable-2026-10-21.md`, outside the repository) and the
  branch `feat/rpg-tools`.
- Nothing in this document decides anything. A resolution that needs the
  maintainer says so. "Fixed in `docs/review-docs`, merged `4499898a`" means a
  commit on that branch, not yet merged and not yet read by the other model.

## Summary

| | Findings |
|---|---|
| BLOCKING | 1 |
| IMPORTANT | 7 (I1 to I7) |
| MINOR | 14 (M1 to M14) |

The core and the server held: the atomic write keeps invariants 9 and 11,
`read_picked` and the host's `pick_files` hand the window a name and bytes
and never a path, nested callouts walk with a stack, the BOM is skipped
without ever writing, and the read links (ADR 0105) are confined through the
same scope as a share, served through the reader's projection, paced per link
and per address, with their token kept as a hash and the headers of 0083
item 9 tested. No existing `expected.yaml` or `input.md` changed.

The one BLOCKING finding is by definition and not by merit: a draft fixture
without `observed:` or `source:`. The IMPORTANT ones are two holes in the
read links, a contradiction in ADR 0105, documents that still said "nothing
built", and two limits of the data diagram and the embed frame.

## 1. BLOCKING

| # | Finding | Resolution |
|---|---|---|
| B1 | `fixtures/callout/nested/expected.yaml` (a draft of this batch) has neither `observed:` nor `source:` (invariant 17; spec §4.5); `scripts/check-fixtures.sh` never required either | Fixed in `docs/review-docs`, merged `4499898a`: `source:` cites spec Q5 decided 2026-10-21 (the limit of 32 and `depth` are Verso's); `observed:` records the nesting seen through the Obsidian CLI (its cache lists one `callout` section per note, not the inner ones). `check-fixtures.sh` now fails a fixture with neither key; every other fixture already had one |

## 2. IMPORTANT

| # | Finding | Resolution |
|---|---|---|
| I1 | An anonymous visitor of a read link can run `reindex` on the owner's folder at the command pace (`visit.rs` `OWN`, `rpc.rs`) | Fixed `9fbe186f` (merge `fd894050`): a visitor's `reindex` answers the current summary and walks nothing; test `a_visitors_reindex_walks_nothing` |
| I2 | A link to one note shows the folder's name to the visitor, against ADR 0105 item 6 and the folder-link test (`readlinks.rs` `name_of`, `visit.rs`) | Fixed `6c702c2b` (merge `fd894050`): a note link is named after the note; the folder's name crosses neither the link's info nor `/state` (test asserts it); the visitor's window skips the folder-note rule |
| I3 | ADR 0105 item 5 says "stored only as a hash" and "copyable again from the panel while it lives"; the build and the threat model chose hash only | Recorded, not resolved, in `docs/review-docs` (merged `4499898a`): an `[OPEN]` line under item 5 in 0105 (both languages) with the contradiction and what was built. Closed 2026-10-21 (RL.1a, option A): hash only, as built; item 5 amended in [0105](../adr/0105-read-links-without-an-account.md) |
| I4 | ADRs 0105, 0100 and 0106, the ADR index and roadmap rows V.28, V.30, V.31 and V.32 said "nothing built"; 0105 had no roadmap row | Fixed in `docs/review-docs`, merged `4499898a`: an "As built 2026-10-21" paragraph with the commits in each ADR, the index rows, the four roadmap rows checked against `git log`, a new row V.33 for 0105, roadmap revision 12 |
| I5 | Data diagram: YAML aliases resolve in quadratic time (`datagraph/yamlParse.ts`) | Fixed `b256f9e9` (merge `fc41153f`): anchors kept in a map as the walk opens nodes; 100 000 aliases parse in under 3 s (over 120 s before) |
| I6 | PLAUSIBLE: data diagram caps bytes (20 MiB), not boxes (`datagraph/model.ts`, `view.ts`) | Fixed `b256f9e9` (merge `fc41153f`): past 200 000 boxes the diagram is not built and the tab says why, staying in text (the recommended option of the maintainer's open question D.1); "Save as board" refuses past 2000 cards |
| I7 | PLAUSIBLE: the embed frame's `allow-scripts allow-same-origin` sandbox has no guard against the app's own origin (`screen/framed.ts`, `leaves/web.ts`) | Fixed `f0f60899` (merge `fc41153f`): `isAppOrigin()` — the app's own origin, `tauri:`, `verso:`, `tauri.localhost` — is never framed, before any check |

## 3. MINOR

| # | Finding | Resolution |
|---|---|---|
| M1 | Spec Q24 (b): the decision says `tags: 2024` is the tag "2024"; the build does the opposite under the decision's own clause, without saying it awaits the maintainer | Fixed in `docs/review-docs`, merged `4499898a`: a dated "Adjusted by the build" paragraph under the decision, for (a) `...` not built (DL.1) and (b) a number is no tag (DL.2). The decision text is kept as recorded |
| M2 | Spec §9 marks several questions `DECIDED` while each says none is drafted yet | Not a rule-zero finding (decided is not closed, spec v0.47). No change; a distinct marker is the maintainer's choice |
| M3 | ADR 0106 and roadmap V.30 say seven formats; the code also parses TSV | Fixed in `docs/review-docs`, merged `4499898a`: recorded as an as-built note, not as a decision, in 0106 and V.30; the index title of 0106 no longer says only "JSON and YAML". Whether TSV stays is for the maintainer |
| M4 | The CLAUDE.md row for 0083 item 9 lists only `/`, `/api/state` and `/f/`; ADR 0083 and 0045 have no Revisions line for the first surface open to a visitor with no account | Fixed in `docs/review-docs`, merged `4499898a`: the row names the read-link routes; a dated Revisions line in 0083 and 0045 |
| M5 | `verso-fs` `check()` reports the path before `kept_spelling` (`write.rs`) | Fixed `6ff62f45` (merge `fd894050`) |
| M6 | `read_picked`: `metadata` then `open` (TOCTOU) (`external.rs`) | Fixed `5b003dfb` (merge `fd894050`): opened first (`O_NONBLOCK` on Unix), judged on the handle's own metadata |
| M7 | XML entity decoding looks up a plain object (`datagraph/xml.ts`) | Fixed `50787bc0` (merge `fc41153f`) |
| M8 | "Save as board" writes cell text as raw Markdown (`datagraph/saveBoardDoc.ts`) | Fixed `1b60f845` (merge `fc41153f`): keys and values written in code spans |
| M9 | `framed.ts` caches a failed `embed_frameable` for the session; `sanitize.ts` leaves the approve button disabled without a message | Fixed `f0f60899` (merge `fc41153f`): only a definite answer is cached, a failure retried after 30 s; a refused approval says why |
| M10 | ADR 0099 listed two discarded alternatives nobody is recorded as considering | Fixed in `docs/review-docs`, merged `4499898a`: both removed, "None other recorded", a Revisions line (rule zero item 4). The two entries marked "the first build" were not in the finding and stay |
| M11 | This round's review document still called 0100 "Proposed / Deferred"; ADR 0096 and its index row still said "Not built" | Fixed in `docs/review-docs`, merged `4499898a`: the three rows of `2026-10-20-rpg-round.md` updated; ADR 0096 gets a dated correction (built, merge `404ba0d4`) and its index row says built |
| M12 | `frontmatter/yaml-12` observed the date under key `d`, the fixture uses `when`; `frontmatter/tags-hash` observed only `"#quoted"`; a stale comment in `crates/verso-dialect/src/tags.rs:6-8` | Fixtures fixed in `docs/review-docs`, merged `4499898a`: re-observed with the exact inputs through the Obsidian CLI, the results equal the expected values, only the `observed:` text changed. The stale comment is code and is left to the code fixers |
| M13 | Small things in the window (`bundles/plan.ts`, `statblock/inherit.ts`, `datagraph/store.ts`, `theme/actions.ts`, `attachName.ts`) | Fixed `8fac165e` (merge `fc41153f`), each part with a test |
| M14 | A read link's `hello` and `app_info` give the visitor the server's version and commit; `PASSPHRASE_LEAST = 6` is short | Within what ADR 0105 decided; noted for the maintainer, nothing changed |

## 4. Checked and found sound

The reviewer's list of what he read and found right: the `verso-fs` write
and `read_picked`; the host's `pick_files`; the dialect's nested callouts
and BOM; the index's tag ancestors; the core's unresolved-link graph and
recommended theme; the server's scope, visitor, token, passphrase, bounds,
headers and owner's side; the window's theme import, data diagram, bundles
and the other parts he names; the seven new fixtures and the spec; the
documents' attributions and mirrors. See his file for each.

## 5. Not done

Nothing was built or run by the reviewer (no cargo, npm or Playwright); the
Windows-only `kept_spelling` was read, not exercised; I6 and I7 are
PLAUSIBLE for that reason. ADR 0104, in the main directory, was not
reviewed.

## 6. After the fixes

All findings but I3 (the maintainer's, RL.1a) are resolved and merged into
`feat/rpg-tools` (docs `4499898a`, window `fc41153f`, server `fd894050`; the
expiry test given margin for a slow machine `4bea8397`). Checks at
`4bea8397`, 2026-10-21: macOS — fmt, clippy `-D warnings`, 1277 Rust tests,
bindings, wasm32, 1291 window unit tests, sizes, mirror, fixtures, demo
vaults, npm licences; Linux (`scripts/check-linux.sh`) — 1267 Rust tests and
the server image, unit and backup script; Windows (`scripts/check-windows.sh`)
— 1243 tests and clippy; the window's end-to-end suite in Docker, WebKit and
Chromium with the phone and tablet projects — 1269 passed, 0 failed. Not
pushed, not released; the beta at `4bea839` installed on the maintainer's
Mac. The real app was not exercised by hand.

## 7. The maintainer's answers of 2026-10-21

The maintainer answered the decisions list of 2026-10-21 (`[DECIDED
2026-10-21]`), and looked at the beta installed at `4bea839`. The items that
have no ADR of their own are recorded here; the others are in the document
each one names.

- **I3 resolved** (RL.1a, option A): hash only; the address shown once.
  [ADR 0105](../adr/0105-read-links-without-an-account.md) item 5.
- **M1 resolved** (DL.1, option A; DL.2, option **B**): `...` does not close
  the frontmatter; `tags: 2024` **is** the tag "2024", the maintainer's
  explicit choice, which differs from Obsidian (spec Q24, v0.48). **M3
  resolved** (D.4, option A): TSV stays ([ADR 0106](../adr/0106-structured-data-as-a-diagram.md)).
- **F.1, option A: where remembered folds live.** On this device, outside the
  note and the folder; the last 200 notes are remembered. The note is never
  rewritten; another device opens everything expanded. (Not in the user's
  account, not in `.verso/`.)
- **M.1, option A: the grouped right-click menu** as built (`menu.ts`).
  "Select" and "Open in new window" do not return to the top.
- **R.3, option A:** "Add property" stays always visible on every note, also
  on the phone, where there is no hover.
- **R.4, option A:** no recharge badge on the cards (`recharge 5-6`) for now;
  no ADR asks for one.
- **L.1, option A:** the generic labels of the Old Dragon cards (Description,
  Size, Alignment, Habitat, Attributes, Languages, Utilities) get English
  labels in the English window, keeping the game's abbreviations (CA, BA, JP),
  as the Fractal ones already have.
- **X.1, option A:** the exception of three "unmaintained" notices in
  `deny.toml` is ratified until 2026-12-31 (review when the Tauri plugins change
  library).
- **The beta, seen by the maintainer:** *"Quase tudo ok, exceto a parte do
  wizard de tema, achei a tela mega puida…"* [poluída]: the theme wizard is
  revised ([ADR 0100](../adr/0100-visual-customization-wizard.md) item 2).
  Beside it he ticked "Read the English demo vault's translations" (notes 00,
  15 and 26 first), with no comment: what he found there, if anything, is not
  recorded. (Corrected 2026-10-21, see section 8: this line used to say that
  he read them and nothing was reported, which is more than a ticked box
  says.) He also ticked "Fractal licence — the authors' answer" without
  writing the outcome (the credit still says CC BY 4.0, 0099.6b; asked again
  as T.1 of the decisions list of the afternoon) and "Review of the Opus/Sonnet
  relationship", with no comment either.


## 8. The afternoon review

A second review, by Fable 5.1, of the afternoon batch of 2026-10-21
(`89a10272..013ba5ed`, `feat/rpg-tools`), recorded in
`verso-revisao-fable-tarde-2026-10-21.md` (outside the repository): one
BLOCKING (in the documents), ten IMPORTANT (six in the cloud sync code, four
in the documents) and twenty-one MINOR. "Fixed in `fix/review-cloud` (pending
merge)" is the code branch of another agent, not verified from this branch;
"Fixed here" is this documentation branch, `docs/review-afternoon`, not yet
merged and not yet read by the other model. "Question for the maintainer"
means nothing was decided: the questions are in the decisions list of the
afternoon.

| Id | Level | Finding | Resolution |
|---|---|---|---|
| B-1 | BLOCKING | The cards carry a one-line licence pointer while S.3b = B said "only on the Credits page"; two documents attributed the line to the maintainer. | Question for the maintainer (S.3b-bis). Recorded here as the build's choice in ADR 0099 item 6, `statblock-sources.md` and the CHANGELOGs, no longer attributed to him; no side picked. |
| I-1 | IMPORTANT | S3 `write` can return another device's ETag as the version of our bytes. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| I-2 | IMPORTANT | S3 rename deletes the destination unconditionally when the copy disagrees. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| I-3 | IMPORTANT | Delete on a service without a conditional `DELETE` has an unguarded HEAD-then-DELETE window, not recorded in the ADR. | Question for the maintainer: accept the window or refuse the connection (C.3 said refuse). Recorded in ADR 0104 "As built". |
| I-4 | IMPORTANT | WebDAV `exists` downloads the file. | Fixed in `fix/review-cloud`, merged `71cf8c2f`: a `PROPFIND` at depth zero. Recorded in ADR 0104 "As built". |
| I-5 | IMPORTANT | S3 answer bodies are read without a cap. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| I-6 | IMPORTANT | Turning a cloud folder's sync off throws away its base. | Fixed in `fix/review-cloud`, merged `71cf8c2f`: the base is kept, only the secret deleted. Recorded in ADR 0104 "As built". |
| I-7 | IMPORTANT | `[DECIDED]` stamps on ADR 0104 items no question asked; "Recommended" left after C.1/C.6 answered; C.7 not stated. | Fixed here: ADR 0104 (+ pt-BR) — "accepted with the ADR, not asked one by one", C.1 = A, C.6 = A and C.7 = A stated. |
| I-8 | IMPORTANT | Spec Q24 and the v0.48 row disagree on `tags-number`'s draft mark; the approved file's text changed after approval. | Fixed here: Q24 agrees with the file (no draft mark). Question for the maintainer: re-confirm the file as it now stands (I-8). |
| I-9 | IMPORTANT | Spec Q5 and Q22(b) record rules beyond the answers. | Fixed here: Q5's plain-blockquote rule marked as the build's behaviour awaiting him (question Q5-bis, a question for the maintainer); Q22(b) cites his answer Q22b = A of the list of 2026-10-20 (it was decided; the review missed it). |
| I-10 | IMPORTANT | ADR 0104 "As built" misses building choices; the Windows limit is presented as 2000. | Fixed here: ADR 0104 "As built" (+ pt-BR), roadmap V.40 and the threat model say 2560 is Microsoft's and 2000 the build's margin; C.13 recorded (being fixed in `fix/review-cloud`). (The roadmap's V.38 is the dialect row and carries no such figure.) |
| M-1 | MINOR | A secret is kept in the keychain before the person starts. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-2 | MINOR | The probe leaves multipart uploads open. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-3 | MINOR | The WebDAV probe deletes the shared `.verso-probe` folder. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-4 | MINOR | WebDAV collection URIs asked without a trailing slash (PLAUSIBLE). | Fixed in `fix/review-cloud`, merged `71cf8c2f`; to be checked against a non-Nextcloud server in the manual checks. |
| M-5 | MINOR | A changed-while-listing file costs a read on the next pass (safe). | No change needed; the cost goes with I-4. |
| M-6 | MINOR | `list_block_ids` loads every row before truncating. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-7 | MINOR | `truncated` is computed before the scope filters. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-8 | MINOR | Negative integers and floats not being tags are the build's choice, not in the spec. | Recorded in spec Q24 as the build's choice; question for the maintainer (T.3). |
| M-9 | MINOR | `create_picked` reads the whole file into memory. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-10 | MINOR | Tokens of a closed window are never dropped. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-11 | MINOR | The folder switcher's `place` label has no revision line on ADR 0026/0081. | Dated line added to ADR 0026 and 0081; question for the maintainer (T.9). Nothing decided. |
| M-12 | MINOR | The theme builder edits `settings.look` in place. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-13 | MINOR | `throwDice` can leak a WebGL context on failure. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-14 | MINOR | An empty data file renders an empty `<pre>`; the diagram box shows while loading. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-15 | MINOR | `statblock-sources.md` still says the RTG disclaimer sits at the foot of each blank card. | Fixed here: reworded to the current state, dated, in both languages. |
| M-16 | MINOR | The theme gallery's focus key splits on `|`. | Fixed in `fix/review-cloud`, merged `71cf8c2f`. |
| M-17 | MINOR | ADR index rows: 0105 item 5, 0104 "not built", 0100 item 2's revision. | Fixed here, both languages. |
| M-18 | MINOR | "mega puida" quoted as "mega poluída". | Fixed here: quoted verbatim, "[poluída]" after it (ADR 0100, this review's section 7, roadmap V.28, the pt-BR twins). |
| M-19 | MINOR | Section 7 inferred "he read the translations; nothing reported" from a ticked box. | Fixed here: section 7 says he ticked it, with no comment; the Fractal and Opus/Sonnet items recorded as ticked without outcome. |
| M-20 | MINOR | "None other recorded" in ADR 0099; ADR 0101 item 3's dangling sentence; ADR 0106's missing blank line; ADR 0104's 0104.2 deviation inside the source line. | Fixed here: "None recorded."; the sentence completed; the blank line restored (EN; the pt-BR twin already had it); the deviation stated on its own line. |
| M-21 | MINOR | The pt-BR field names of the World of Darkness and Cyberpunk RED layouts are the build's, not stated in ADR 0099. | Fixed here: ADR 0099 item 6 says they were chosen by the build from community terms, provisional (S.3c). |
