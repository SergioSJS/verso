// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layouts that ship with the window (ADR 0099 items 2 and 6): data
// files, read through the same validator as a folder's, never changed in
// place ("duplicate" copies one into the folder). This is the minimal set;
// the per-system layouts, each field with its source, come with
// docs/reference/statblock-sources.md.
//
// `d20-creature.json` follows the block structure of the Fantasy Statblocks
// plugin's "Basic 5e Layout" (src/layouts/basic 5e/basic5e.ts, at
// f248f4af), so a block written for the plugin draws the same keys; its
// JavaScript fields (the action buttons, the hit dice callback, the
// challenge's XP) are left out. That plugin is under the MIT licence:
//
//   MIT License
//
//   Copyright (c) 2023 Jeremy Valentine
//
//   Permission is hereby granted, free of charge, to any person obtaining a
//   copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to
//   the following conditions:
//
//   The above copyright notice and this permission notice shall be included
//   in all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
//   OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
//   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
//   CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
//   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
//   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import type { Layout } from "../model";
import { validateLayout } from "../validate";
import d20Creature from "./d20-creature.json";
import factsTrackers from "./facts-trackers.json";

/** The built-in layouts' files, in the order the list shows them. */
const FILES: readonly unknown[] = [d20Creature, factsTrackers];

/** The layout a block that names none is drawn with: the one a block
 *  written for the plugin expects. */
export const DEFAULT_LAYOUT_ID = "d20-creature";

/** Names the plugin's own layouts have, for the built-in that draws the
 *  same keys: a block written for it with `layout: Basic 5e Layout`. */
export const ALIASES: Readonly<Record<string, string>> = {
  "basic 5e layout": "d20-creature",
  "basic-5e-layout": "d20-creature",
};

let cache: Layout[] | null = null;

/** The built-ins, validated once. A built-in with a problem is a bug of
 *  this build, caught by the tests. */
export function builtinLayouts(): Layout[] {
  if (!cache) cache = FILES.map((f) => validateLayout(f).layout).filter((l): l is Layout => l !== null);
  return cache;
}

/** The problems each built-in's file has (for the tests). */
export function builtinProblems(): { id: string; problems: string[] }[] {
  return FILES.map((f) => {
    const v = validateLayout(f);
    return { id: v.layout?.id ?? "?", problems: v.problems.map((p) => `${p.path}: ${p.message}`) };
  });
}
