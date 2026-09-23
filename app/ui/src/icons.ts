// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A small stroke icon set, drawn for this window: 16-unit grid, 1.5 stroke,
// round joins. Inline SVG, so they take the text colour.

const PATHS: Record<string, string> = {
  folder: "M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z",
  search: "M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.3 10.3 14 14",
  refresh: "M13 8A5 5 0 1 1 11.6 4.5M13 2.5v3h-3",
  split: "M2.5 3.5h11v9h-11zM8 3.5v9",
  splitDown: "M2.5 3.5h11v9h-11zM2.5 8h11",
  close: "M4 4l8 8M12 4l-8 8",
  reading: "M2 3.5h4.5A1.5 1.5 0 0 1 8 5v8a1.5 1.5 0 0 0-1.5-1.5H2zM14 3.5H9.5A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5H14z",
  edit: "M11.5 2.5 13.5 4.5 6 12H4v-2zM10 4l2 2",
  source: "M6 4 2.5 8 6 12M10 4l3.5 4L10 12",
  save: "M3 2.5h8l2.5 2.5v8.5h-10.5zM5 2.5v4h6v-4M5 13.5V9h6v4.5",
  chevron: "M6 3.5 10.5 8 6 12.5",
  plus: "M8 3v10M3 8h10",
  warn: "M8 2.5 14 13H2zM8 6.5v3M8 11.2v.3",
  outline: "M3 4h10M5 8h8M7 12h6",
  image: "M2.5 3.5h11v9h-11zM2.5 10.5l3-3 2.5 2.5 2-2 3.5 3.5M10.5 6.5h.01",
  text: "M4 2.5h5.5L12.5 5.5v8h-8.5zM9.5 2.5v3h3M6 8h4M6 10.5h4",
  note: "M4 2.5h5.5L12.5 5.5v8h-8.5zM9.5 2.5v3h3",
  pdf: "M4 2.5h5.5L12.5 5.5v8h-8.5zM9.5 2.5v3h3M6 11.5v-4h1.5a1 1 0 0 1 0 2H6",
  folderOpen: "M2 6.5V4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v.5M2 6.5h11.5l-1.2 5.5A1.5 1.5 0 0 1 10.8 13H3.7a1.5 1.5 0 0 1-1.5-1.2z",
  grid: "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z",
  list: "M2.5 4h11M2.5 8h11M2.5 12h11",
  maximize: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  collapse: "M4 6l4-3 4 3M4 10l4 3 4-3",
  expand: "M4 4l4 3 4-3M4 12l4-3 4 3",
  heading: "M3.5 3v10M3.5 8h6M9.5 3v10M12.5 13V9.5l-1 1",
  bold: "M4.5 3h4a2.25 2.25 0 0 1 0 4.5h-4zM4.5 7.5h4.5a2.5 2.5 0 0 1 0 5h-4.5z",
  italic: "M6.5 3h5M4.5 13h5M9.5 3l-3 10",
  strike: "M3 8h10M5 5a3 2 0 0 1 6 0M5 11a3 2 0 0 0 6 0",
  highlight: "M3 12.5h10M5.5 10.5 10 3.5l2 1.2-4.5 7z",
  wikilink: "M5.5 3H3.5v10h2M10.5 3h2v10h-2",
  bullets: "M6 4h7M6 8h7M6 12h7M3 4h.01M3 8h.01M3 12h.01",
  numbers: "M6 4h7M6 8h7M6 12h7M2.5 3l1-.5v3M2.5 9.5a1 1 0 1 1 1.5.8l-1.5 1.7h2",
  task: "M2.5 3.5h9v9h-9zM4.5 8.5l2 2 3.5-4",
  quote: "M4 4h3v4H4zM9 4h3v4H9zM4 8c0 2 1 3 3 3M9 8c0 2 1 3 3 3",
  code: "M6 4 2.5 8 6 12M10 4l3.5 4L10 12",
  rule: "M2.5 8h11",
  link: "M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1",
};

export function icon(name: keyof typeof PATHS | string, label?: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("icon");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[name] ?? "");
  svg.append(path);
  return svg;
}
