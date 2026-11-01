// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Features and the Dice and RPG pages of the settings (ADR 0103, revised 2026-10-20): one
// switch per optional feature with the line saying what it adds and where
// it shows, and two shortcuts named by what they do. A shortcut says what
// it will turn on and off before it does anything.

import { applyShortcut, currentFeatures, currentShortcut, setFeature, setFeatures, shortcutChanges, shortcutKeepsOff } from "../../capabilities";
import { can } from "../../can";
import { ask } from "../../dialog";
import { button, h } from "../../dom";
import { FEATURE_GROUPS, FEATURE_IDS, FEATURE_NEEDS, type FeatureId, type ShortcutId } from "../../featureList";
import { fs } from "../../featureStrings";
import { diceLookItems } from "./diceLookItems";
import type { ItemCtx, SettingItem } from "./types";

const SHORTCUTS: ShortcutId[] = ["everything", "writing"];

/** Whether this side has the feature at all (ADR 0027): the terminal's
 *  switch is the desktop app's alone (ADR 0115 item 6). */
function here(id: FeatureId): boolean {
  const need = FEATURE_NEEDS[id];
  return !need || can(need);
}
/** The names of what a shortcut changes, without those this side has not. */
function shownNames(names: string[]): string[] {
  const absent = new Set(FEATURE_IDS.filter((id) => !here(id)).map((id) => fs.names[id]));
  return names.filter((n) => !absent.has(n));
}

/** The features that have a settings page of their own under "RPG & Mesa Solo". */
const OWN_PAGE: Partial<Record<FeatureId, string>> = { oracles: "oracles", statblocks: "statblocks" };

/** The two pages: "Features" under Application (the shortcuts and the
 *  general switches) and "Dice and RPG" first under "RPG & Solo Play" (the
 *  RPG switches and the 3D dice's appearance). One item each for the search,
 *  whose words are that page's features'. */
export function featureItems(ctx: ItemCtx): SettingItem[] {
  const words = (ids: readonly FeatureId[]) => ids.filter(here).map((id) => `${fs.names[id]} ${fs.descs[id]}`).join(" ");
  return [
    { section: "features", title: fs.section, desc: `${fs.shortcuts} ${words(FEATURE_GROUPS.app)} ${fs.rpgLink}`, node: () => featuresNode(ctx) },
    { section: "rpgfeatures", title: fs.rpgSection, desc: words(FEATURE_GROUPS.rpg), node: () => rpgNode(ctx) },
    ...diceLookItems(ctx),
  ];
}

/** Keeps the switches of a page showing what is stored. */
function switches(ctx: ItemCtx, ids: readonly FeatureId[], boxes: Map<FeatureId, HTMLInputElement>, sync: () => void, into: HTMLElement): void {
  const f = currentFeatures();
  for (const id of ids.filter(here)) {
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
    into.append(ctx.item(fs.names[id], fs.descs[id], control));
  }
}

/** Application › Features: the shortcuts, the general switches, and the way
 *  to the RPG page. */
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
        const changes = shortcutChanges(id);
        const on = shownNames(changes.on);
        const off = shownNames(changes.off);
        // Nothing to change: nothing to ask.
        if (on.length + off.length === 0) return;
        if (!(await ask(fs.askShortcut(fs.shortcutNames[id], on, off, shownNames(shortcutKeepsOff(id))), { yes: fs.apply, no: fs.cancel }))) return;
        applyShortcut(id);
        sync();
      })();
    });
    buttons.set(id, b);
    bar.append(b);
  }
  bar.append(current);
  group.append(ctx.item(fs.shortcuts, fs.shortcutsDesc, bar));

  switches(ctx, FEATURE_GROUPS.app, boxes, sync, group);

  if (ctx.open) {
    const open = ctx.open;
    const line = h("p", "settings-hint features-rpg-line");
    const link = button("ghost", fs.rpgLink);
    link.removeAttribute("title");
    link.classList.add("features-own-link");
    link.addEventListener("click", () => open("rpgfeatures"));
    line.append(link);
    group.append(line);
  }
  sync();
  return group;
}

/** RPG & Solo Play › Dice and RPG: the RPG switches, with "turn all on/off". */
function rpgNode(ctx: ItemCtx): HTMLElement {
  const group = h("fieldset", "features-group");
  group.dataset.group = "rpg";
  group.append(h("legend", "features-legend sr-only", fs.rpgSection));
  const ids = FEATURE_GROUPS.rpg;
  const name = fs.groups.rpg;
  const boxes = new Map<FeatureId, HTMLInputElement>();
  const sync = () => {
    const f = currentFeatures();
    for (const [id, box] of boxes) box.checked = f[id];
  };
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
  group.append(bulk);
  switches(ctx, ids, boxes, sync, group);
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
