# ADR 0016 — Plugins: TypeScript in a Web Worker, no disk, with declared capabilities

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §6, §10.1
- Status in the briefing: `DECIDED`

## Context

The plugin system is central to the project: it is what lets the community
evolve Verso without depending on the maintainer. It is also the third decision
that is expensive to reverse (§10.4): once plugins exist, the API does not
change for free.

## Decision

1. The plugin system is our own and central to the project.
2. Plugins are written in TypeScript and run in a Web Worker, with no direct
   disk access; all access goes through the core.
3. The manifest declares the required capabilities (e.g. `vault:read`,
   `vault:write`, `net:fetch`, `fs:external`), with consent at install time.

## Consequences

- No plugin API can expose a filesystem path; access is mediated by opaque
  handles from the core
  ([0026](0026-core-ui-contract-inviolable-rules.md)).
- The Web Worker imposes asynchrony: the plugin API is asynchronous by
  construction, which diverges from the Obsidian API and feeds the risk
  recorded in §10.3.
- Consent at install time requires the capabilities to be readable by whoever
  installs, not only by whoever programs.
- A plugin that needs privileged access is a sign that the API is wrong
  ([0017](0017-plugins-format-shim-loading.md)).
- Plugins are out of scope until the end of Phase 2
  ([0034](0034-roadmap-in-phases.md)); the API must not be frozen before that.
- This decision was made with no record of how a plugin in a Web Worker, with
  no DOM, contributes UI — which is what most plugins do — nor of how a sync
  transport runs in the background on mobile. The questions that need an answer
  before the API is designed are in
  [0047](0047-plugin-api-open-questions.md), `[OPEN]`. This ADR
  remains Accepted; if any answer contradicts it, a new ADR supersedes it.

## Discarded alternatives

- Plugin with direct disk access — discarded in §6 and §10.1 (rule 6).
- Binary compatibility with Obsidian plugins — discarded in §1 and §6
  ([0002](0002-negative-scope.md)).

## Status

Accepted.
