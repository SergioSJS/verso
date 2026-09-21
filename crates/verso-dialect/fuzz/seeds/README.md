# Fuzz seeds

Inputs the fuzzer starts from, on top of whatever `corpus/` holds locally
(`corpus/` is not versioned). One file per case that once broke something:

- `deep-yaml.md` — 4 000 nested block sequences in the frontmatter; overflowed
  `saphyr`'s loader before the depth bound (review of PR #7, finding 1).
- `list-refdef-tabs.md` — list item with a link reference definition and a
  line of tabs; panics inside `pulldown-cmark` 0.13.4 (upstream #1129,
  fixed on their `main`, unreleased on 2026-09-21).

Run: `cargo +nightly fuzz run parse fuzz/corpus/parse fuzz/seeds`.
