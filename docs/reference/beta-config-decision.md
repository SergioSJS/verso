# Decision memo: where a test release keeps its indexes

- Date: 2026-09-24
- Status: **not decided.** It asks whether a decided point should be
  revisited, with options and a recommendation labelled as such; the
  maintainer decides (`CLAUDE.md` §1). No code follows this memo.
- Written by Opus 5.5 overnight, standing in for Fable 5.1 by the
  maintainer's decision of 2026-09-23; read by a fresh Opus 5.5 session under
  the same decision, and corrected after that reading: the first version
  presented a decided point as a gap.

## 1. What is decided

[ADR 0051](../adr/0051-development-flow-and-releases.md), Decision 6,
accepted on 2026-09-23: "A test release is "Verso Beta", with an identifier of
its own, so that it installs beside the production app with its own window
settings, and its command line opens it; the index, a rebuildable cache, is
shared."

The directory the index lives in is
[ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)'s, decided on
2026-09-22: `$VERSO_CONFIG_DIR`, else `$XDG_CONFIG_HOME/verso`, else
`~/Library/Application Support/verso` on macOS; the index of a folder is
`<config>/index/<name>-<hash>.sqlite`. The code does both: the beta and the
production app open the same index file for the same folder, while the
window's settings, workspaces and last folder live in the web view's storage,
which macOS keeps per identifier.

## 2. What sharing costs, seen while testing the first beta

- **A schema change rebuilds.** An index whose schema version is not the
  code's is dropped and built again (`crates/verso-index/src/schema.rs`). A
  beta with a newer schema and a production app with the older one rebuild
  each other's index every time the user switches — seconds on a large
  folder, nothing lost.
- **Both open at once, schemas different.** One rebuilds — drops and creates
  every table — while the other holds the file open: the other's next query
  can fail, or quietly return nothing, until it indexes again. Nothing in the
  folder is at risk: the index never writes to it.
- **Both open at once, same schema.** Two writers on one SQLite file: SQLite
  serializes them (each note is its own transaction), and each app's index is
  current after its own runs.

No production version is installed yet, so none of this has happened.

## 3. The options

| | (a) Share, as decided | (b) The beta has its own directory | (c) Share, one index file per schema version |
|---|---|---|---|
| Where | `…/verso` | `…/verso-beta` for a test release, `…/verso` for production | `…/verso/index/v6/…`, `…/verso/index/v7/…` |
| Schema changes | rebuild on every switch | none across channels | none |
| Both open at once | section 2 | independent | independent when schemas differ |
| Changes a decided text | no | ADR 0051 Decision 6, and ADR 0011's directory rule | ADR 0011's index path |
| Cost | none | the beta indexes each folder once; its command line must use the same directory as its app (a build-time channel given to both) | old version files stay until removed |

**Recommendation: keep (a)**, the decision, and revisit it at one point:
before a beta changes the index schema while a production version is
installed on the same machine. Until then the two costs of section 2 cannot
happen, and after it (b) is the smaller change.

## 4. What this memo did not verify

- Two apps open on the same folder at once was not run; section 2 follows
  from the code, not from a test.
- Windows and Linux are not built yet; where either would keep a beta's index
  is for their ports.

## 5. For the maintainer

1. Keep (a), or change it — (b) or (c) — through a revision of ADR 0051 and
   ADR 0011.
