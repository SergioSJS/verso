//! What the workspace's tests build their folders with.

use super::*;

/// A file the test made, closed but kept until dropped. Closed: an open
/// handle stops Windows from renaming or moving the folder it is in
/// (ADR 0069), and no test reads through it.
pub struct Kept(tempfile::TempPath);

impl Kept {
    pub fn path(&self) -> &Path {
        &self.0
    }
}

/// A note with exactly this name (no random part), kept until dropped.
pub fn note(dir: &Path, name: &str, content: &str) -> Kept {
    bytes(dir, name, content.as_bytes())
}

/// A file with exactly this name and these bytes, kept until dropped.
pub fn bytes(dir: &Path, name: &str, content: &[u8]) -> Kept {
    let mut file = Builder::new()
        .prefix(name)
        .rand_bytes(0)
        .tempfile_in(dir)
        .unwrap();
    file.write_all(content).unwrap();
    file.flush().unwrap();
    Kept(file.into_temp_path())
}

pub fn subdir(dir: &Path, name: &str) -> TempDir {
    Builder::new()
        .prefix(name)
        .rand_bytes(0)
        .tempdir_in(dir)
        .unwrap()
}

/// The bytes of a file of the folder, read through `verso-fs`, as the
/// guardrail asks of this crate's tests.
pub fn on_disk(vault: &Path, relative: &str) -> Vec<u8> {
    let mut root = verso_fs::Root::open(vault, vec![]).unwrap();
    let h = root.handle(Path::new(relative)).unwrap();
    root.read(h).unwrap().0
}

/// Whether a file of the folder exists, through `verso-fs`.
pub fn exists(vault: &Path, relative: &str) -> bool {
    let mut root = verso_fs::Root::open(vault, vec![]).unwrap();
    let h = root.handle(Path::new(relative)).unwrap();
    !matches!(root.read(h), Err(verso_fs::ReadError::Io(_)))
}

/// A folder note's `order:` as the index reads it once the change is
/// on disk: what the tree sorts by, and proof the YAML still parses.
pub fn order_of(ws: &mut Workspace, folder_note: &str) -> Vec<String> {
    ws.index().unwrap();
    ws.labels()
        .unwrap()
        .get(folder_note)
        .and_then(|l| l.order.clone())
        .unwrap_or_default()
}

/// The folder `pasta` with `A.md`, `B.md` and its folder note
/// `pasta/pasta.md` holding `text`; kept until dropped.
pub fn folder_with_order(vault: &Path, text: &str) -> (TempDir, Vec<Kept>) {
    let pasta = subdir(vault, "pasta");
    let files = vec![
        note(pasta.path(), "A.md", "# A\n"),
        note(pasta.path(), "B.md", "# B\n"),
        note(pasta.path(), "pasta.md", text),
    ];
    (pasta, files)
}

/// `path` and `after` of each rewrite of a plan.
pub fn plan_of(r: &verso_core::Renamed) -> Vec<(&str, &str)> {
    r.rewrites
        .iter()
        .map(|w| (w.path.as_str(), w.after.as_str()))
        .collect()
}

/// Apply a plan the way the UI does: one write per note, with the
/// revision the plan carries.
pub fn apply(ws: &mut Workspace, r: &verso_core::Renamed) {
    for w in &r.rewrites {
        ws.write_note(&w.path, &w.after, &w.revision).unwrap();
    }
}

pub fn resolved(ws: &mut Workspace, note: &str) -> Vec<Option<String>> {
    ws.links(note)
        .unwrap()
        .unwrap()
        .into_iter()
        .map(|l| l.resolved)
        .collect()
}
