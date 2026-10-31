// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The 3D dice's appearance on the Dice and RPG page (ADR 0101, appearance),
// with Rolai's model: a size in percent; three colour sets (tabs and a
// preview of each); and for the chosen set a style (the presets), the
// colours of the body, the number and its outline, a texture and a
// material; then a "roll to test" button. A device setting, saved at once;
// what changes on screen is also said (the contrast warning, the test's
// result) in a polite live region.

import { h } from "../../dom";
import { type DiceLook, type DiceStyle, applyPreset, clampSize, edgeFor, lowContrast, MATERIALS, numberContrast, presetOf, PRESETS, readDiceLook, SIZE_MAX, SIZE_MIN, SIZE_STEP, SLOTS, type SlotId, TEXTURES, withField } from "../../dice3d/look";
import { ls } from "../../dice3d/lookStrings";
import { ROLL_TIMES } from "../../dice3d/timeline";
import { preview3d } from "../../dice3d";
import { parseColor, toHex } from "../../theme/color";
import { saveSettings, settings } from "../../settings";
import type { ItemCtx, SettingItem } from "./types";

const pairs = <T extends string>(ids: readonly T[], names: Record<T, string>): [T, string][] => ids.map((id) => [id, names[id]]);
const title = (name: string): string => `${ls.prefix}: ${name.toLowerCase()}`;

/** The swatch of one style: its body, texture and a number, drawn with the
 *  same painters as the dice (the module only needs the 2D canvas). */
async function drawSwatch(canvas: HTMLCanvasElement, style: DiceStyle, number: string): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { paintTexture, loadTextureImages } = await import("../../dice3d/textures");
  const image = (await loadTextureImages([style.texture])).get(style.texture);
  const size = canvas.width;
  let body = style.body;
  let ink = style.number;
  let outline = style.outline;
  if (style.app) {
    const probe = (name: string, fb: string): string => {
      const el = h("span");
      el.style.cssText = `position:absolute;visibility:hidden;color:var(${name}, ${fb})`;
      document.body.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c || fb;
    };
    body = probe("--seal", "#8c2f2a");
    ink = probe("--seal-ink", "#fff");
    outline = edgeFor(body);
  }
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);
  paintTexture(ctx, size, size, style.texture, 7, image);
  ctx.font = `700 ${Math.round(size * 0.46)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.strokeStyle = outline;
  ctx.strokeText(number, size / 2, size / 2 + size * 0.02);
  ctx.fillStyle = ink;
  ctx.fillText(number, size / 2, size / 2 + size * 0.02);
}

/** The items of the section, one per control, all drawn by one `sync`. */
export function diceLookItems(ctx: ItemCtx): SettingItem[] {
  const look = (): DiceLook => readDiceLook(settings.dice3dLook);
  let active: SlotId = "1";
  const mine = (): DiceStyle => look().styles[active];
  const save = (next: DiceLook): void => {
    settings.dice3dLook = next;
    saveSettings();
    // The table tells the others the new dice (ADR 0107 item 11).
    dispatchEvent(new Event("verso:dice-look"));
    sync();
  };
  const setStyle = (style: DiceStyle): void => {
    const l = look();
    save({ ...l, styles: { ...l.styles, [active]: style } });
  };
  const syncs: (() => void)[] = [];
  const sync = (): void => syncs.forEach((f) => f());
  const say = h("p", "dice3d-say");
  say.setAttribute("role", "status");
  say.setAttribute("aria-live", "polite");

  const item = (name: string, desc: string, make: () => HTMLElement): SettingItem => ({ section: "rpgfeatures", title: name, desc, node: () => {
      const control = make();
      sync();
      return ctx.item(name, desc, control);
    },
  });

  const select = <T extends string>(options: [T, string][], read: () => T, write: (v: T) => void): HTMLSelectElement => {
    const el = ctx.select(options, read(), write);
    syncs.push(() => {
      el.value = read();
    });
    return el;
  };

  const colour = (name: string, key: "body" | "number" | "outline"): HTMLElement => {
    const row = h("div", "dice3d-colour");
    const picker = h("input", "look-picker");
    picker.type = "color";
    const label = `${ls.prefix}: ${name.toLowerCase()}`;
    picker.setAttribute("aria-label", ls.pick(label));
    const text = h("input", "look-hex");
    text.type = "text";
    text.spellcheck = false;
    text.autocomplete = "off";
    text.setAttribute("aria-label", ls.hex(label));
    const commit = (raw: string): void => {
      const c = parseColor(raw);
      if (!c) {
        text.setAttribute("aria-invalid", "true");
        say.textContent = ls.invalid;
        return;
      }
      text.removeAttribute("aria-invalid");
      setStyle(withField(mine(), { [key]: toHex(c) }));
    };
    picker.addEventListener("input", () => commit(picker.value));
    text.addEventListener("change", () => commit(text.value));
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit(text.value);
    });
    row.append(picker, text);
    syncs.push(() => {
      picker.value = mine()[key];
      text.value = mine()[key];
      text.removeAttribute("aria-invalid");
    });
    return row;
  };

  const contrastLine = h("p", "dice3d-contrast");
  syncs.push(() => {
    const style = mine();
    const r = numberContrast(style);
    contrastLine.hidden = style.app === true || r === null;
    if (r === null) return;
    const low = lowContrast(style);
    contrastLine.dataset["low"] = String(low);
    contrastLine.textContent = low ? ls.contrastLow(r.toFixed(1)) : ls.contrastOk(r.toFixed(1));
    if (low) contrastLine.setAttribute("role", "alert");
    else contrastLine.removeAttribute("role");
  });

  const sizeBox = (): HTMLElement => {
    const box = h("div", "dice3d-size");
    const range = h("input");
    range.type = "range";
    range.min = String(SIZE_MIN);
    range.max = String(SIZE_MAX);
    range.step = String(SIZE_STEP);
    range.setAttribute("aria-label", ls.size);
    const out = h("output", "dice3d-size-out");
    range.addEventListener("input", () => save({ ...look(), size: clampSize(Number(range.value)) }));
    box.append(range, out);
    syncs.push(() => {
      const v = look().size;
      range.value = String(v);
      range.setAttribute("aria-valuetext", ls.sizeValue(v));
      out.textContent = ls.sizeValue(v);
    });
    return box;
  };

  const slotsBox = (): HTMLElement => {
    const box = h("div", "dice3d-slots");
    const tabs = h("div", "dice3d-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", ls.slots);
    const tiles = h("div", "dice3d-tiles");
    tiles.setAttribute("role", "group");
    tiles.setAttribute("aria-label", ls.preview);
    const choose = (slot: SlotId): void => {
      active = slot;
      sync();
    };
    const buttons = new Map<SlotId, HTMLButtonElement>();
    const swatches = new Map<SlotId, HTMLCanvasElement>();
    SLOTS.forEach((slot, n) => {
      const b = h("button", "dice3d-tab", ls.slotNames[slot]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset["slot"] = slot;
      b.addEventListener("click", () => choose(slot));
      b.addEventListener("keydown", (e) => {
        const to = e.key === "ArrowRight" ? n + 1 : e.key === "ArrowLeft" ? n - 1 : -1;
        if (to < 0) return;
        e.preventDefault();
        const next = SLOTS[(to + SLOTS.length) % SLOTS.length] as SlotId;
        choose(next);
        buttons.get(next)?.focus();
      });
      buttons.set(slot, b);
      tabs.append(b);
      const tile = h("button", "dice3d-tile");
      tile.type = "button";
      tile.dataset["slot"] = slot;
      tile.setAttribute("aria-label", ls.slotNames[slot]);
      const canvas = h("canvas");
      canvas.width = 72;
      canvas.height = 72;
      canvas.setAttribute("aria-hidden", "true");
      swatches.set(slot, canvas);
      tile.append(canvas, h("span", "dice3d-tile-name", ls.slotShort(slot)));
      tile.addEventListener("click", () => choose(slot));
      tiles.append(tile);
    });
    box.append(tabs, tiles);
    syncs.push(() => {
      const l = look();
      SLOTS.forEach((slot, n) => {
        const b = buttons.get(slot) as HTMLButtonElement;
        b.setAttribute("aria-selected", String(slot === active));
        b.tabIndex = slot === active ? 0 : -1;
        tiles.children[n]?.classList.toggle("selected", slot === active);
        tiles.children[n]?.setAttribute("aria-pressed", String(slot === active));
        void drawSwatch(swatches.get(slot) as HTMLCanvasElement, l.styles[slot], slot === "1" ? "20" : "6");
      });
    });
    return box;
  };

  const testBox = (): HTMLElement => {
    const box = h("div", "dice3d-preview");
    const b = h("button", "save", ls.roll);
    b.type = "button";
    b.addEventListener("click", () => {
      void (async () => {
        b.disabled = true;
        say.textContent = "";
        const out = await preview3d();
        b.disabled = false;
        say.textContent = out.played ? ls.rolled(...out.values) : out.why === "motion" ? ls.offMotion : out.why === "gl" ? ls.offGl : ls.offSwitch;
      })();
    });
    box.append(b, say);
    return box;
  };

  const styleOptions = (): [string, string][] => [["custom", ls.custom], ...PRESETS.map((p): [string, string] => [p.id, ls.presets[p.id] as string])];
  const styleId = (): string => presetOf(mine())?.id ?? "custom";

  return [
    item(ls.size, ls.sizeDesc, sizeBox),
    item(ls.time, ls.timeDesc, () => select(pairs(ROLL_TIMES, ls.times), () => look().time, (v) => save({ ...look(), time: v }))),
    item(ls.sound, ls.soundDesc, () => {
      const sw = ctx.toggle(look().sound, (v) => save({ ...look(), sound: v, soundChosen: true }));
      const box = sw.querySelector("input");
      if (box) {
        box.setAttribute("aria-label", ls.sound);
        syncs.push(() => {
          box.checked = look().sound;
        });
      }
      return sw;
    }),
    item(ls.others, ls.othersDesc, () => {
      const sw = ctx.toggle(settings.others3d !== false, (v) => {
        settings.others3d = v;
        saveSettings();
      });
      sw.querySelector("input")?.setAttribute("aria-label", ls.others);
      return sw;
    }),
    item(ls.slots, ls.slotsDesc, slotsBox),
    item(ls.style, ls.styleDesc, () =>
      select(styleOptions(), styleId, (v) => {
        const next = applyPreset(v);
        if (next) setStyle(next);
      }),
    ),
    item(title(ls.body), ls.colorsDesc, () => colour(ls.body, "body")),
    item(title(ls.number), "", () => {
      const box = h("div", "dice3d-ink");
      box.append(colour(ls.number, "number"), contrastLine);
      return box;
    }),
    item(title(ls.outline), "", () => colour(ls.outline, "outline")),
    item(title(ls.texture), ls.textureDesc, () => select(pairs(TEXTURES, ls.textures), () => mine().texture, (v) => setStyle(withField(mine(), { texture: v })))),
    item(title(ls.material), "", () => select(pairs(MATERIALS, ls.materials), () => mine().material, (v) => setStyle(withField(mine(), { material: v })))),
    item(ls.test, ls.testDesc, testBox),
  ];
}
