# Decision memo: where a test release keeps its indexes

- Date: 2026-09-24
- Status: **not decided.** Options and a recommendation, labelled as such; the
  maintainer decides (`CLAUDE.md` §1). No code follows this memo yet: the
  change is small and waits for the answer.
- Found while testing the first beta, `0.2.0-beta.1`, on 2026-09-24, and put
  to the maintainer in session the same night; unanswered when this was
  written, so recorded here.

## 1. What happens now

[ADR 0051](../adr/0051-development-flow-and-releases.md) says a test release
is "Verso Beta", with an identifier of its own, "so that it installs beside
the production app with its own window settings". That part holds: the
window's settings, workspaces and last folder live in the web view's storage,
which macOS keeps per identifier (`dev.verso.app.beta` against
`dev.verso.app`).

The indexes do not follow it. The configuration directory
([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) is named by
`verso-core`, not by the app: `$VERSO_CONFIG_DIR`, else
`$XDG_CONFIG_HOME/verso`, else `~/Library/Application Support/verso` on macOS.
The beta and the production app therefore open the same index file for the
same folder. Today it holds only `index/`.

## 2. What sharing costs

- **A schema change rebuilds.** An index whose schema version is not the
  code's is dropped and built again: it is a cache (ADR 0011,
  `crates/verso-index/src/schema.rs`). A beta with a newer schema and a
  production app with the older one rebuild each other's index every time the
  user switches between them — seconds on a large folder, nothing lost.
- **Both open at once, schemas different.** One rebuilds (drops the tables)
  while the other holds the file open: the other's next query fails until it
  opens the folder again. Nothing in the folder is at risk — the index never
  writes to it — but the app shows errors.
- **Both open at once, same schema.** Two writers on one SQLite file, each
  with its own idea of the listing: SQLite serializes them; each app's index
  ends up current after its own runs.

No production version is installed yet, so none of this has happened.

## 3. The options

| | (a) Share, as now | (b) The beta has its own directory | (c) Share, one index file per schema version |
|---|---|---|---|
| Where | `…/verso` | `…/verso-beta` for a test release, `…/verso` for production | `…/verso/index/v6/…`, `…/verso/index/v7/…` |
| Schema changes | rebuild on every switch | none across channels | none |
| Both open at once | the failures of section 2 | independent | independent when schemas differ; shared when equal |
| Cost | none | the beta indexes each folder once; its CLI must use the same directory as its app | old version directories stay until removed |
| How | — | a build-time channel (`VERSO_CHANNEL=beta`) given to the app and the CLI by the release workflow, read where `verso-core` names the directory; `VERSO_CONFIG_DIR` still wins | the schema version in the index path |

**Recommendation: (b).** It gives the beta what ADR 0051 promised for window
settings — its own state — and matches what the user sees: two apps. The
beta's command line (`verso` from the beta's archive) must use the beta's
directory, or `verso index` from it would write where the beta app never
looks; the same channel variable covers both builds.

## 4. What this memo did not verify

- Two apps open on the same folder at once was not run; section 2 follows
  from the code, not from a test.
- Where Windows and Linux would put `verso-beta` follows ADR 0011's rules for
  them; neither is a target yet.

## 5. For the maintainer

1. (a), (b) or (c).
2. If (b): the directory's name (`verso-beta` proposed).
