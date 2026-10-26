// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The oracle's settings page (ADR 0102 item 6), for someone who never read
// the ADR: what the oracle does and a way to try it, then its odds, its
// spark words and its tables — each saved as any other setting is. No file
// path on screen: only that it is shared with whoever opens the folder,
// or, where it cannot be changed, why, in plain words.

import { button, h } from "../../dom";
import { icon } from "../../icons";
import { showOracleDialog } from "../../oracle/dialog";
import { oracleNotWritable } from "../../oracle/folderData";
import { oddsControl } from "./oddsControl";
import { ow } from "./oracleStrings";
import { sparksControl } from "./sparksControl";
import { tablesControl } from "./tablesControl";
import type { ItemCtx, SettingItem } from "./types";

function intro(): HTMLElement {
  const box = h("section", "orc-intro");
  box.setAttribute("aria-label", ow.introTitle);
  const text = h("div", "orc-intro-text");
  text.append(h("p", "orc-intro-lead", ow.intro));
  const why = oracleNotWritable();
  const where = h("p", why ? "orc-where is-locked" : "orc-where");
  where.append(icon(why ? "lock" : "user"), h("span", "", why ? ow.notWritable[why] : ow.shared));
  if (!why) where.title = ow.sharedTip;
  text.append(where);
  const tryIt = button("save", ow.tryIt);
  tryIt.classList.add("orc-try-oracle");
  tryIt.prepend(icon("sparkles"));
  tryIt.addEventListener("click", () => showOracleDialog());
  box.append(text, tryIt);
  return box;
}

export function oracleItems(ctx: ItemCtx): SettingItem[] {
  return [
    { section: "oracles", title: ow.introTitle, desc: `${ow.intro} ${ow.shared}`, node: intro },
    { section: "oracles", title: ow.oddsTitle, desc: ow.oddsLead, node: oddsControl },
    { section: "oracles", title: ow.sparksTitle, desc: ow.sparksLead, node: sparksControl },
    { section: "oracles", title: ow.tablesTitle, desc: ow.tablesLead, node: () => tablesControl(() => ctx.paint()) },
  ];
}
