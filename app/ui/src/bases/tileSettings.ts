// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings › the maps' background (ADR 0094 items 8 and 9): the world
// outline shipped with the app by default, asking nothing of the network;
// OpenFreeMap — the Maps plugin's default — named, as one choice to turn
// on, never on by itself; or an address of the person's own. Choosing a
// source approves its origin, as an embedded page's origin is approved
// (ADR 0056); the origins approved — by this choice, or by a base asking
// for its own `mapTiles` — are listed, one per line, and a line deleted is
// asked again.

import { h } from "./cells";
import { originOf } from "./mapData";

/** The plugin's default (its README; `src/map/style.ts`), named. */
export const OPENFREEMAP = {
  light: "https://tiles.openfreemap.org/styles/bright",
  dark: "https://tiles.openfreemap.org/styles/dark",
  origin: "https://tiles.openfreemap.org",
};

const pt = {
  title: "Fundo dos mapas",
  desc: "O que um mapa de base mostra sob os marcadores. Por padrão, o contorno do mundo que vem com o Verso, sem pedir nada à rede.",
  world: "Contorno do mundo (sem rede)",
  openfreemap: "OpenFreeMap — tiles.openfreemap.org",
  custom: "Outro endereço…",
  light: "Endereço (estilo ou modelo de tiles)",
  dark: "Endereço no modo escuro (opcional)",
  origins: "Origens aprovadas para o fundo dos mapas, uma por linha",
  note: "Escolher um fundo aprova a origem dele; uma base que peça o próprio fundo pergunta antes. Cada mapa busca as tiles direto da origem aprovada, que fica sabendo quais lugares você olha. Apagar uma linha volta a perguntar.",
  onServer: "Num servidor, uma origem nova vale depois que a página recarregar.",
};

const en: typeof pt = {
  title: "Maps' background",
  desc: "What a base's map shows under its markers. By default, the world outline Verso ships with, asking nothing of the network.",
  world: "World outline (no network)",
  openfreemap: "OpenFreeMap — tiles.openfreemap.org",
  custom: "Another address…",
  light: "Address (a style or a tile template)",
  dark: "Address in dark mode (optional)",
  origins: "Origins approved for maps' backgrounds, one per line",
  note: "Choosing a background approves its origin; a base asking for its own background asks first. Each map fetches tiles straight from the approved origin, which learns which places you look at. Deleting a line asks again.",
  onServer: "On a server, a new origin applies once the page reloads.",
};

export type TileSettings = { mapTiles: string; mapTilesDark: string; mapTileOrigins: string[] };

export function tileStrings(locale: string): typeof pt {
  return locale.toLowerCase().startsWith("pt") ? pt : en;
}

/** `origins` with each address's origin approved. */
export function approving(origins: readonly string[], ...urls: string[]): string[] {
  const out = [...origins];
  for (const u of urls) {
    const o = u.trim() ? originOf(u.trim()) : null;
    if (o && !out.includes(o)) out.push(o);
  }
  return out;
}

/** The control of Settings: the source, its addresses, the origins. */
export function tileControl(locale: string, current: TileSettings, save: (next: TileSettings) => void, onServer: boolean): HTMLElement {
  const s = tileStrings(locale);
  const wrap = h("div", "setting-block map-tiles-setting");
  let state: TileSettings = { ...current, mapTileOrigins: [...current.mapTileOrigins] };
  const kind = (): "world" | "openfreemap" | "custom" => (state.mapTiles === "" ? "world" : state.mapTiles === OPENFREEMAP.light ? "openfreemap" : "custom");
  const choose = h("select");
  choose.setAttribute("aria-label", s.title);
  for (const [v, label] of [["world", s.world], ["openfreemap", s.openfreemap], ["custom", s.custom]] as const) {
    const o = h("option", "", label);
    o.value = v;
    choose.append(o);
  }
  const field = (label: string, value: string): [HTMLLabelElement, HTMLInputElement] => {
    const l = h("label", "map-tiles-field");
    const input = h("input");
    input.type = "url";
    input.spellcheck = false;
    input.value = value;
    input.placeholder = "https://";
    l.append(h("span", "", label), input);
    return [l, input];
  };
  const [lightLabel, light] = field(s.light, state.mapTiles);
  const [darkLabel, dark] = field(s.dark, state.mapTilesDark);
  const origins = h("textarea", "map-tile-origins") as HTMLTextAreaElement;
  origins.rows = 3;
  origins.spellcheck = false;
  origins.placeholder = "https://tiles.example.com";
  const originsLabel = h("label", "map-tiles-field");
  originsLabel.append(h("span", "", s.origins), origins);
  const commit = () => {
    save(state);
    origins.value = state.mapTileOrigins.join("\n");
  };
  const paint = () => {
    choose.value = kind();
    const custom = kind() === "custom";
    lightLabel.hidden = !custom;
    darkLabel.hidden = !custom;
    origins.value = state.mapTileOrigins.join("\n");
  };
  choose.addEventListener("change", () => {
    if (choose.value === "world") state = { ...state, mapTiles: "", mapTilesDark: "" };
    else if (choose.value === "openfreemap")
      state = { mapTiles: OPENFREEMAP.light, mapTilesDark: OPENFREEMAP.dark, mapTileOrigins: approving(state.mapTileOrigins, OPENFREEMAP.light) };
    else {
      // An address of the person's own: typed below, approved then.
      lightLabel.hidden = false;
      darkLabel.hidden = false;
      light.focus();
      return;
    }
    commit();
    paint();
  });
  const typed = () => {
    const l = light.value.trim();
    const d = dark.value.trim();
    state = { mapTiles: l, mapTilesDark: l ? d : "", mapTileOrigins: approving(state.mapTileOrigins, l, d) };
    commit();
    paint();
  };
  light.addEventListener("change", typed);
  dark.addEventListener("change", typed);
  origins.addEventListener("change", () => {
    const seen: string[] = [];
    for (const line of origins.value.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const o = originOf(t.includes("://") ? t : `https://${t}`);
      if (o && !seen.includes(o)) seen.push(o);
    }
    state = { ...state, mapTileOrigins: seen };
    commit();
  });
  const note = h("p", "setting-note", onServer ? `${s.note} ${s.onServer}` : s.note);
  wrap.append(choose, lightLabel, darkLabel, originsLabel, note);
  paint();
  return wrap;
}
