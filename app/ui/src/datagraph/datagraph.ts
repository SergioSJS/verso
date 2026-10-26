// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The diagram's heavy half, loaded with one `import()` the first time a
// diagram is shown (like Excalidraw and MapLibre): the view, the layout, the
// parsers, "Save as board". The window's main script holds only what a tab
// or a button needs to exist (the format of a file, the switch, the words).
// The file's name gives the chunk its name, `chunks/datagraph-<hash>.js`.

export { DataDiagram, type DiagramHost, type Range } from "./view";
export { saveAsBoard } from "./saveBoard";
export { boardOf } from "./saveBoardDoc";
export { titleOf } from "./boxes";
