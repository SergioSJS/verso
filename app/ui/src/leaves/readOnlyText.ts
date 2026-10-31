// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { EditorState, type Extension } from "@codemirror/state";
import { ySyncAnnotation } from "y-codemirror.next";
import { fromDisk } from "./text";

/** Such a file is shown and never edited: no keystroke, no panel, no
 *  task or paste changes it, so nothing converts it (invariant 8). */
export const readOnlyText: Extension = [
  EditorState.readOnly.of(true),
  // Nothing typed, pasted or run gets through. The room's own text coming
  // in (yCollab's remote sync) does: a reader's editor follows the room like
  // the reading view follows the file, not the join-time snapshot. So does
  // the disk's new text outside a room (`fromDisk`): shown, never written.
  EditorState.changeFilter.of((tr) => tr.annotation(ySyncAnnotation) !== undefined || tr.annotation(fromDisk) === true),
];
