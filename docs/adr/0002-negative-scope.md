# ADR 0002 — Negative scope: not a clone, not a host for other people's plugins, no embedded LLM

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §1
- Status in the briefing: `DECIDED`

## Context

A project inspired by Obsidian runs two risks: becoming a clone that is always
behind, or promising a compatibility it cannot sustain. On top of that, the
"note-taking app with AI" category tends to embed an LLM provider, which ties
the project to one vendor.

## Decision

1. Verso is not a clone of Obsidian. It is inspired by it and compatible with
   its vaults.
2. Verso does not promise to run every Obsidian plugin.
3. Verso does not embed an LLM model and does not depend on a specific provider.

## Consequences

- Compatibility is with the file format, not with the app: the commitment lives
  in the dialect ([0030](0030-base-dialect-obsidian-compatible.md)) and in the
  fixtures ([0031](0031-fixtures-as-contract.md)), not in the interface.
- Any compatibility with third-party plugins stays outside the core, in a
  separate package and with a declared compatibility table
  ([0017](0017-plugins-format-shim-loading.md)).
- The model endpoint is brought by the user
  ([0018](0018-llm-native-mcp-in-core.md)).
- Diverging from Obsidian in the UI is allowed; diverging in the file is not.

## Discarded alternatives

- Binary compatibility with Obsidian plugins — discarded in §1 and §6.
- Embedding an LLM model or depending on a specific provider — discarded in §1.

## Status

Accepted.
