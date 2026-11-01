// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The terminal's rows of Settings › Terminal and agents (ADR 0115 items 7,
// 10, 14 and 24): a new terminal, the AI tools found by the shell on a
// click, the Windows shell (Q7), Option as Meta on macOS, the screen reader
// mode. Off, the page says so with the way back (the switch is Features').

import { commands } from "../bindings";
import { button, h } from "../dom";
import { fail } from "../errors";
import { offNotice } from "../dialogs/settings/featureItems";
import type { ItemCtx, SettingItem } from "../dialogs/settings/types";
import { hasCapability } from "../capabilities";
import { MAC, WINDOWS } from "../platform";
import { detectTools, openTerminal, prefs, setPrefs } from "./open";
import { tw } from "./strings";

/** The terminal's items, for the "cli" page; `close` closes the settings so
 *  the terminal opened is in view. */
export function terminalItems(ctx: ItemCtx, close: () => void): SettingItem[] {
  if (!hasCapability("terminal")) return offNotice(ctx, "cli", "terminal");
  const items: SettingItem[] = [
    {
      section: "cli",
      title: tw.section,
      desc: tw.sectionDesc,
      node: () => {
        const b = button("update-btn-secondary", tw.newTerminal);
        b.removeAttribute("title");
        b.addEventListener("click", () => {
          close();
          openTerminal("");
        });
        return ctx.item(tw.section, tw.sectionDesc, b);
      },
    },
    {
      section: "cli",
      title: tw.aiTitle,
      desc: tw.aiDesc,
      node: () => {
        const wrap = h("div", "terminal-tools");
        const look = button("update-btn-secondary", tw.find);
        look.removeAttribute("title");
        const list = h("div", "terminal-tools-list");
        list.setAttribute("role", "group");
        list.setAttribute("aria-label", tw.aiTools);
        look.addEventListener("click", () => {
          look.disabled = true;
          void detectTools().then((found) => {
            look.disabled = false;
            if (!found) return;
            list.replaceChildren();
            for (const f of found) {
              const name = tw.cliNames[f.cli];
              const b = button("ghost", f.found ? tw.start(name) : tw.install(name));
              b.removeAttribute("title");
              b.dataset["cli"] = f.cli;
              b.addEventListener("click", () => {
                if (f.found) {
                  close();
                  openTerminal("", f.cli);
                } else void commands.terminalInstallPage(f.cli).then((r) => r.status === "ok" || fail(r.error));
              });
              list.append(b);
            }
          });
        });
        wrap.append(look, list);
        return ctx.item(tw.aiTitle, tw.aiDesc, wrap);
      },
    },
  ];
  if (WINDOWS)
    items.push({
      section: "cli",
      title: tw.shellTitle,
      desc: tw.shellDesc,
      node: () =>
        ctx.item(
          tw.shellTitle,
          tw.shellDesc,
          ctx.select<"powershell" | "cmd">([["powershell", tw.powershell], ["cmd", tw.cmd]], prefs().shell, (v) => setPrefs({ shell: v })),
        ),
    });
  if (MAC)
    items.push({
      section: "cli",
      title: tw.metaTitle,
      desc: tw.metaDesc,
      node: () => ctx.item(tw.metaTitle, tw.metaDesc, ctx.toggle(prefs().meta, (v) => setPrefs({ meta: v }))),
    });
  items.push({
    section: "cli",
    title: tw.readerTitle,
    desc: tw.readerDesc,
    node: () => ctx.item(tw.readerTitle, tw.readerDesc, ctx.toggle(prefs().reader, (v) => setPrefs({ reader: v }))),
  });
  return items;
}
