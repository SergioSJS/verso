// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type PickerStrings } from "../labels";
import { t } from "../strings";

/** A cover's `banner_y` as a fraction of the image's height. make.md
 *  writes it as a percentage from 0 to 100, and reads it so (its cover's
 *  reposition, 1.3.5; read in its source, 2026-10-02) — so does Verso. */
export function bannerFraction(value: string | null): number {
  const n = value === null ? NaN : parseFloat(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) / 100 : 0.5;
}
/** A fraction of the image's height as make.md writes `banner_y`: a
 *  percentage, as text. */
export function bannerPercent(fraction: number): string {
  return String(Math.round(Math.max(0, Math.min(1, fraction)) * 100));
}
/** The sticker picker's words, in the interface's language. */
export function pickerStrings(): PickerStrings {
  return { emojis: t.stickerTabEmoji, icons: t.stickerTabIcons, colors: t.hue, search: t.stickerSearch, removeSticker: t.removeSticker, removeColor: t.removeColor, label: t.stickerPickerLabel, grid: t.stickerGridLabel };
}
