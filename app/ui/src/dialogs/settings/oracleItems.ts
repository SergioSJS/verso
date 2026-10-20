// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle page of the settings (ADR 0102): odds, word banks, own tables.

import { oddsControl } from "./oddsControl";
import { sparksControl } from "./sparksControl";
import { ss } from "./strings";
import { tablesControl } from "./tablesControl";
import type { ItemCtx, SettingItem } from "./types";

export function oracleItems(ctx: ItemCtx): SettingItem[] {
  return [
    { section: "oracles", title: ss.oddsTitle, desc: ss.oddsDesc, node: () => ctx.item(ss.oddsTitle, ss.oddsDesc, oddsControl(ctx)) },
    { section: "oracles", title: ss.sparksTitle, desc: ss.sparksDesc, node: () => ctx.item(ss.sparksTitle, ss.sparksDesc, sparksControl(ctx)) },
    { section: "oracles", title: ss.tablesTitle, desc: ss.tablesDesc, node: () => ctx.item(ss.tablesTitle, ss.tablesDesc, tablesControl(ctx)) },
  ];
}
