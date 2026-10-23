// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// How the 3D dice look and how big they are (ADR 0101, appearance). The model
// is Rolai's (apps/web/src/settings.ts): three colour slots, each a full
// style (body, number and outline colours, a texture, a material), eight
// presets, and a size in percent. Pure — no DOM, no WebGL — and small, because
// it lives in the main bundle; the stage (a lazy chunk) receives the look and
// draws it. A per-device setting: a room's roll is drawn with each viewer's
// own dice.

import { contrast, mix, parseColor, toHex, BLACK } from "../theme/color";
import { ROLL_TIME_DEFAULT, ROLL_TIMES, type RollTime } from "./timeline";

export const SLOTS = ["1", "2", "3"] as const;
export type SlotId = (typeof SLOTS)[number];

/** `auto` takes the material the texture brings; `none` is "Fosco". */
export const MATERIALS = ["auto", "plastic", "metal", "wood", "glass", "none"] as const;
export type MaterialId = (typeof MATERIALS)[number];

export const TEXTURES = ["none", "marble", "speckles", "glitter", "stars", "astral", "cloudy", "fire", "water", "ice", "paper", "wood", "metal", "stainedglass", "skulls", "dragon", "leopard", "tiger", "lizard", "bird"] as const;
export type TextureId = (typeof TEXTURES)[number];

/** A style: the colours of the body, the number and the number's outline,
 *  a texture and a material. `app` makes the three colours follow the
 *  app's palette instead (the "Do Verso" preset); the texture and the
 *  material still apply. */
export type DiceStyle = { body: string; number: string; outline: string; texture: TextureId; material: MaterialId; app?: boolean };

/** A person's dice: a style for each of the three colour slots. Plain JSON
 *  with closed values only (colours `#rrggbb`, texture and material ids
 *  from the lists above, no URL or path or free text), so it can travel
 *  with a roll and be drawn by someone else (ADR 0107 item 11). */
export type DiceStyles = Record<SlotId, DiceStyle>;

/** What is kept in the settings: the person's dice styles, and the size in
 *  percent, the roll time and the sound switch, which stay with the viewer
 *  and never travel with a roll. */
export type DiceLook = { size: number; styles: DiceStyles; time: RollTime; sound: boolean; soundChosen: boolean };

/** The picture file of each texture in `dice-textures/` (the original
 *  images of MajorVictory's 3DDiceRoller, The Unlicense; see
 *  docs/reference/dice-textures.md); `none` has none. */
export const TEXTURE_FILES: Record<TextureId, string | null> = {
  none: null, marble: "marble.png", speckles: "speckles.png", glitter: "glitter.png", stars: "stars.png", astral: "astral.png", cloudy: "cloudy.png", fire: "fire.png", water: "water.png", ice: "ice.png", paper: "paper.png", wood: "wood.png", metal: "metal.png", stainedglass: "stainedglass.png", skulls: "skulls.png", dragon: "dragon.png", leopard: "leopard.png", tiger: "tiger.png", lizard: "lizard.png", bird: "feather.png",
};

export const SIZE_MIN = 70;
export const SIZE_MAX = 160;
export const SIZE_DEFAULT = 100;
export const SIZE_STEP = 5;

export type Preset = { id: string; style: DiceStyle };

const ESMERALDA: DiceStyle = { body: "#1d9e75", number: "#f4f7f5", outline: "#0c3527", texture: "none", material: "plastic" };

/** Rolai's eight presets, with the same values; "Do Verso" is Verso's own
 *  addition. */
export const PRESETS: readonly Preset[] = [
  { id: "verso", style: { ...ESMERALDA, app: true } },
  { id: "esmeralda", style: ESMERALDA },
  { id: "osso", style: { body: "#e8e0cd", number: "#3a3226", outline: "#3a3226", texture: "marble", material: "auto" } },
  { id: "obsidiana", style: { body: "#14171c", number: "#e5c07b", outline: "#e5c07b", texture: "speckles", material: "metal" } },
  { id: "sangue", style: { body: "#8c1f2b", number: "#f7e8e2", outline: "#2b0a0e", texture: "marble", material: "plastic" } },
  { id: "abissal", style: { body: "#22307a", number: "#9fd8ff", outline: "#0a1030", texture: "astral", material: "auto" } },
  { id: "gelo", style: { body: "#bfe6f2", number: "#123a4a", outline: "#0b2733", texture: "ice", material: "glass" } },
  { id: "escamas", style: { body: "#2f6b3a", number: "#eaf7d9", outline: "#10240f", texture: "dragon", material: "auto" } },
  { id: "madeira", style: { body: "#7a4a22", number: "#f0dcb8", outline: "#2a1608", texture: "wood", material: "wood" } },
];

/** Rolai's defaults for the second and third slots. Slot 1 follows the
 *  app's palette until the person chooses otherwise. */
export const DEFAULT_STYLES: Record<SlotId, DiceStyle> = {
  "1": { ...ESMERALDA, app: true },
  "2": { body: "#14171c", number: "#f87171", outline: "#7f1d1d", texture: "speckles", material: "metal" },
  "3": { body: "#7a4a22", number: "#f0dcb8", outline: "#2a1608", texture: "wood", material: "wood" },
};

/** A fresh default look, so no caller shares the constant. */
export function defaultLook(): DiceLook {
  return { size: SIZE_DEFAULT, time: ROLL_TIME_DEFAULT, sound: true, soundChosen: false, styles: { "1": { ...DEFAULT_STYLES["1"] }, "2": { ...DEFAULT_STYLES["2"] }, "3": { ...DEFAULT_STYLES["3"] } } };
}

const hex = (v: unknown, fallback: string): string => {
  const c = typeof v === "string" ? parseColor(v) : null;
  return c ? toHex(c) : fallback;
};
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** The size in percent, whole, within the slider's range. */
export function clampSize(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : SIZE_DEFAULT;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n)));
}

/** One style read from what is stored, field by field, against `fallback`. */
export function readStyle(raw: unknown, fallback: DiceStyle): DiceStyle {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const r = raw as Record<string, unknown>;
  const out: DiceStyle = {
    body: hex(r["body"], fallback.body),
    number: hex(r["number"], fallback.number),
    outline: hex(r["outline"], fallback.outline),
    texture: oneOf(TEXTURES, r["texture"], fallback.texture),
    material: oneOf(MATERIALS, r["material"], fallback.material),
  };
  if (r["app"] === true) out.app = true;
  else if (r["app"] === undefined && fallback.app && !("body" in r)) out.app = true;
  return out;
}

/** Dice styles read from anything (a settings file, a roll heard from
 *  another person): unknown or malformed fields fall back to the default,
 *  field by field, so what reaches the renderer is always a closed value. */
export function readDiceStyles(raw: unknown): DiceStyles {
  const base = defaultLook().styles;
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { "1": readStyle(s["1"], base["1"]), "2": readStyle(s["2"], base["2"]), "3": readStyle(s["3"], base["3"]) };
}

/** The sound switch is ON by default (Rolai's default). A stored `sound:
 *  false` only counts once the person chose it (`soundChosen`): saves of
 *  other look fields wrote `sound: false` for people who never touched it. */
function readSound(r: Record<string, unknown>): { sound: boolean; soundChosen: boolean } {
  const chosen = r["soundChosen"] === true;
  return { sound: chosen ? r["sound"] === true : true, soundChosen: chosen };
}

/** A look read from the stored settings: anything unknown or malformed
 *  falls back to the default, field by field. */
export function readDiceLook(raw: unknown): DiceLook {
  if (!raw || typeof raw !== "object") return defaultLook();
  const r = raw as Record<string, unknown>;
  return { size: clampSize(r["size"]), styles: readDiceStyles(r["styles"]), time: oneOf(ROLL_TIMES, r["time"], ROLL_TIME_DEFAULT), ...readSound(r) };
}

/** The preset a style is exactly, or null ("Personalizado"). */
export function presetOf(style: DiceStyle): Preset | null {
  if (style.app) return PRESETS.find((p) => p.id === "verso") ?? null;
  return PRESETS.find((p) => !p.style.app && p.style.body === style.body && p.style.number === style.number && p.style.outline === style.outline && p.style.texture === style.texture && p.style.material === style.material) ?? null;
}

/** A style after a preset is applied. */
export function applyPreset(id: string): DiceStyle | null {
  const p = PRESETS.find((x) => x.id === id);
  return p ? { ...p.style } : null;
}

/** A style after one field changed: a colour change leaves "Do Verso". */
export function withField(style: DiceStyle, change: Partial<Omit<DiceStyle, "app">>): DiceStyle {
  const next: DiceStyle = { ...style, ...change };
  if ("body" in change || "number" in change || "outline" in change) delete next.app;
  return next;
}

/** Number colour against body colour, 1 to 21; null when either is not a
 *  colour. Below 3 the numbers are hard to read (the settings warn). */
export const CONTRAST_MIN = 3;
export function numberContrast(style: Pick<DiceStyle, "body" | "number">): number | null {
  const a = parseColor(style.body);
  const b = parseColor(style.number);
  return a && b ? contrast(a, b) : null;
}
export function lowContrast(style: Pick<DiceStyle, "body" | "number">): boolean {
  const c = numberContrast(style);
  return c !== null && c < CONTRAST_MIN;
}

/** The face edge that goes with a body colour: the colour, darkened. */
export function edgeFor(body: string): string {
  const c = parseColor(body);
  return c ? toHex(mix(c, BLACK, 0.5)) : "#333333";
}

/** A finish: the parameters of three.js's physical material. */
export type Finish = { roughness: number; metalness: number; opacity: number; clearcoat: number; env: number };
export type Material = Exclude<MaterialId, "auto">;
export const FINISHES: Record<Material, Finish> = {
  plastic: { roughness: 0.38, metalness: 0.03, opacity: 1, clearcoat: 0.4, env: 0.45 },
  metal: { roughness: 0.5, metalness: 0.6, opacity: 1, clearcoat: 0, env: 1 },
  wood: { roughness: 0.9, metalness: 0, opacity: 1, clearcoat: 0, env: 0.15 },
  glass: { roughness: 0.1, metalness: 0, opacity: 0.85, clearcoat: 0.45, env: 0.45 },
  none: { roughness: 0.95, metalness: 0, opacity: 1, clearcoat: 0, env: 0 },
};

/** The material each texture brings with it (Rolai's, from the dice
 *  library's list); the "Automático" choice follows it. */
export const NATURAL: Record<TextureId, Material> = {
  none: "plastic", marble: "glass", speckles: "none", glitter: "none", stars: "none", astral: "none", cloudy: "none", fire: "metal", water: "glass", ice: "glass", paper: "wood", wood: "wood", metal: "metal", stainedglass: "glass", skulls: "none", dragon: "none", leopard: "wood", tiger: "wood", lizard: "none", bird: "wood",
};

export function materialOf(style: Pick<DiceStyle, "material" | "texture">): Material {
  return style.material === "auto" ? NATURAL[style.texture] : style.material;
}

/** The die's width on screen, in pixels, at 100% on a window of 1440 x 900. */
export const BASE_PX = 72;

/** The die's width on screen for a window of `w` x `h`: the size in
 *  percent, scaled with the window's area (a phone gets a little less, a
 *  big screen a little more), within bounds. */
export function diePixels(sizePercent: number, w: number, h: number): number {
  const scale = Math.min(1.5, Math.max(0.85, Math.sqrt(Math.max(1, w * h)) / Math.sqrt(1440 * 900)));
  return Math.round((BASE_PX * clampSize(sizePercent) * scale) / 100);
}

/** The strip of the window the dice are thrown in: the lower part of the
 *  `area` (the active pane or the window), a little taller for many dice. */
export function throwRegion(area: { left: number; top: number; width: number; height: number }, count: number): { left: number; top: number; width: number; height: number } {
  const share = Math.min(0.75, 0.42 + 0.015 * Math.max(0, count - 2));
  const height = Math.min(area.height, Math.max(260, Math.round(area.height * share)));
  return { left: area.left, top: area.top + area.height - height, width: area.width, height };
}

/** The font numbers are drawn with: the bold system sans. */
export const NUMBER_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** The dice styles as they cross the wire (ADR 0107 item 11): a style that follows the app's palette (`app`) is
 *  turned into the colours this window's theme gives it now, so a viewer with another theme draws the roller's
 *  dice as the roller sees them (2026-10-23: the game master's violet dice fell red for a player). `seal` and
 *  `ink` are the theme's kept-die body and number colours as `#rrggbb`; a style without `app` is copied as is. */
export function resolveApp(styles: DiceStyles, seal: string, ink: string): DiceStyles {
  const one = (s: DiceStyle): DiceStyle => {
    if (!s.app) return { ...s };
    return { body: seal, number: ink, outline: edgeFor(seal), texture: s.texture, material: s.material };
  };
  return { "1": one(styles["1"]), "2": one(styles["2"]), "3": one(styles["3"]) };
}
