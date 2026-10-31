# ADR 0047 — Open questions on the plugin API

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R7, I2
- Status in the briefing: not present; fences in [0016](0016-plugins-execution-and-capabilities.md) (Accepted) and [0017](0017-plugins-format-shim-loading.md) (Proposed)

## Context

The plugin API is one of the three decisions that are expensive to reverse
(§10.4). What is already Accepted — TypeScript in a Web Worker, no disk,
capabilities declared with consent at install time — was decided without any
record of how it solves the problems below. Plugins are out of scope until the
end of Phase 2; this ADR exists so that the questions reach the API design, and
not after it.

## Decision

None. Questions recorded, to be answered before designing the API.

### UI model

- A Web Worker has no DOM. A plugin in a worker registers no view, modal,
  CodeMirror extension, side panel or icon — and most Obsidian plugins exist to
  do exactly that.
- Known paths: declarative UI by message, iframe with sandbox, CM6 extensions
  loaded on the main thread (which breaks "no direct access" and requires
  another trust boundary). Each one has its own cost; Figma's plugin model is
  the most studied reference and it is expensive.
- "Format familiar to whoever writes Obsidian plugins" ([0017](0017-plugins-format-shim-loading.md))
  is only familiar in `manifest.json` if the API is asynchronous and DOM-free.

### Background and mobile

- Sync transports as plugins ([0020](0020-sync-merge-in-core-transports-as-plugins.md),
  Accepted) need to run in the background. A worker in a mobile WebView does not
  run in the background ([0009](0009-external-constraints.md)).

### Capability model

- `vault:read` + `net:fetch` is complete exfiltration of the folder;
  `proc:spawn` is outside any sandbox. Consent has to say that in the language
  of whoever installs.
- Consent only at install time is the known weak model: it lacks revocation,
  runtime consent for dangerous capabilities, and fresh consent when an update
  asks for a new capability.
- Two vocabularies — permission (`vault:read`) and platform (`fs:watch`) —
  already noted in [0027](0027-runtime-capabilities.md): one namespace or two.
- Integrity and origin: signature, hash, distribution channel.

### Schema packs

- "Installing a pack does not execute code" ([0015](0015-schema-packs.md)) is
  only true if schema has no templates, expressions or queries. Materializable
  views ([0014](0014-primitives-catalog.md)) suggest it will. Where the line
  between content and code falls.

## Consequences

- [0016](0016-plugins-execution-and-capabilities.md) remains Accepted; this ADR
  does not reopen it. It says what has to be answered so that the API can be
  designed without contradicting it.
- If any answer requires changing [0016](0016-plugins-execution-and-capabilities.md),
  that is a new ADR superseding it, decided by the maintainer.

## Discarded alternatives

None recorded.

## Status

`[OPEN]`. Answer before designing the plugin API (after Phase 2).

*2026-10-21* — the decisions questionnaire of 2026-10-20 (answered 2026-10-21), all option A: the questions **0047.1** (UI model), **0047.2** (background and mobile), **0047.3** (consent and permissions) and **0047.4** (the content/code boundary in packs, together with [0015](0015-schema-packs.md)) `[DECIDED 2026-10-21]` wait for after V1, as plugins do. The questions themselves stay unanswered; only their moment is decided.
