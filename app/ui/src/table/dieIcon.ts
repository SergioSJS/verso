// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The dice tray's icons (ADR 0107, the dice composer): the silhouette of
// each die's physical shape, one stroke in the current colour, as Rolai's
// composer draws them (rolai, apps/web/src/components/DiceIcon.tsx, MIT, by
// the same author). Decorative: the button around it carries the name.

import type { DieKind } from "./composer";

const NS = "http://www.w3.org/2000/svg";

/** Polygons in a 24 × 24 box; a value starting with "M" is a path. */
const SHAPES: Record<number, string> = {
  4: "12,3.5 20.5,19.5 3.5,19.5",
  6: "M5,5 h14 v14 h-14 z",
  8: "12,2.5 21,12 12,21.5 3,12",
  10: "12,2.5 19.5,9.5 12,21.5 4.5,9.5",
  12: "12,2.8 20.2,8.8 17,19.2 7,19.2 3.8,8.8",
  20: "12,2.5 20.2,7.2 20.2,16.8 12,21.5 3.8,16.8 3.8,7.2",
};

type Part = ["path", string] | ["polygon", string] | ["circle", number, number, number] | ["rect", number, number, number, number, number];

function parts(kind: DieKind): Part[] {
  if (kind === 2) return [["circle", 12, 12, 8], ["path", "M12,6.5 v11"]];
  if (kind === 3) return [["polygon", "12,3.5 20.5,19.5 3.5,19.5"], ["path", "M12,3.5 v16"]];
  if (kind === "F") return [["path", "M5,5 h14 v14 h-14 z"], ["path", "M8.2,10 h3.4 M9.9,8.3 v3.4"], ["path", "M13,15.5 h3.4"]];
  if (kind === 66) return [["rect", 3.5, 4, 10, 10, 1.5], ["rect", 10.5, 10, 10, 10, 1.5]];
  if (kind === 100) return [["polygon", "7.5,5 12,9.5 7.5,14 3,9.5"], ["polygon", "16.5,10 21,14.5 16.5,19 12,14.5"]];
  const shape = typeof kind === "number" ? SHAPES[kind] : undefined;
  if (shape === undefined) return [];
  return [shape.startsWith("M") ? ["path", shape] : ["polygon", shape]];
}

/** The die's icon, or null for a kind with no shape. */
export function dieIcon(kind: DieKind, className: string): SVGSVGElement | null {
  const drawn = parts(kind);
  if (drawn.length === 0) return null;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const p of drawn) {
    const el = document.createElementNS(NS, p[0]);
    if (p[0] === "path") el.setAttribute("d", p[1]);
    else if (p[0] === "polygon") el.setAttribute("points", p[1]);
    else if (p[0] === "circle") {
      el.setAttribute("cx", String(p[1]));
      el.setAttribute("cy", String(p[2]));
      el.setAttribute("r", String(p[3]));
    } else {
      el.setAttribute("x", String(p[1]));
      el.setAttribute("y", String(p[2]));
      el.setAttribute("width", String(p[3]));
      el.setAttribute("height", String(p[4]));
      el.setAttribute("rx", String(p[5]));
    }
    svg.append(el);
  }
  return svg;
}
