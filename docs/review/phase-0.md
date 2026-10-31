# Critical review — Phase 0

- Date: 2026-09-21
- Reviewer: Fable 5.1, in the role of document reviewer ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Input: `docs/BRIEFING.md`, `docs/adr/*`, `docs/spec/dialect.md`, `docs/roadmap.md`, `CLAUDE.md`, `.github/pull_request_template.md`, on the `fase0/docs` branch (commit `528bf7c`). No access to the author's session.
- Roadmap item: 0.6 — Critical review of the documents by an independent session.
- State: **findings accepted in full by the maintainer and applied** in the same
  session, by their order. Section 6 (Resolution) records what changed per finding
  and the choices the application had to make where the finding left options. The
  diff of the application needs a reading by Opus 5 before the merge
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md), consequence added).

## How to read

Each finding has an ID, a classification and the evidence (document and section). No finding proposes a decision: where the maintainer needs to choose, the finding says what needs to be chosen and why. Sections 1 to 5 are the original text of the review, unchanged; section 6 was added during the application.

| Level | Meaning ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOCKING | Violates an invariant, guardrail or decision; or loses data; or makes an exit criterion unsatisfiable. Phase 0 does not close with one of these open |
| IMPORTANT | Must be resolved, or explicitly deferred with a record |
| MINOR | At the author's discretion |

## Summary

| Level | Count | IDs |
|---|---|---|
| BLOCKING | 3 | C1, C2, C3 |
| IMPORTANT | 22 | C4–C9, R1–R8, I1–I3, L1–L5 |
| MINOR | 20 | C10–C16, R9–R13, I4–I6, L6–L10 |

The three BLOCKING ones have a short resolution and are all the maintainer's: an explicit promotion (or withdrawal) in `CLAUDE.md`, a scope delimitation in an invariant, and a reclassification of the guardrails in the roadmap.

---

## 1. Contradictions between documents

### C1 — `CLAUDE.md` promotes `PROPOSED` to an invariant (placeholder guard) — BLOCKING

- `CLAUDE.md` §2.2, invariant 10: "A placeholder file from on-demand storage is never interpreted as a deletion." An invariant is "BLOCKING by definition".
- `docs/BRIEFING.md` §8: the same item is `PROPOSED`.
- [ADR 0021](../adr/0021-sync-automerge-layered-config.md): status Proposed.
- `CLAUDE.md` opens by saying "This page creates no new rule" and Rule zero (§1, item 2) forbids promoting `PROPOSED` to `DECIDED`.

The document that states the rule is the first to violate it. The guard is good and probably should be decided, but the one who decides is the maintainer. Aggravating factor: [ADR 0021](../adr/0021-sync-automerge-layered-config.md), still Proposed, already imposes a requirement on Phase 1 ("the folder scan of Phase 1 already needs to distinguish a placeholder from a missing file").

**Needs the maintainer:** explicitly promote item 3 of ADR 0021 (with its own ADR or a status note), or remove invariant 10 from `CLAUDE.md` and the requirement about Phase 1 in ADR 0021.

### C2 — Invariant 5 ("disk access only in `verso-fs`") is contradicted by the decided crate structure — BLOCKING

- [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), rule 5: "Access to disk only inside the `verso-fs` crate." Accepted.
- [ADR 0028](../adr/0028-crate-structure.md): `verso-index` is "SQLite/FTS5". Accepted. Declared consequence: "Disk access confined to `verso-fs` stops being a convention and becomes an absence of dependency, auditable in `Cargo.toml`."
- [ADR 0023](../adr/0023-stack-core-and-editor.md): index in SQLite with FTS5. Accepted.

SQLite writes to disk (database file, journal or WAL). The dependency that does this (`rusqlite` or equivalent) lives in `verso-index`, not in `verso-fs`. Likewise, `verso-cli` reads arguments and prints, `verso-core` needs to read the config "outside the tree" ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)), and the benchmark generates a synthetic vault. Read literally, rule 5 makes the first PR of `verso-index` BLOCKING by definition, and the verification "absence of an IO dependency outside `verso-fs`" fails by construction.

The intention is probably "access to the files of the open folder only through `verso-fs`", but that is not written anywhere, and invariant 4 (opaque handles, "never a POSIX path as a string") has the same scope problem: `verso <folder>` ([ADR 0042](../adr/0042-open-from-command-line.md)) and the config "indexed by the folder path" (ADR 0011) are paths as strings by decision.

**Needs the maintainer:** delimit the scope of rules 4 and 5 (which crates, which files, which boundary — the core↔UI contract and the plugin API, or the inside of the core as well). Without that, the mechanical verification promised in ADR 0028 does not exist.

### C3 — "All guardrails before the first line of product" is unsatisfiable in Phase 0 as written — BLOCKING

- [ADR 0029](../adr/0029-guardrails-in-ci.md) and `CLAUDE.md` §3: "All in CI before the first line of product logic."
- `docs/roadmap.md`, Phase 0, criterion 4: "**Each** guardrail of ADR 0029 is seen failing on a test branch". The checklist that follows enumerates only five: `unsafe`, `unwrap` outside tests, a license outside the allowlist, a known advisory, a divergent `cargo fmt`.
- `docs/roadmap.md`, Phase 0: "No feature." Item 0.10: "five crates, empty".

Of the nine guardrails of ADR 0029, five are tests of product logic and cannot exist with empty crates: parser fuzzing, round-trip property test, atomic write, path confinement, FTS5 escaping. The benchmark is the sixth. "Each guardrail seen failing" and "no feature" cannot be true at the same time; the enumeration in criterion 4 tacitly admits this by listing only five, and includes `cargo fmt`, which is not in the table of ADR 0029.

**Needs the maintainer:** separate, in ADR 0029 and in the roadmap, the workspace guardrails (lints, `cargo-deny`, `fmt`), which enter in Phase 0, from the guardrails that accompany the feature they protect, which enter in Phase 1 with the feature. Criterion 4 of Phase 0 then enumerates exactly the first group, and Phase 1 gains the second as an explicit exit criterion.

### C4 — A reviewer role for UI/TypeScript code does not exist — IMPORTANT

- [ADR 0032](../adr/0032-author-and-reviewer-roles.md) and `CLAUDE.md` §5: "Author of UI and TypeScript: Opus 5"; "Code reviewer: Opus 5"; "Whoever wrote does not review what they wrote, neither in the same session nor later."

If "whoever" is the model, the UI code (Phase 2) has no reviewer. If "whoever" is the session, the phrase "nor later" makes no sense. The ADR defines a reviewer for the core (Opus 5) and for documents (Fable 5.1), but not for UI/TS.

**Needs the maintainer:** say who reviews UI/TS, and whether "whoever wrote" means the model or the session.

### C5 — The Phase 1 exit criterion depends on `PROPOSED` and `[OPEN]` items — IMPORTANT

- `docs/roadmap.md`, Phase 1, criterion 4: the agent answers "querying by type" and "cites the source block, and the citation leads to the exact position".
- [ADR 0014](../adr/0014-primitives-catalog.md) (Proposed): a typed note is a proposed primitive; "Nothing in this catalog is in Phase 1".
- `docs/spec/dialect.md` Q11: format and location of the schemas, `[OPEN]`, to be decided "before the typed note (2.6)", that is, in Phase 2.
- No document defines how "exact position" is represented (see L3).

"Querying by type" in Phase 1 requires a schema, which is only decided in Phase 2. The Phase 1 gate asks for something that the order of decisions prevents.

**Needs the maintainer:** remove "querying by type" from the Phase 1 criterion, or bring Q11 and a typed-note ADR forward to Phase 1.

### C6 — Approving a fixture becomes a decision channel that bypasses the ADR — IMPORTANT

- `docs/spec/dialect.md` §1: "The normative behavior is that of the fixtures, not that of this prose. Where the two diverge, the fixture wins and the spec is corrected."
- `docs/spec/dialect.md` §9: "Each question needs an answer from the maintainer before the corresponding behavior is implemented."
- [ADR 0031](../adr/0031-fixtures-as-contract.md): the AI may draft fixtures from the sixth onwards; the maintainer approves.
- `CLAUDE.md` §1, Rule zero: "Nothing that is not in the briefing or in an ADR becomes a decision."

A fixture drafted by the AI and approved answers, in practice, an `[OPEN]` question (Q2, Q3, Q6, Q13, Q14...) without going through the spec or through an ADR. The spec says it will be "corrected", but does not say by whom, in which PR, nor whether the question in §9 closes along with it. Rule zero and §1 of the spec point in opposite directions.

**Needs the maintainer:** define whether approving a fixture that answers a question closes the question (and then the fixture's PR needs to update §9 of the spec), or whether the question needs to be closed before the fixture exists.

### C7 — Phase 0 requires a `#^bloco` fixture whose form is `[OPEN]`, and the schema of `expected.yaml` does not exist — IMPORTANT

- `docs/roadmap.md`, Phase 0, criterion 5: five fixtures by hand "covering minimal distinct categories from §11.4".
- `docs/roadmap.md`, Phase 0, "Does not block the exit": `[OPEN]` dialect questions.
- `docs/spec/dialect.md` §5.5 and Q1: the field name for `#^bloco` is `[OPEN]`; the example uses `<field not yet defined>`.
- The spec, on the other hand, invents without ceremony the fields `embeds`, `callouts`, `kind`, `title` and `frontmatter` (§5.1, §5.6, §5.8), which are also not in the briefing. Rule zero was applied to one field and not to the others.
- No document defines the schema of `expected.yaml`: which keys exist, whether an absent key means "empty list" or "not asserted", whether the order of the items is the order in the document, whether `target` is the raw text of the link or a normalized value (`[[nota.md]]` → `nota` or `nota.md`?), how the same link appears when it combines a heading and an alias.

The first five fixtures will fix this schema implicitly, and `expected.yaml` is "untouchable". The contract is born without a grammar.

**Needs the maintainer:** fix the schema of `expected.yaml` (it can be a short section in the spec, marked as decided by them) and answer Q1 before item 0.9, or accept that the five fixtures decide this and record in the spec what they decided.

### C8 — "Step 5 of the plan" does not exist in any document — IMPORTANT

- `docs/BRIEFING.md` §3, §17 and [ADR 0005](../adr/0005-license.md), [ADR 0008](../adr/0008-documentation-language.md): three `[OPEN]` decisions (license, language, and the confirmation of the DCO) are deferred to "Step 5".
- The repository has phases (0, 1, 2), not steps. No document defines the plan or Step 5.
- [ADR 0005](../adr/0005-license.md) says "before the skeleton" (Phase 2); the roadmap requires `LICENSE` to close Phase 0. Compatible, but only because "before the skeleton" is vague.

**Needs the maintainer:** replace "Step 5" with a point in the roadmap (e.g.: "before the closing of Phase 0").

### C9 — Verification guardrails with no place in CI: WASM and generated types — IMPORTANT

- [ADR 0028](../adr/0028-crate-structure.md) and [ADR 0037](../adr/0037-base-parser.md): `verso-dialect` "compilable to WASM" is what mitigates the divergence between the editor's parser and the index's (§10.3).
- [ADR 0038](../adr/0038-ts-type-generation.md): "CI needs to verify that the generated types are up to date; otherwise rule 3 becomes a convention."
- Neither `cargo check --target wasm32-unknown-unknown -p verso-dialect` nor the verification of the generated types appears in the CI list of [ADR 0029](../adr/0029-guardrails-in-ci.md) or of the roadmap.

Two properties that the architecture depends on remain a promise, not a guardrail. The first already fits in Phase 1 (with the crate); the second, in Phase 2.

### C10 — `#[allow]`: `CLAUDE.md` forbids it, the PR template admits it — MINOR

- `CLAUDE.md` §3: "None may be turned off, worked around with a local `#[allow]`"; the exception "is the subject of its own PR".
- `.github/pull_request_template.md`: "No new `#[allow]` to silence a guardrail; if it was unavoidable, it is justified above" — in the same PR.

### C11 — Alternatives "implicitly discarded" violate the recording rule — MINOR

- `CLAUDE.md` §1 item 4 and `docs/adr/README.md`: only record an alternative that someone actually considered.
- [ADR 0007](../adr/0007-private-repo-until-license.md) and [ADR 0028](../adr/0028-crate-structure.md): "implicitly discarded". Implicit is the opposite of "actually considered".

### C12 — Spec §7 D7 labels as `DECIDED` an effect that is `PROPOSED` — MINOR

- `docs/spec/dialect.md` §7, line D7: status `DECIDED ([0016])`, but the "Effect" column asserts the separate shim with a declared table, which is [ADR 0017](../adr/0017-plugins-format-shim-loading.md), Proposed.

### C13 — [ADR 0042](../adr/0042-open-from-command-line.md) attributes `verso serve` to [ADR 0028](../adr/0028-crate-structure.md) — MINOR

- ADR 0028 lists `index, search, backlinks, mcp`. `verso serve` comes from [ADR 0025](../adr/0025-own-server-and-mobile-pwa.md), Proposed. The citation is wrong and mixes statuses.

### C14 — "pt-BR and EN from the first commit" is not verifiable as written — MINOR

- [ADR 0035](../adr/0035-cross-cutting-requirements.md) extends the decision to the "messages of the Phase 1 CLI: no loose string literal". The briefing says "from the first commit", which has already passed (it is documentation). The Phase 1 roadmap has no i18n item or exit criterion; only Phase 2 (2.7). The extension to the CLI implies a new dependency in `verso-cli` that nobody justified.

### C15 — Degradation to Markdown ([ADR 0013](../adr/0013-degrades-to-markdown.md)) versus `.canvas` in the base dialect — MINOR

- "All structured data degrades to readable Markdown" (Proposed) and "`.canvas` (JSON Canvas)" in the base dialect (Accepted, [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md)). JSON is not Markdown. [ADR 0040](../adr/0040-board-persistence.md) touches the subject without resolving it: "binary JSON does not do", but JSON Canvas is text. It is worth saying what "degrades to Markdown" means for data that is already born in another text format.

### C16 — Closing an `[OPEN]`: edit the ADR or write another one? — MINOR

- `docs/adr/README.md`: "An ADR is not edited to change one's mind. A new ADR supersedes the previous one." ADRs 0005, 0008, 0037–0040 are `[OPEN]` and will need to close. It is not said whether closing means editing the status or creating a new ADR. It matters because Phase 0 closes with ADR 0005 "leaving `[OPEN]` at that same moment".

---

## 2. Security, data loss and scalability risks not addressed

### R1 — Atomic write: the guardrail against data loss has gaps that lose data — IMPORTANT

[ADR 0029](../adr/0029-guardrails-in-ci.md) defines "temporary file + `fsync` + `rename`". No document deals with:

- `fsync` of the **directory** after the `rename`; without it, the rename may not survive a power loss on ext4/APFS.
- **Metadata** lost in the rename: permissions, owner, xattrs (Finder tags, quarantine), creation dates. The new file is born with the process's default mode.
- **Hard links** and **aliases** break: the rename replaces the inode.
- **Sync clients** (iCloud Drive, Dropbox, OneDrive, Syncthing) see "deleted and created", not "edited". Some generate a conflict copy; others, in on-demand folders, react badly to a temporary file appearing and disappearing. This is ironic in the face of the placeholder guard ([ADR 0021](../adr/0021-sync-automerge-layered-config.md)).
- **Network filesystems** (SMB, NFS) where rename is not atomic.
- **Windows** (a target platform): replacing an existing file requires `MoveFileEx` with `REPLACE_EXISTING`, and handles opened by antivirus or OneDrive make the rename fail.

None of this needs to be decided now, but it needs to enter as a requirement of feature 2 of Phase 1 and as a test case, not as a discovery.

### R2 — Concurrent external modification: silent lost update — IMPORTANT

The decided use case is the same folder open in Obsidian and in Verso ([ADR 0012](../adr/0012-files-are-source-of-truth.md)). No document speaks of detecting that the file changed on disk since it was read (mtime, size or hash) before writing. Without that, Verso writes over an edit made in another app, with no diff and no warning, which is exactly what invariant 8 forbids. This also applies to writing by an agent over a stale index (a wrong block position corrupts the file). Phase 2 is where the first write path enters; the rule needs to exist before that.

### R3 — Symlinks and paths: the confinement exists, the policy does not — IMPORTANT

The "path confinement" guardrail ([ADR 0029](../adr/0029-guardrails-in-ci.md)) prevents leaving the folder via `../` or a symlink. It is not said:

- whether a symlink **inside** the folder pointing outside is followed (exposing data from outside the folder to the index, to MCP and to plugins) or ignored (breaking whoever keeps the attachments folder as a symbolic link, a common practice);
- symlink to a directory with a loop;
- what an **opaque handle** is bound to: an open descriptor (`openat`, immune to a path swap between checking and using) or an index into a table of strings (the check is still by path, and the TOCTOU window stays open);
- stability of the handle across sessions, across renames and across workspace roots. The agent (MCP) and the contract need a stable identifier; if the stable identifier ends up being the path, invariant 4 becomes packaging.

### R4 — `verso serve`, remote WebSocket and the contract: authentication is not part of the contract — IMPORTANT

[ADR 0025](../adr/0025-own-server-and-mobile-pwa.md) records "authentication and exposure" as a question to be opened "when the server enters scope". But the core↔UI contract is defined in Phase 2 (item 2.1), "defined first", and it is the piece the server reuses. A contract designed without session identity, without per-operation authorization and without a notion of "who is on the other side" has to be redone when the server arrives. The risk is not implementing auth now; it is deciding in Phase 2 a contract that does not accommodate it.

### R5 — `verso mcp`: transport, exposure surface and injection via folder content — IMPORTANT

Phase 1 delivers `verso mcp` read-only. No document says:

- **transport**: stdio (child process of the client) or HTTP/SSE (local port). If it is a port, then binding on `localhost`, origin, DNS rebinding and the absence of a token come in — known and public problems of local MCP servers.
- that "read-only" still delivers the whole folder, including what the player view (Q9) will want to hide, to any client that connects.
- that the content of the notes is **untrusted** input for the agent (downloaded schema packs, notes shared by players, material pasted from the web). Prompt injection via a note is the obvious vector, and the agent write path (diff before applying, [ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) is the mitigation, but it is not recorded as a mitigation of that risk in §10.3.

### R6 — The index copies the whole folder outside it — IMPORTANT

[ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md): index in the user's configuration directory. FTS5 stores the text. Unrecorded consequences:

- the content of the vault (including the game master's secrets and any key someone has pasted into a note) comes to exist in the clear in a second place, with backups (Time Machine, iCloud) and permissions different from the folder's;
- deleting or moving the folder does not delete the copy;
- an encrypted folder or one on a removable volume gains a shadow on the local disk.

It needs a decision about where the index lives when the folder is sensitive, and about cleanup. Compare with the care given to API keys in the keychain ([ADR 0019](../adr/0019-generative-opt-in-and-keychain.md)).

### R7 — Plugin capability model: consent at installation is the known weak model — IMPORTANT

[ADR 0016](../adr/0016-plugins-execution-and-capabilities.md) (Accepted) fixes "consent at installation". [ADR 0027](../adr/0027-runtime-capabilities.md) lists `fs:arbitrary`, `fs:external`, `proc:spawn`, `net:fetch`. There is no record of:

- that `vault:read` + `net:fetch` is complete exfiltration of the folder, and that a plugin with `proc:spawn` is outside any sandbox;
- revocation, consent at runtime, or the difference between a "platform" capability and a "permission" capability (ADR 0027 itself notes the two vocabularies and leaves it open);
- integrity and origin of the plugin: signature, hash, an update that gains a new capability without new consent;
- that schema packs "do not execute code" ([ADR 0015](../adr/0015-schema-packs.md)) is only true if a schema has no templates, expressions or queries — and materializable views ([ADR 0014](../adr/0014-primitives-catalog.md)) suggest that it will.

Plugins are out of scope until Phase 2, but the API is one of the three irreversible decisions (§10.4). Recording this as a question before designing the API costs one line; afterwards, it costs the API.

### R8 — Renaming a note and the updating of links in other files — IMPORTANT

Obsidian rewrites every file that links to a renamed note. Verso will have a file tree in Phase 2 (2.3). Rewriting N files because of one rename is writing without "opening", in bulk, and with no diff — it collides with invariants 7 and 8 if it is automatic, and it breaks the links of whoever uses the folder in Obsidian if it is not. No document speaks of renaming, creating, deleting (system trash or `unlink`?) or moving files. These are Phase 2 operations with potential for data loss.

### R9 — On-demand storage placeholder: the guard has no mechanism — MINOR

Beyond C1: neither the briefing nor ADR 0021 says how a placeholder is detected (iCloud uses `.nome.md.icloud`; OneDrive uses a file attribute on Windows and another one on macOS; Dropbox and Google Drive have their own). The initial platform is macOS, where iCloud Drive is the most common case of a notes folder. The decision needs to come with the list of what is recognized.

### R10 — `cargo-deny` and advisories: red CI from a new advisory with no policy — MINOR

An advisory published on a Saturday leaves CI red with no PR to blame. It is not said how this is handled (a list of exceptions with justification and a deadline). There is also no mention of a versioned `Cargo.lock` or of dependency auditing beyond license and advisory.

### R11 — Resource limits: size, depth, loops — MINOR

Q17 covers a malformed file. It does not cover: a file of hundreds of MB, a single line of tens of MB, thousands of nested brackets (quadratic parser), a deep directory tree, a symlink loop, and the inotify watch limit on Linux (a large vault blows past the kernel default). Fuzzing catches a crash, not slowness; the benchmark catches regression, not a limit.

### R12 — FTS5 tokenizer for pt-BR — MINOR

The product is pt-BR and EN by decision. The default FTS5 tokenizer handles neither accents (`Café` ≠ `cafe`) nor stemming. Since the index is a cache, changing it later is just a reindex, which makes this reversible — but the first benchmark baseline must be taken with the right tokenizer already, or the baseline is invalid.

### R13 — Write provenance records personal data in the file — MINOR

"Author, model, when" in the frontmatter ([ADR 0014](../adr/0014-primitives-catalog.md), Proposed) is personal data that goes along with the file in sync, export and sharing with players. It deserves a line about what is recorded and whether it is opt-in.

---

## 3. Irreversible decisions with insufficient evidence

### I1 — License: interactions not analyzed in [ADR 0005](../adr/0005-license.md) — IMPORTANT

The ADR compares packages A and B by one criterion (use over the network). Three are missing that change the conclusion:

1. **iOS and the App Store.** iOS is a decided target platform ([ADR 0022](../adr/0022-target-platforms-macos-first.md)). Distributing code under (A)GPL through the App Store is widely considered incompatible with the store's terms, except when the publisher holds all the copyright — which the DCO-without-CLA model ([ADR 0006](../adr/0006-contribution-dco-no-cla.md)) prevents as soon as there is an outside contribution. Package B + DCO + iOS is a combination that needs analysis before being chosen.
2. **"Going from A to B later is possible" is imprecise.** Clause 3.3 of the MPL-2.0 allows distributing a larger work under a secondary license (AGPL among them); it does not convert the MPL files, which remain MPL. Relicensing the whole project still requires consent. The tie-breaking criterion recorded in the briefing is stronger than the license supports.
3. **Code written by AI and copyleft.** The whole core will be written by a model ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). The copyright status of AI-generated code is undefined in several jurisdictions, and copyleft depends on copyright to be enforceable. The DCO asks whoever signs to certify the origin and the right to submit. No document touches the subject. It is not an engineering decision; it is a question to take to someone who understands it, before settling the license.

### I2 — Plugin API: "Web Worker" is Accepted with no evidence at all that a UI plugin is possible that way — IMPORTANT

[ADR 0016](../adr/0016-plugins-execution-and-capabilities.md) decides TypeScript in a Web Worker, with no disk, everything through the core. Discarded alternatives: only "direct disk access" and "binary compatibility". There is no record of:

- that a Web Worker has no DOM: a plugin registers no view, modal, CodeMirror extension, side panel or icon. Most Obsidian plugins exist to do exactly that. The ADR does not say how a plugin in a worker contributes UI (a declarative UI protocol by message? a sandboxed iframe? CM6 extensions loaded on the main thread, which breaks "no direct access"?). Figma's plugin model solves this with its own expensive architecture; none of that was considered.
- that sync transports as plugins ([ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md), Accepted) need to run in the background, and a worker in a mobile WebView does not run in the background (a restriction recorded in [ADR 0009](../adr/0009-external-constraints.md)).
- that a "format familiar to whoever writes Obsidian plugins" ([ADR 0017](../adr/0017-plugins-format-shim-loading.md)) with an asynchronous API and no DOM is familiar only in the `manifest.json`.

The decision may be right. It is recorded as Accepted with zero evidence for the hard part, and it is irreversible after the first plugin.

### I3 — Dialect: fixtures with no recorded origin and a base chosen with no declared criterion — IMPORTANT

- [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md) lists what is "compatible base". The only source cited is the briefing. Obsidian's public documentation ("Obsidian Flavored Markdown") documents more constructs — tags, `%%` comments, `==` highlight, math, tables, footnotes, Markdown links to a file, `[[nota#h1#h2]]` — and no criterion is stated for what was left out. Q15 records this as `[OPEN]`, but the Accepted ADR should cite the public source that backs the list, by the admissible-sources rule of [ADR 0009](../adr/0009-external-constraints.md).
- The maintainer's five fixtures encode "behavior observed from the outside". No document requires the fixture to record **how** it was observed (Obsidian version, reproducible step). Without that, a fixture records the maintainer's memory, not an observation, and there is no way to contest it again when Obsidian changes. An `observed_at:` field (or equivalent) in the `expected.yaml`, or a `README` per case, solves it.

### I4 — Stack ([ADR 0023](../adr/0023-stack-core-and-editor.md)) Accepted with "No alternative recorded" — MINOR

Rust, Tauri v2, CM6 and SQLite are defensible choices, and the UI is reversible before Phase 2. But Tauri v2 mobile is young, and the iOS WKWebView imposes limits on CM6 and on workers that nobody listed. It is worth at least one line per item saying why it was not Electron, ProseMirror/Tiptap, or Lexical — even if the answer is "not evaluated".

### I5 — MCP in the core ties the core to an evolving third-party protocol — MINOR

[ADR 0018](../adr/0018-llm-native-mcp-in-core.md), Accepted. The MCP specification has changed transport and authorization model more than once. Putting the server in the core (and not in a plugin) is a reasonable decision; what is missing is the policy of the supported protocol version and what happens when it changes.

### I6 — Opaque handles: an Accepted decision with no semantics — MINOR

Complements R3. Rule 4 ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)) is the only point of the contract that is already decided and that is expensive to change, and it does not say what a handle identifies, how long it is valid, nor whether it survives a rename. This goes into the contract in Phase 2 and into MCP in Phase 1.

---

## 4. Gaps in the dialect spec

Spec §9 is already a good list. Below, what a Phase 1 parser needs to know and that not even §9 asks about.

### L1 — Headings do not exist in the spec — IMPORTANT

The Phase 1 roadmap, feature 1, is "parsing of links, blocks, **headings** and frontmatter". The spec has no heading section, has no `headings:` key in the `expected.yaml`, and does not say how the text of `[[nota#seção]]` matches a heading: case sensitivity, punctuation and spaces, emoji, inline formatting in the heading (`## *Porão* ^2`), duplicate headings, path of nested headings (`[[nota#Cap 1#Seção]]`). Without that, backlinks to a section (exit criterion 2 of Phase 1) have no definition.

### L2 — Ordinary Markdown links to a local file are not mentioned — IMPORTANT

`[texto](nota.md)`, `[texto](../pasta/nota.md)`, `[texto](nota%20com%20espa%C3%A7o.md)`, `[texto](<nota com espaço.md>)` and the image form `![](img.png)`. Obsidian documents and resolves these forms as links, and the app itself can be configured to write them instead of wikilinks. A whole vault may not have a single `[[ ]]`. The spec and the minimal fixture categories ignore the case, and it decides whether backlinks are right.

### L3 — Position in the file: a decided requirement with no representation — IMPORTANT

"Verifiable citation, with a link back to the exact position" is `DECIDED` (§7, [ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) and is an exit criterion of Phase 1. The `expected.yaml` has no position field (line, column, offset in bytes or in characters?), so the corpus does not test positions, and the parser can pass all the fixtures without producing them. Related: a stable block ID "with backlinks and presence in the graph" is only stable for an `^id` written in the file; for a block without `^id`, an ID that lives only in the index is not stable (the index is a cache, [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) and an ID written by the app violates invariant 7. The spec should say that the citation of a block without `^id` is by position, and what the position is.

### L4 — "Round-trip" has two readings and they choose different parsers — IMPORTANT

[ADR 0012](../adr/0012-files-are-source-of-truth.md): "round-trip becomes a mandatory property test". [ADR 0037](../adr/0037-base-parser.md): "faithful preservation of the file". Two interpretations:

1. The parser produces a **lossless** tree (CST) and `serialize(parse(x)) == x` byte for byte. This requires an own parser or a base with complete positions; `pulldown-cmark` does not do it without a lot of work.
2. The parser is read-only for the index; "opening never rewrites" is guaranteed by never writing on the read path, and edits are textual patches by position. `serialize` does not exist and the property test tests something else (e.g.: parsing does not panic and is deterministic).

The choice between 1 and 2 decides the base parser ([ADR 0037](../adr/0037-base-parser.md)), the cost of Phase 1, and how merge by block ([ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md)) and writing by an agent will work. It is not made anywhere and ADR 0037 does not list it among the criteria.

### L5 — What the scan ignores, and what a "block" is — IMPORTANT

- **Ignored paths**: `.obsidian/`, `.git/`, `.trash/` (Obsidian's trash, full of notes with links), hidden files, `node_modules/`, the attachments folder. Does a note in `.trash/` that links to another one count as a backlink? This changes the result of exit criterion 2 of Phase 1. Q16 asks about file types, not about paths.
- **"Block"** is used throughout the documentation (block ID, merge by block, visibility by block, block citation) and never defined: paragraph, list item, table cell, whole callout, code block? Obsidian documents its own notion; the spec needs its own before Q3 and Q4 make sense.

### L6 — Combined forms and wikilink escapes — MINOR

`[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` and `[[#^bloco]]` (same file, empty target — does it count as a backlink to itself?), `[[pasta/nota]]`, `[[nota.md]]`, `[[nota\|alias]]` inside a table, `\[[não é link]]`, `[[ nota ]]` with spaces, `![[img.png|300]]` (the `|` is size, not alias), `[[nota|alias|extra]]`, and a wikilink inside a Markdown link or an image.

### L7 — Frontmatter: boundary and YAML dialect — MINOR

A BOM before the `---`, CRLF (invariant 7 requires preserving line endings, but nothing says which ending is "the file's" when there is a mix), `---` followed by `...`, empty frontmatter, invalid YAML (Q17 covers it partially), and the YAML version: in 1.1, `yes`, `no`, `on` and dates become booleans and timestamps; in 1.2, they do not. Is `tags: 2024` a number or a tag? Wikilinks inside frontmatter values (`related: "[[nota]]"`), which Obsidian's Properties treat as links. A `#` prefix in frontmatter tags.

### L8 — Charset of the `^id` and the form of tags — MINOR

Q3 and Q4 cover position and uniqueness; what is missing is the allowed alphabet (Obsidian's public documentation restricts it to letters, numbers and hyphen) and what happens with an invalid `^id`. For tags (Q13), what is missing is the charset, nested tags `#a/b`, and case sensitivity.

### L9 — Q7 starts from an outdated fact about macOS — MINOR

The spec says that "macOS writes file names in NFD". That was HFS+. APFS preserves the form it receives and does normalization-insensitive lookup. The question is still valid (files coming from HFS+, from other platforms and from sync mix forms), but the decision must start from the current behavior. Likewise, APFS can be case-sensitive per volume; Q8 treats macOS as always insensitive.

### L10 — Encoding and non-text files — MINOR

A `.md` file that is not valid UTF-8 (Latin-1 from an old vault, UTF-16 with a BOM from Windows): an error, text with replacement, or ignored? Q17 speaks of "malformed" without separating encoding from syntax.

---

## 5. Observations outside the four categories

Recorded for completeness; none is a classified finding.

- Model names (`Opus 5`, `Fable 5.1`) are written into an Accepted ADR ([0032](../adr/0032-author-and-reviewer-roles.md)). They will age; the role matters more than the name.
- [ADR 0009](../adr/0009-external-constraints.md) cites Obsidian's terms of use with neither a link nor a date of consultation. For a restriction "that only leaves here if the source changes", the source needs to be locatable.
- Exit criterion 2 of Phase 2 presupposes that the maintainer's vault is in git. That holds for them; it is not a safety net for anyone else. Local history or a snapshot before writing by an agent and before conversion is a candidate for a primitive, not for a plugin.
- The roadmap has no place for writing by an agent with a diff (`DECIDED`, §7): Phase 1 is read-only MCP and Phase 2 does not mention it. It sits in "After Phase 2", with no order.
- Phase 2, item 2.6 ("one note type end to end"), depends on promoting [ADR 0014](../adr/0014-primitives-catalog.md) (typed note) and [ADR 0013](../adr/0013-degrades-to-markdown.md), both Proposed. The Phase 2 decision table lists only Q11 and ts-rs/specta.

---

## 6. Resolution

Applied on 2026-09-21 by order of the maintainer ("I accept all the changes, you
can apply them and update everything" — "aceito todas mudanças, pode aplicá-las e
atualizar tudo"). Where the finding left two options, the "Choice made" column
says which one was taken and why; each one is revertible by a veto from the
maintainer. No dialect `[OPEN]` was closed; what was a question became a recorded
question with a deadline.

### BLOCKING

| ID | Where it changed | Choice made |
|---|---|---|
| C1 | New ADR 0043 (Accepted); ADR 0021 loses item 3 and points to 0043; BRIEFING §8 promoted to `DECIDED` (v0.2); `CLAUDE.md` invariant 10 cites 0043 | **Promote**, not withdraw: the maintainer wrote the invariant and §10.3 already listed it as a mitigation for data loss. The detection mechanism per provider stays `[OPEN]` (feature 2 of Phase 1) |
| C2 | ADR 0026: "Scope of rules 4 and 5" subsection + consequences; ADR 0028: consequence rewritten; ADR 0029: `disallowed_methods` lint for `std::fs`; `CLAUDE.md` §2.1 items 4 and 5 and §3 | Rule 5 = **files of the open folder**; the index, the config and the CLI's IO stay outside. Rule 4 = **what crosses the contract**; a path as a string only at the edge and in `verso-fs`. The text of briefing §10.1 was not changed: the delimitation lives in the ADR |
| C3 | ADR 0029: "workspace" and "feature" tables, with the phase in which each one enters; roadmap Phase 0 item 0.11 and criterion 4; Phase 1 criterion 3; Phase 2 criterion 3; `CLAUDE.md` §3; PR template | A feature guardrail enters **in the same PR** as the feature and is seen failing there. `cargo fmt` entered the workspace table |

### IMPORTANT

| ID | Where it changed | Choice made |
|---|---|---|
| C4 | ADR 0032 (item 5 and the per-artifact table); `CLAUDE.md` §5; BRIEFING §14.1 | "Whoever" = **the model**. UI/TS reviewer = Fable 5.1, the only option with two models. New consequence: a reviewer who applies its own findings becomes the author, and the other model reads the diff |
| C5 | Roadmap Phase 1 criterion 4 and feature 6; ADR 0018 | **Remove** "querying by type" from Phase 1; it enters with the typed note (2.6). Citation by `^id` or by position |
| C6 | ADR 0031 consequence; spec §1; `CLAUDE.md` invariant 17; PR template | A fixture that answers an `[OPEN]` question only enters in the PR that closes the question, with spec §9 updated; the approval in that PR is the decision |
| C7 | Spec §4 rewritten as the schema of `expected.yaml` (`PROPOSED`); §5.5 and §5.6 use `block`; §8; roadmap 0.9 and criterion 5 | Schema **drafted and marked `PROPOSED`**; confirmation by the maintainer by a line in the spec or by the five fixtures by hand. Q1: `block` proposed. The fields invented in v0 (`embeds`, `callouts`, `kind`, `title`, `frontmatter`) are now declared in the same place and with the same status |
| C8 | BRIEFING §3, §17; ADRs 0005 and 0008; roadmap 0.7 and 0.8; `CLAUDE.md` §8 | "Step 5" → "before the closing of Phase 0" everywhere |
| C9 | ADR 0029 (WASM and generated types lines); `CLAUDE.md` §3; roadmap Phase 1 criterion 3 and Phase 2 criterion 3 | WASM in feature 1; generated types in item 2.1 |
| R1 | ADR 0029, "Requirements of the atomic write" subsection; `CLAUDE.md` invariant 9 | Six requirements with a test each; Windows enters when Windows enters |
| R2 | ADR 0012 consequence; `CLAUDE.md` invariant 11 (new); ADR 0048; roadmap Phase 2 criterion 2 | Check of mtime+size or hash before writing; divergence → diff, never a silent overwrite |
| R3 | New ADR 0044 (`[OPEN]`); ADR 0026 consequence; roadmap Phase 1 and Phase 2 (decisions) | Recorded, not decided. Deadlines: symlinks and paths before feature 2; handles before feature 6 and item 2.1 |
| R4 | New ADR 0045 (`[OPEN]`); ADR 0026 consequence; ADR 0025; roadmap Phase 2 (decisions) | Session identity and authorization enter the contract from item 2.1 on, even if in local IPC everything is granted |
| R5 | ADR 0045; ADR 0018 consequences; roadmap Phase 1 (decisions) | Transport, surface and protocol version before feature 6. Folder content recorded as untrusted input; diff before applying recorded as a mitigation |
| R6 | New ADR 0046 (`[OPEN]`); ADR 0011 consequence; roadmap Phase 1 (decisions) | Location, permissions and cleanup before feature 3 |
| R7 | New ADR 0047 (`[OPEN]`); ADR 0016 consequence; ADR 0015 consequence | ADR 0016 remains Accepted; 0047 lists what needs to be answered before the API is designed |
| R8 | New ADR 0048 (`[OPEN]`); roadmap Phase 2 (decisions and criterion 2) | Rename, create, delete, move and the updating of links before item 2.3 |
| I1 | ADR 0005 (three pending analyses; tie-breaking criterion corrected); BRIEFING §3 (criterion corrected, v0.2); roadmap 0.7 and criterion 2 | No license decision. The decision now requires the three analyses. The correction of clause 3.3 of the MPL was made in the briefing as well, being a correction of fact, recorded in the History |
| I2 | ADR 0047; ADR 0016 consequence | Same as R7. The status of 0016 did not change |
| I3 | ADR 0030 (public source cited; the list is a minimum, not a ceiling); ADR 0031 and spec §4.5 (`observed:`) | `observed:` mandatory in a compatibility fixture; `source:` in a fixture of own behavior |
| L1 | Spec §5.12 (headings, with `expected.yaml`); §4.3; §8 new category; Q19 | Heading matching stays `[OPEN]` (Q19) |
| L2 | Spec §5.13 (`PROPOSED`); §4.2 `syntax` field; §8 new category; Q20 | Proposal: they count as links, `target` decoded. Marked `PROPOSED` because the briefing does not list the form |
| L3 | Spec §4.4 (`pos`); §8; ADR 0018; ADR 0014; ADR 0037; roadmap Phase 1 criterion 4 | `line`/`col` starting from 1, `col` in Unicode characters. A block without `^id` is cited by position; an ID that lives only in the index is not stable |
| L4 | Spec Q18; ADR 0037 (criterion and order: Q18 before the comparison); ADR 0012 consequence; ADR 0029 (the round-trip line cites Q18); roadmap Phase 1 (decisions) | Not decided. Q18 precedes the choice of parser |
| L5 | ADR 0044 (ignored paths); spec Q21 ("block") and Q26; roadmap Phase 1 criterion 2 | "Block" stays `[OPEN]` (Q21). Ignored paths live in 0044 and the by-hand list of criterion 2 follows the decision |

### MINOR

| ID | Where it changed | Choice made |
|---|---|---|
| C10 | PR template (checkbox rewritten) | Aligned with `CLAUDE.md`: a guardrail that blocks legitimate work is its own PR |
| C11 | ADRs 0007 and 0028 | "Implicitly discarded" → "None recorded", with what was not evaluated in parentheses |
| C12 | Spec §7 D7 | Status separated: execution `DECIDED` (0016), shim `PROPOSED` (0017) |
| C13 | ADR 0042 | `verso serve` cited from 0025 (Proposed) |
| C14 | ADR 0035; roadmap Phase 1 feature 7 and criterion 6 | "First commit" = first commit of product code. A CLI in two languages becomes an item and a criterion of Phase 1 |
| C15 | ADR 0013 consequence | "Readable Markdown" = text readable in the format the data already has; `.canvas` does not contradict it |
| C16 | `docs/adr/README.md`, "How to change an existing ADR" section | Three cases: correction in place with `Revisions:`; change of decision by a new ADR; closing an `[OPEN]` or promoting a Proposed by editing Decision and Status in place |
| R9 | ADR 0043 (consequences) | Mechanism per provider `[OPEN]`, iCloud Drive first |
| R10 | ADR 0029 consequences; `CLAUDE.md` §3 | An advisory exception only with justification, link and expiration; versioned `Cargo.lock` |
| R11 | Spec Q17 broadened; ADR 0044 | Resource limits recorded as a question |
| R12 | ADR 0046; ADR 0023 consequence; roadmap Phase 1 (decisions) | Tokenizer before the baseline |
| R13 | ADR 0014 consequence | Provenance: personal data, opt-in to be decided in the primitive's ADR |
| I4 | ADR 0023 (risks not evaluated; alternatives not evaluated recorded as a record, not as a discard) | Status did not change |
| I5 | ADR 0045; ADR 0018 consequence | The MCP protocol version enters the decision of feature 6 |
| I6 | ADR 0044 | Same as R3 |
| L6 | Spec Q23; §5.6 (embed with size) | Combined forms and escapes recorded |
| L7 | Spec Q24 | Frontmatter boundary and dialect recorded |
| L8 | Spec Q22 | Charset of `^id` and the form of tags recorded |
| L9 | Spec §5.10, Q7 and Q8 | Text corrected for APFS; the question remains |
| L10 | Spec Q25 | Encoding separated from syntax |

### Observations from section 5

| Observation | State |
|---|---|
| Model names in an Accepted ADR | **Not changed.** Replacing them with an abstract role is a change of decision (ADR 0032, Accepted); it is up to the maintainer |
| Link and date of Obsidian's terms of use (ADR 0009) | **Not changed.** It requires consulting the source in order to cite it with a date; the AI must not invent the citation. It is up to the maintainer to record it |
| The vault in git as the only safety net | **Not changed.** A local snapshot before writing by an agent is a candidate for a primitive; it enters the conversation with the catalog (ADR 0014), after Phase 2 |
| Writing by an agent with no phase | Roadmap, "After Phase 2": recorded as `DECIDED` with no phase assigned |
| Promotion of 0014 and 0013 before 2.6 | Roadmap Phase 2, decision table: line added; ADR 0014 consequence |

### What remains the maintainer's

1. Confirm the schema of the `expected.yaml` (spec §4, `PROPOSED`) and the
   proposed answer to Q1 — by a line in the spec or by the five fixtures by hand.
2. Decide the license (ADR 0005) with the three analyses answered, and the
   language (ADR 0008), before closing Phase 0.
3. Ask Opus 5 for the reading of the diff of this application (ADR 0032).
4. Record the link and date of Obsidian's terms of use in ADR 0009, if they want
   to close the observation.
5. Veto any line of the "Choice made" column above. Each one is a revertible
   commit; none promotes `PROPOSED` beyond C1, which was an explicit order.

---

## 7. Independent reading of the application (Opus 5)

- Reader: Opus 5, author of neither this review nor the commit it reads
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). Input: `016b328`, read
  file by file against the documents at that commit. **No BLOCKING.**
- Section 6 is a faithful map of the diff: every row lands where it says, and no
  finding is marked resolved without a change that resolves it. Nothing went from
  `PROPOSED` to `DECIDED` and no `[OPEN]` was closed beyond C1, which the
  maintainer ordered; Q1 moved to `PROPOSED`, a proposal, not a closure.

### Choices that go past the finding — to ratify or to veto

- **C4, IMPORTANT.** The finding asked *who* reviews UI/TS; the application
  answered, and wrote the answer into `BRIEFING.md` §14.1, a `DECIDED` section —
  neither a status change nor a correction of fact, which is the limit the same
  commit writes into the briefing's own header.
- **C1, IMPORTANT.** ADR 0043 is Accepted with two items the promoted sentence
  does not contain: placeholder as "present, content unavailable" with the index
  keeping the last known version (item 2), and the guard valid from Phase 1
  (item 3). Only "never a deletion" was promoted.
- **R2, IMPORTANT.** `CLAUDE.md` invariant 11 is new and BLOCKING by definition,
  and its only backing is a consequence added to ADR 0012 in the same commit:
  rule and base written together, by the AI. It is the C1 pattern one step over.
- **I3, IMPORTANT.** "The list is a minimum, not a ceiling" (ADR 0030) widens the
  reach of an Accepted decision; the finding asked only for source and criterion.
- **I1 and C14, MINOR.** ADR 0005's three pending analyses are not the finding's
  three; C14 gained a Phase 1 scope item and a sixth exit criterion.

### Contradictions introduced, not noted in the review

- **IMPORTANT.** ADR 0026 (Accepted) requires the contract to be born with
  session identity and per-operation authorization, while ADR 0045 answers
  "Decision: none" on the same point: required and open at once. It is also the
  one decision dressed as an open question in 0043–0048; 0046 (diacritics) and
  0044 (rule 4 as form, not security) are MINOR, 0047 and 0048 are clean.
  *Resolved on 2026-09-21: the ADR 0026 consequence now says the contract's
  shape must not preclude them; the decision stays open in 0045.*
- **IMPORTANT.** Spec §4 and roadmap 0.9 let the five fixtures confirm the schema
  "by following it"; ADR 0031, in the same commit, requires the PR that closes
  the question, with §9 updated. Two procedures for the act C6 was about.
  *Resolved on 2026-09-21: the rule change in ADR 0031 item 4 and the explicit
  closure of Q1 in the fixtures PR left one procedure, the approval in the PR.*
- **MINOR.** Briefing §14.3 and rule 5 of ADR 0026 keep the wording that C3 and
  C2 re-read elsewhere, with no pointer; ADR 0030 cites Obsidian's docs with no
  date while §6 refuses to cite ADR 0009's source for that very reason.
  *Resolved on 2026-09-21: pointer added to briefing §14.3; ADR 0030 now names
  the pages and the consultation date.*

### Ratification status

**Ratified by the maintainer on 2026-09-21** ("ok" to the consolidated list):
C4 (reviewer role in briefing §14.1), ADR 0043 items 2–3, `CLAUDE.md`
invariant 11, ADR 0030 "minimum, not ceiling", the fixture rule change written
into briefing §11.4, and the absence of `Signed-off-by` on the Phase 0 commits
(sign-off required from the first Phase 1 commit on, ADR 0006). Nothing vetoed.
