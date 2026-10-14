// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;

#[test]
fn text_files_the_window_edits_have_a_history_and_attachments_none() {
    for p in [
        "a.md",
        "b/Quadro.canvas",
        "x.base",
        "n.TXT",
        "d.json",
        "t.csv",
    ] {
        assert!(kept(p), "{p}");
    }
    for p in [
        "foto.png",
        "doc.pdf",
        ".trash/a.md",
        ".verso/settings.json",
        "pasta/.oculta/n.md",
        ".md",
        "sem-extensao",
    ] {
        assert!(!kept(p), "{p}");
    }
}
