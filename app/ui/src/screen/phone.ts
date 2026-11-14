// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A phone's window: a narrow one, or a touch screen under 500 px high (a
 *  phone held sideways got the desktop's layout at 936 × 421 px; the
 *  maintainer's answer of 2026-11-10). The same as the CSS's
 *  `@media (max-width: 760px), (pointer: coarse) and (max-height: 500px)`. */
export const PHONE_MEDIA = "(max-width: 760px), (pointer: coarse) and (max-height: 500px)";
