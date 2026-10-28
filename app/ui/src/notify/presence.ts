// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's one record of who has been seen in its live files
// (presenceNews.ts). Apart from sources.ts so that a leaf binding its room
// reaches it without loading the whole notification set.

import { currentFolder } from "../folder";
import { PresenceNews } from "./presenceNews";

export const news = new PresenceNews();

/** A tab bound its file's room: the people in it are not joining. */
export function presenceOpened(path: string, names: readonly string[]): void {
  const at = Date.now();
  news.opened(currentFolder, path, at);
  news.present(currentFolder, path, names, at);
}
