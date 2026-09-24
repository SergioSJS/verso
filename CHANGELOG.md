# Changelog

[Português (Brasil)](docs/pt-BR/CHANGELOG.md)

What changes from one version of Verso to the next, for someone who uses it.
Every change a user can see adds its lines under **Unreleased**, in both
languages;
cutting a version moves them under the version's own heading
([ADR 0051](docs/adr/0051-development-flow-and-releases.md)). Versions follow
[SemVer](https://semver.org): `X.Y.Z` for production, `X.Y.Z-beta.N` for a
test release.

## Unreleased

### Added

- **Changes made outside Verso show up by themselves**: a note edited in
  another app, a sync or `git pull` reaches the tree, the search, the
  backlinks and the open tabs a moment later. A tab with nothing typed in it
  is read again, where the cursor was; one with text not saved yet shows
  both versions, as when a save meets a changed file; a note deleted or
  moved outside keeps its text in its tab, crossed out.

### Fixed

- **The beta's command line** says which app it opens: `verso <folder>`
  answers "opening … in Verso Beta", and names Verso Beta when the app is
  not installed.

## 0.2.0-beta.1 — 2026-09-24

### Added

- **The command line**: `verso index`, `verso search`, `verso backlinks` and
  `verso mcp` over a folder of Markdown notes, with an index outside the
  folder; `verso <folder>` opens it in the window; `verso --version`.
- **The window, on macOS**: notes read and edited in place (Live Preview),
  tabs and panes, workspaces, the folder tree and folder views, search,
  links, backlinks, tags, the graph, bookmarks, a command palette and
  configurable shortcuts, pt-BR and English.
- **Files as the source of truth**: every write is atomic and refused, with
  the difference shown, when the file changed on disk since it was read;
  opening never rewrites a file.
- **Renaming and moving** with a plan of the link rewrites, shown as one diff
  per note; deleting to the folder's `.trash/`.
- **Beyond notes**: a PDF reader with quotes kept in a companion note, HTML
  files as pages, web notes, images pasted into an assets folder, templates
  and a daily note, math, footnotes, tables and callouts that fold.
- **Settings** for the theme and palette, the text width, the format of new
  links, remote content (web images and site icons) and the language; the
  version and the commit they show.
