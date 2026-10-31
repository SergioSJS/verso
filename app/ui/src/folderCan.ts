// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Can } from "./bindings";

/** What a side that shows a whole folder can do, and one that shows a file
 *  opened without its folder cannot (ADR 0114 items 18 and 25): absent
 *  there, so the window draws no tree, search, graph, bin, sync or table.
 *  Its own module, with no imports that run, so the harness core (also run
 *  by the node tests) can read it. */
export const FOLDER_CAN: Can[] = ["index", "search", "backlinks", "create", "rename", "delete", "trash", "history", "sync", "table", "board"];
