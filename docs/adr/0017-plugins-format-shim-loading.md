# ADR 0017 — Plugins: familiar format, separate shim, lazy loading and dogfooding

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §6, §16.1
- Status in the briefing: `PROPOSED`

## Context

A set of proposals that surround the execution decision
([0016](0016-plugins-execution-and-capabilities.md)) and answer recorded pain
points: slow startup with many plugins, and migration for whoever already
writes Obsidian plugins.

## Decision (proposed, not confirmed)

1. A format familiar to whoever writes Obsidian plugins (`manifest.json`,
   `main.js`, a base class with `onload`/`onunload`, command and settings
   registration), with no binary compatibility.
2. Compatibility shim for Obsidian plugins: a separate package, outside the
   core, covering only the public API, with a declared compatibility table.
3. Lazy loading by default and per-plugin load time visible.
4. Platform flag in the manifest, equivalent to `isDesktopOnly`.
5. The project's own features (sync, Foundry, RPG packs) are written as
   plugins; if they need privileged access, the API is wrong.
6. Native plugin in WASM inside the core: a future possibility, not planned.

## Consequences

- The shim can only rely on the public API (`obsidian.d.ts`, MIT) and on
  behavior observed from outside
  ([0009](0009-external-constraints.md)).
- The declared compatibility table is what avoids the promise the project
  refused to make ([0002](0002-negative-scope.md)).
- Writing our own features as plugins is the most honest test of the API, and
  also the most expensive: first-party features are limited to what the API
  exposes.
- Per-plugin load time visible needs instrumentation in the loader from the
  start; measuring later is more expensive.
- None of this lands before the end of Phase 2
  ([0034](0034-roadmap-in-phases.md)).

## Discarded alternatives

- Shim inside the core — discarded in §6: it lives in a separate package.
- An API deliberately different from Obsidian's, with no familiarity —
  discarded in §6.

## Status

Proposed.

*2026-10-21* — the decisions questionnaire of 2026-10-20 (answered 2026-10-21): `[DECIDED 2026-10-21]` (option A) the six items wait for after V1, the moment already decided (plugins are outside V1). Status stays Proposed.
