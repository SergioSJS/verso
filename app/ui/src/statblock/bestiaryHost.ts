// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's side of the bestiary of notes (bestiary.ts): the folder's
// note list, its search and link resolution, and a note's text read through
// the contract. Reading only; a scan like the index's, it downloads nothing
// from on-demand storage (ADR 0043).

import { commands } from "../bindings";
import { allNotes, currentFolder } from "../folder";
import { resolveNoteByName } from "../resolve";
import { setBestiaryIO } from "./bestiary";

setBestiaryIO({
  notes: () => allNotes,
  read: async (path) => {
    const r = await commands.readNote(path);
    return r.status === "ok" ? r.data.text : null;
  },
  find: async (words, limit) => {
    const r = await commands.search(words, limit);
    return r.status === "ok" ? r.data.map((h) => h.path) : [];
  },
  resolveLink: (target, from) => resolveNoteByName(target, from),
  key: () => currentFolder,
});
