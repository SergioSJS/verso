// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Features page of the settings (ADR 0103, revised 2026-10-20): one
// switch per optional feature with the line saying what it adds and where
// it shows, and two shortcuts named by what they do. A shortcut says what
// it will turn on and off before it does anything.

import { applyShortcut, currentFeatures, currentShortcut, setFeature, setFeatures, shortcutChanges, shortcutKeepsOff } from "../../capabilities";
import { ask } from "../../dialog";
import { button, h } from "../../dom";
import { FEATURE_GROUPS, FEATURE_IDS, type FeatureGroupId, type FeatureId, type ShortcutId } from "../../featureList";
import { fs } from "../../featureStrings";
import type { ItemCtx, SettingItem } from "./types";

const SHORTCUTS: ShortcutId[] = ["everything", "writing"];

/** The features that have a settings page of their own under "RPG & Mesa Solo". */
const OWN_PAGE: Partial<Record<FeatureId, string>> = { oracles: "oracles", statblocks: "statblocks" };

/** The page: the shortcuts, then the switches in a labelled group. One item
 *  for the search, whose words are every feature's. */
export function featureItems(ctx: ItemCtx): SettingItem[] {
  const words = FEATURE_IDS.map((id) => `${fs.names[id]} ${fs.descs[id]}`).join(" ");
  return [{ section: "features", title: fs.section, desc: words, node: () => featuresNode(ctx) }];
}

function featuresNode(ctx: ItemCtx): HTMLElement {
  const group = h("fieldset", "features-group");
  group.append(h("legend", "features-legend sr-only", fs.section));

  const boxes = new Map<FeatureId, HTMLInputElement>();
  const current = h("span", "");
  const buttons = new Map<ShortcutId, HTMLButtonElement>();
  const sync = () => {
    const f = currentFeatures();
    for (const [id, box] of boxes) box.checked = f[id];
    const now = currentShortcut();
    current.textContent = fs.current(fs.shortcutNames[now]);
    for (const [id, b] of buttons) b.setAttribute("aria-pressed", String(now === id));
  };

  const bar = h("div", "features-shortcuts");
  for (const id of SHORTCUTS) {
    const b = button("ghost", fs.shortcutNames[id]);
    b.removeAttribute("title");
    b.addEventListener("click", () => {
      void (async () => {
        const { on, off } = shortcutChanges(id);
        // Nothing to change: nothing to ask.
        if (on.length + off.length === 0) return;
        if (!(await ask(fs.askShortcut(fs.shortcutNames[id], on, off, shortcutKeepsOff(id)), { yes: fs.apply, no: fs.cancel }))) return;
        applyShortcut(id);
        sync();
      })();
    });
    buttons.set(id, b);
    bar.append(b);
  }
  bar.append(current);
  group.append(ctx.item(fs.shortcuts, fs.shortcutsDesc, bar));

  const f = currentFeatures();
  for (const gid of ["app", "rpg"] as FeatureGroupId[]) {
    const ids = FEATURE_GROUPS[gid];
    const name = fs.groups[gid];
    const sub = h("fieldset", "features-subgroup");
    sub.dataset.group = gid;
    sub.append(h("legend", "features-legend features-sub-legend", name));
    // A group of one needs no "all" links.
    if (ids.length > 1) {
      const bulk = h("div", "features-bulk");
      bulk.setAttribute("role", "group");
      bulk.setAttribute("aria-label", fs.groupBulk(name));
      for (const on of [true, false]) {
        const b = button("ghost", on ? fs.allOn : fs.allOff);
        b.removeAttribute("title");
        b.classList.add("features-bulk-link");
        b.addEventListener("click", () => {
          setFeatures(ids, on, fs.statusGroup(name, on));
          sync();
        });
        bulk.append(b);
      }
      sub.append(bulk);
    }
    for (const id of ids) {
      const sw = ctx.toggle(f[id], (v) => {
        setFeature(id, v);
        sync();
      });
      const box = sw.querySelector("input");
      if (box) boxes.set(id, box);
      let control: HTMLElement = sw;
      const page = OWN_PAGE[id];
      if (page && ctx.open) {
        const open = ctx.open;
        const wrap = h("span", "features-ctl");
        const link = button("ghost", fs.settingsLink);
        link.removeAttribute("title");
        link.classList.add("features-own-link");
        link.setAttribute("aria-label", fs.settingsLinkFor(fs.names[id]));
        link.addEventListener("click", () => open(page));
        wrap.append(link, sw);
        control = wrap;
      }
      sub.append(ctx.item(fs.names[id], fs.descs[id], control));
    }
    group.append(sub);
  }
  sync();
  return group;
}

/** On a feature's own page: a line saying it is off, with the way back. */
export function offNotice(ctx: ItemCtx, section: string, id: FeatureId): SettingItem[] {
  if (currentFeatures()[id]) return [];
  const title = `${fs.names[id]}: ${fs.off}`;
  return [
    {
      section,
      title,
      desc: fs.offHere(fs.names[id]),
      node: () => {
        const on = button("save", fs.turnOn);
        on.removeAttribute("title");
        on.addEventListener("click", () => {
          setFeature(id, true);
          ctx.paint();
        });
        return ctx.item(title, fs.offHere(fs.names[id]), on);
      },
    },
  ];
}
