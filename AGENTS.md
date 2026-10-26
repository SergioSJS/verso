# AGENTS.md

Any AI agent working in this repository — Claude, Gemini, Codex or another —
reads [`CLAUDE.md`](CLAUDE.md) first and obeys it: the invariants, the
guardrails, the review levels and the workflow are the same for every agent.

Two things agents have got wrong before:

- **Installing the app to try a change.** On a Mac, only
  `scripts/install-beta.sh`; never a binary copied by hand
  ([ADR 0051](docs/adr/0051-development-flow-and-releases.md)).
- **Saying "done" without seeing it.** Tests passing is not the app working;
  say which steps were not run in the real app.
