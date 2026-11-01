// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The right panel's tabs as the person arranges them (maintainer,
// 2026-11-01: "deveria ser possível esconder e reordenar e reaparecer
// abas"): an order and a set of hidden tabs, both plain data, so that the
// bar, the "⋯" menu and Settings agree and a test can try every rule
// without a page (tabStrip.ts draws; this decides).
//
// - A hidden tab is the person's choice, apart from a tab that is not
//   available (the Table's and the Music's, while their switches are off).
// - The chosen tab is always in the bar, hidden or not: something that
//   opens a hidden tab (the mini-player's name opens Music) shows it for
//   as long as it is chosen, and it goes again when another is chosen.
// - At least one tab stays shown: the last one cannot be hidden.
// - The bar's fold: what does not fit goes to the "⋯" — the chosen tab
//   kept first, then the game's tabs, then the rest in the person's order.

/** The saved order merged with the tabs that exist: unknown ids dropped, a
 *  tab newer than the saved order placed before the one that follows it
 *  among the defaults. */
export function mergeOrder(saved: unknown, defaults: string[]): string[] {
  if (!Array.isArray(saved)) return [...defaults];
  const order: string[] = [];
  for (const x of saved) if (typeof x === "string" && defaults.includes(x) && !order.includes(x)) order.push(x);
  defaults.forEach((id, n) => {
    if (order.includes(id)) return;
    const after = defaults.slice(n + 1).find((x) => order.includes(x));
    order.splice(after ? order.indexOf(after) : order.length, 0, id);
  });
  return order;
}

/** The saved hidden tabs that still exist. */
export function mergeOff(saved: unknown, defaults: string[]): string[] {
  if (!Array.isArray(saved)) return [];
  const off: string[] = [];
  for (const x of saved) if (typeof x === "string" && defaults.includes(x) && !off.includes(x)) off.push(x);
  return off;
}

/** The tabs the bar draws, in the person's order: available, and not
 *  hidden unless chosen. */
export function shown(order: string[], off: string[], available: (id: string) => boolean, current: string): string[] {
  return order.filter((id) => available(id) && (!off.includes(id) || id === current));
}

/** Whether `id` may be hidden: another available, unhidden tab remains. */
export function canHide(order: string[], off: string[], available: (id: string) => boolean, id: string): boolean {
  return order.some((x) => x !== id && available(x) && !off.includes(x));
}

export function hide(off: string[], id: string): string[] {
  return off.includes(id) ? off : [...off, id];
}

export function reveal(off: string[], id: string): string[] {
  return off.filter((x) => x !== id);
}

/** `id` one place left (-1) or right (1) among `among` (the tabs on
 *  screen, in order); the hidden ones in between keep their places. */
export function moveAmong(order: string[], among: string[], id: string, by: -1 | 1): string[] {
  const i = among.indexOf(id);
  const other = among[i + by];
  if (i < 0 || other === undefined) return order;
  const out = order.filter((x) => x !== id);
  const at = out.indexOf(other);
  out.splice(by < 0 ? at : at + 1, 0, id);
  return out;
}

/** `id` placed just before `before` (or last, with null). */
export function placeBefore(order: string[], id: string, before: string | null): string[] {
  const out = order.filter((x) => x !== id);
  const at = before === null ? -1 : out.indexOf(before);
  if (at < 0) out.push(id);
  else out.splice(at, 0, id);
  return out;
}

/** Which of `ids` stay in a bar of `budget` pixels (tabs of `widths`, `gap`
 *  apart, the "⋯" already counted out of the budget): the chosen one
 *  first, then the `keep` ones, then the rest, each in order, stopping at
 *  the first that does not fit. */
export function fold(ids: string[], widths: number[], gap: number, budget: number, current: string, keep: (id: string) => boolean): Set<string> {
  const kept = new Set<number>();
  let used = 0;
  const chosen = ids.indexOf(current);
  if (chosen >= 0) {
    kept.add(chosen);
    used = widths[chosen] ?? 0;
  }
  const pass = (wanted: (i: number) => boolean): void => {
    for (let i = 0; i < ids.length; i++) {
      if (kept.has(i) || !wanted(i)) continue;
      const w = (widths[i] ?? 0) + (kept.size ? gap : 0);
      if (used + w > budget) return;
      kept.add(i);
      used += w;
    }
  };
  pass((i) => keep(ids[i] ?? ""));
  pass(() => true);
  return new Set(ids.filter((_, i) => kept.has(i)));
}
