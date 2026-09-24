# Contributing to Verso

[Português (Brasil)](docs/pt-BR/CONTRIBUTING.md)

Verso is an open Markdown notes application: plain files on disk, compatible
with Obsidian vaults. Contributions are welcome once the repository is public.
The maintainer is the final authority — the models write, the maintainer
decides. Repository documents are written in English, and each one has a
first-class pt-BR twin under `docs/pt-BR/`
([ADR 0008](docs/adr/0008-documentation-language.md)).

## License

Core and app are under MPL-2.0; the plugin SDK is under MIT
([ADR 0005](docs/adr/0005-license.md)). By contributing you agree that your
contribution is under the same license as the file you touch.

## Sign-off (DCO)

Every commit carries a sign-off line — `git commit -s` adds it:

```
Signed-off-by: Name <email>
```

There is no CLA. The sign-off is the Developer Certificate of Origin: you
certify that you wrote the change or otherwise have the right to submit it
under the project's license ([full text](https://developercertificate.org)).

Code written with AI assistance is welcome and goes through the same sign-off
([ADR 0006](docs/adr/0006-contribution-dco-no-cla.md)). Whoever signs declares:
"I understand what this does, I decided it goes in, and I answer for it as if I
had written it." There is no AI signature and no separate category of commit. A
pull request the signer cannot explain in their own words does not get signed
off.

## Before you write code

1. Read the relevant ADR ([index](docs/adr/README.md)). If none exists, write
   it first, or ask.
2. If the decision you need is `PROPOSED` or `[OPEN]`, open an issue and ask.
   Do not choose for the project.
3. Check that the work fits the current phase in
   [the roadmap](docs/roadmap.md). Out of scope until the end of Phase 2: sync,
   mobile, plugins, board and the compatibility shim — not even "since it is
   cheap".

## Pull requests

- Small, one topic. If the summary needs an "and", it is probably two pull
  requests.
- Use the template in `.github/pull_request_template.md`, with its five
  sections filled in: What / Why / Discarded alternatives / How to verify /
  Rust concept used. The last one is explained for someone learning Rust; it is
  how the maintainer understands what they are approving
  ([ADR 0033](docs/adr/0033-pr-workflow.md)).
- A new dependency needs justification in the pull request, says what it
  replaces in our own code, and must pass `cargo-deny`.
- Parser features come with fixtures. **Never change `fixtures/**/expected.yaml`
  without the maintainer's explicit approval** — if the code disagrees with a
  fixture, the code is wrong until the maintainer says otherwise. If a fixture
  looks wrong, stop, do not edit it, and ask
  ([ADR 0031](docs/adr/0031-fixtures-as-contract.md)).
- Guardrails cannot be silenced: `unsafe_code = "forbid"`, clippy with
  `-D warnings`, no `unwrap`/`expect` outside tests, `cargo-deny`, the
  documentation mirror. A local `#[allow]` in the middle of a diff is not an
  answer; a guardrail that blocks legitimate work is its own pull request, with
  a justification.
- Run `scripts/check.sh` and `scripts/check-linux.sh` before you push
  ([README](README.md#test-locally-before-pushing)): CI confirms what they
  found green; it should not be where a failure is first seen.
- Merge takes all three: CI green, no BLOCKING finding open, and the maintainer
  can explain the pull request in their own words. Findings are classified as
  BLOCKING, IMPORTANT or MINOR.

## Documentation

English is the source. Every document has a pt-BR twin with the same path and
file name under `docs/pt-BR/` — written, not machine-translated. A pull request
that changes one side changes the other, or it does not merge.
`scripts/check-docs-mirror.sh` checks presence, heading structure and links.

## What you must not do

- Never inspect, decompile or de-minify the Obsidian app. The admissible
  sources on its behaviour are the public API (`obsidian.d.ts`, MIT), the
  public documentation and behaviour observed from outside
  ([ADR 0009](docs/adr/0009-external-constraints.md)). No document, fixture or
  pull request may cite the Obsidian binary as a source.
- Never commit API keys, tokens, or notes from a real vault. Test data is
  synthetic.

## Language of commits, PRs and issues

English.
