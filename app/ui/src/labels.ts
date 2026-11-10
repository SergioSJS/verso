// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Labels (ADR 0060 S1): sticker, color, cover banner and banner_y rendering
// and picker. Supports make.md's `emoji//<hex>` and `lucide//<icon>` formats.

import lucideNodes from "lucide-static/icon-nodes.json";
import emojiList from "./emoji-data.json";
import { placeInView } from "./screen/viewport";
import { focusOnOpen } from "./screen/openFocus";

export type EmojiEntry = {
  c: string; // unicode character
  h: string; // hex code points joined by '-'
  pt: string; // pt-BR display name
  en: string; // en display name
  kw: string; // search keywords
};

export const allEmojis = emojiList as EmojiEntry[];
const emojis = allEmojis;
const nodesMap = lucideNodes as unknown as Record<string, [string, Record<string, string>][]>;

const LUCIDE_ALIASES: Record<string, string> = {
  home: "house",
  trash: "trash-2",
  edit: "pencil",
  delete: "trash-2",
  close: "x",
  add: "plus",
  search: "search",
  star: "star",
  heart: "heart",
  settings: "settings",
  folder: "folder",
  file: "file",
  bookmark: "bookmark",
  pin: "pin",
  tag: "tag",
  note: "file-text",
};

export const PRESET_COLORS: { id: string; namePt: string; nameEn: string; hex: string }[] = [
  { id: "red", namePt: "Vermelho", nameEn: "Red", hex: "#e05252" },
  { id: "orange", namePt: "Laranja", nameEn: "Orange", hex: "#e07a52" },
  { id: "yellow", namePt: "Amarelo", nameEn: "Yellow", hex: "#e5c07b" },
  { id: "green", namePt: "Verde", nameEn: "Green", hex: "#52b788" },
  { id: "teal", namePt: "Ciano", nameEn: "Teal", hex: "#4ea8de" },
  { id: "blue", namePt: "Azul", nameEn: "Blue", hex: "#4361ee" },
  { id: "purple", namePt: "Roxo", nameEn: "Purple", hex: "#7209b7" },
  { id: "pink", namePt: "Rosa", nameEn: "Pink", hex: "#e05780" },
  { id: "gray", namePt: "Cinza", nameEn: "Gray", hex: "#8d99ae" },
  { id: "brown", namePt: "Marrom", nameEn: "Brown", hex: "#8d6e63" },
];

export function resolveColor(color: string | null | undefined): string | null {
  if (!color || !color.trim()) return null;
  const c = color.trim().toLowerCase();
  const found = PRESET_COLORS.find((p) => p.id === c || p.nameEn.toLowerCase() === c || p.namePt.toLowerCase() === c);
  if (found) return found.hex;
  if (/^#([0-9a-f]{3,8})$/i.test(c) || /^rgb/i.test(c) || /^hsl/i.test(c)) return c;
  return null;
}

export function decodeHexEmoji(hex: string): string {
  try {
    const codePoints = hex.split(/[-_]/).map((h) => parseInt(h, 16));
    if (codePoints.some((cp) => isNaN(cp) || cp <= 0)) return "";
    return String.fromCodePoint(...codePoints);
  } catch {
    return "";
  }
}

export function encodeEmojiToHex(char: string): string {
  const points: string[] = [];
  for (const sym of char) {
    const cp = sym.codePointAt(0);
    if (cp !== undefined) points.push(cp.toString(16));
  }
  return `emoji//${points.join("-")}`;
}

export function resolveLucideName(rawName: string): string {
  let name = rawName.trim().toLowerCase();
  if (name.startsWith("lucide//")) name = name.slice("lucide//".length);
  else if (name.startsWith("lucide:")) name = name.slice("lucide:".length);
  else if (name.startsWith("ui//")) name = name.slice("ui//".length);
  else if (name.startsWith("ui:")) name = name.slice("ui:".length);
  if (name.startsWith("lucide-")) name = name.slice("lucide-".length);
  return LUCIDE_ALIASES[name] ?? name;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderLucideSvg(iconName: string, size = 16, strokeWidth = 2): SVGSVGElement | null {
  const name = resolveLucideName(iconName);
  const nodes = nodesMap[name];
  if (!nodes) return null;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(strokeWidth));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("lucide-icon");
  for (const [tag, attrs] of nodes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
  }
  return svg;
}

export function renderSticker(sticker: string | null | undefined, size = 16): HTMLElement | null {
  if (!sticker || !sticker.trim()) return null;
  const s = sticker.trim();
  const span = document.createElement("span");
  span.className = "entry-sticker";

  if (s.startsWith("emoji//") || s.startsWith("emoji:")) {
    const hex = s.replace(/^emoji(\/\/|:)/, "");
    const char = decodeHexEmoji(hex);
    if (char) {
      span.classList.add("entry-sticker-emoji");
      span.textContent = char;
      return span;
    }
  } else if (s.startsWith("lucide//") || s.startsWith("lucide:") || s.startsWith("ui//") || s.startsWith("ui:")) {
    const svg = renderLucideSvg(s, size);
    if (svg) {
      span.classList.add("entry-sticker-icon");
      span.appendChild(svg);
      return span;
    }
  } else {
    // Check if it matches a Lucide icon
    const svg = renderLucideSvg(s, size);
    if (svg) {
      span.classList.add("entry-sticker-icon");
      span.appendChild(svg);
      return span;
    }
    // An emoji written as itself; any other text is no sticker, and the
    // item keeps its default icon (ADR 0060 S1).
    if (s.length <= 16 && /^(\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(s)) {
      span.classList.add("entry-sticker-emoji");
      span.textContent = s;
      return span;
    }
  }
  return null;
}

export type PickerStrings = {
  emojis: string;
  icons: string;
  colors: string;
  search: string;
  removeSticker: string;
  removeColor: string;
  /** The picker's name, for a screen reader. */
  label: string;
  /** The stickers' grid's name, for a screen reader. */
  grid: string;
};

export type PickerOptions = {
  anchorEl?: HTMLElement | null;
  x?: number;
  y?: number;
  currentSticker?: string | null;
  currentColor?: string | null;
  strings: PickerStrings;
  lang?: "pt" | "en";
  onSelectSticker: (sticker: string) => void;
  onSelectColor: (color: string) => void;
  onRemoveSticker: () => void;
  onRemoveColor: () => void;
};

export function showStickerPicker(opts: PickerOptions): () => void {
  const existing = document.querySelector(".sticker-picker-popover");
  if (existing) existing.remove();

  const popover = document.createElement("div");
  popover.className = "sticker-picker-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "true");
  popover.setAttribute("aria-label", opts.strings.label);

  // Tabs: Emoji | Icons
  const tabs = document.createElement("div");
  tabs.className = "sticker-picker-tabs";
  tabs.setAttribute("role", "tablist");

  const btnEmoji = document.createElement("button");
  btnEmoji.type = "button";
  btnEmoji.className = "picker-tab active";
  btnEmoji.textContent = opts.strings.emojis;
  btnEmoji.setAttribute("role", "tab");
  btnEmoji.setAttribute("aria-selected", "true");

  const btnIcons = document.createElement("button");
  btnIcons.type = "button";
  btnIcons.className = "picker-tab";
  btnIcons.textContent = opts.strings.icons;
  btnIcons.setAttribute("role", "tab");
  btnIcons.setAttribute("aria-selected", "false");

  tabs.append(btnEmoji, btnIcons);

  // Search input
  const search = document.createElement("input");
  search.type = "text";
  search.className = "sticker-picker-search";
  search.placeholder = opts.strings.search;
  search.setAttribute("aria-label", opts.strings.search);

  // Grid container
  const grid = document.createElement("div");
  grid.className = "sticker-picker-grid";
  grid.setAttribute("role", "listbox");
  grid.setAttribute("aria-label", opts.strings.grid);

  // Color bar
  const colorBar = document.createElement("div");
  colorBar.className = "sticker-picker-colors";
  colorBar.setAttribute("role", "group");
  colorBar.setAttribute("aria-label", opts.strings.colors);
  for (const c of PRESET_COLORS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    swatch.style.backgroundColor = c.hex;
    const colorName = opts.lang === "pt" ? c.namePt : c.nameEn;
    swatch.title = colorName;
    swatch.setAttribute("aria-label", colorName);
    if (opts.currentColor && resolveColor(opts.currentColor) === c.hex) {
      swatch.classList.add("active");
      swatch.setAttribute("aria-pressed", "true");
    } else {
      swatch.setAttribute("aria-pressed", "false");
    }
    swatch.addEventListener("click", () => {
      // The hex, which any reader takes as a colour (the maintainer,
      // 2026-10-02); a preset's id is still read.
      opts.onSelectColor(c.hex);
      close();
    });
    colorBar.appendChild(swatch);
  }

  // Action footer
  const footer = document.createElement("div");
  footer.className = "sticker-picker-footer";

  if (opts.currentSticker) {
    const btnRemoveSticker = document.createElement("button");
    btnRemoveSticker.type = "button";
    btnRemoveSticker.className = "picker-remove-btn";
    btnRemoveSticker.textContent = opts.strings.removeSticker;
    btnRemoveSticker.setAttribute("aria-label", opts.strings.removeSticker);
    btnRemoveSticker.addEventListener("click", () => {
      opts.onRemoveSticker();
      close();
    });
    footer.appendChild(btnRemoveSticker);
  }

  if (opts.currentColor) {
    const btnRemoveColor = document.createElement("button");
    btnRemoveColor.type = "button";
    btnRemoveColor.className = "picker-remove-btn";
    btnRemoveColor.textContent = opts.strings.removeColor;
    btnRemoveColor.setAttribute("aria-label", opts.strings.removeColor);
    btnRemoveColor.addEventListener("click", () => {
      opts.onRemoveColor();
      close();
    });
    footer.appendChild(btnRemoveColor);
  }

  let activeTab: "emoji" | "icons" = "emoji";

  const renderEmojiGrid = (query = "") => {
    grid.replaceChildren();
    const q = query.toLowerCase().trim();
    let matches = emojis;
    if (q) {
      matches = emojis.filter((e) => e.kw.includes(q) || e.pt.toLowerCase().includes(q) || e.en.toLowerCase().includes(q));
    }
    // Limit to 200 items for snappy rendering
    const slice = matches.slice(0, 200);
    for (const item of slice) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sticker-item-btn";
      b.textContent = item.c;
      const lbl = opts.lang === "pt" ? item.pt : item.en;
      b.title = lbl;
      b.setAttribute("aria-label", lbl);
      b.setAttribute("role", "option");
      b.addEventListener("click", () => {
        opts.onSelectSticker(`emoji//${item.h}`);
        close();
      });
      grid.appendChild(b);
    }
  };

  const allIconNames = Object.keys(nodesMap).sort();
  const renderIconGrid = (query = "") => {
    grid.replaceChildren();
    const q = query.toLowerCase().trim();
    let matches = allIconNames;
    if (q) {
      matches = allIconNames.filter((name) => name.includes(q));
    }
    const slice = matches.slice(0, 200);
    for (const name of slice) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sticker-item-btn sticker-item-icon";
      b.title = name;
      b.setAttribute("aria-label", name);
      b.setAttribute("role", "option");
      const svg = renderLucideSvg(name, 20);
      if (svg) b.appendChild(svg);
      b.addEventListener("click", () => {
        opts.onSelectSticker(`lucide//${name}`);
        close();
      });
      grid.appendChild(b);
    }
  };

  btnEmoji.addEventListener("click", () => {
    activeTab = "emoji";
    btnEmoji.classList.add("active");
    btnEmoji.setAttribute("aria-selected", "true");
    btnIcons.classList.remove("active");
    btnIcons.setAttribute("aria-selected", "false");
    renderEmojiGrid(search.value);
  });

  btnIcons.addEventListener("click", () => {
    activeTab = "icons";
    btnIcons.classList.add("active");
    btnIcons.setAttribute("aria-selected", "true");
    btnEmoji.classList.remove("active");
    btnEmoji.setAttribute("aria-selected", "false");
    renderIconGrid(search.value);
  });

  search.addEventListener("input", () => {
    if (activeTab === "emoji") renderEmojiGrid(search.value);
    else renderIconGrid(search.value);
  });

  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const first = grid.querySelector<HTMLButtonElement>("button");
      first?.focus();
    }
  });

  grid.addEventListener("keydown", (e) => {
    const btns = Array.from(grid.querySelectorAll<HTMLButtonElement>("button"));
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;
    const cols = 6;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      btns[Math.min(btns.length - 1, idx + 1)]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      btns[Math.max(0, idx - 1)]?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (idx + cols < btns.length) btns[idx + cols]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx - cols >= 0) btns[idx - cols]?.focus();
      else search.focus();
    }
  });

  renderEmojiGrid();

  popover.append(tabs, search, grid, colorBar);
  if (footer.children.length > 0) popover.append(footer);
  document.body.appendChild(popover);

  // Inside what the screen shows — on a phone, above the on-screen
  // keyboard (ADR 0076 item 7) — under the anchor, or above it.
  const at = opts.anchorEl ? opts.anchorEl.getBoundingClientRect() : opts.x !== undefined && opts.y !== undefined ? { left: opts.x, top: opts.y, bottom: opts.y } : null;
  if (at) {
    const { left, top } = placeInView(at.left, at.bottom + 6, popover.offsetWidth || 320, popover.offsetHeight || 360, at.top);
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  const onDocMouseDown = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node) && (!opts.anchorEl || !opts.anchorEl.contains(e.target as Node))) {
      close();
    }
  };

  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  setTimeout(() => {
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    focusOnOpen(search);
  }, 10);

  const close = () => {
    document.removeEventListener("mousedown", onDocMouseDown);
    document.removeEventListener("keydown", onDocKeyDown);
    popover.remove();
    if (opts.anchorEl?.isConnected) opts.anchorEl.focus();
  };

  return close;
}
