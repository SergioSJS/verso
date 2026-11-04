// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A QR the host encoded (rows of 1 and 0), drawn as an SVG: the pairing
// dialog's (ADR 0096 item 7) and the internet link's (ADR 0117 D3 item 6).

/** The QR as an SVG built here from rows of 1 and 0: no markup comes from
 *  the host. */
export function drawQr(rows: string[], label: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const n = rows.length;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${n} ${n}`);
  svg.setAttribute("class", "ls-qr");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("shape-rendering", "crispEdges");
  const back = document.createElementNS(ns, "rect");
  back.setAttribute("width", String(n));
  back.setAttribute("height", String(n));
  back.setAttribute("fill", "#fff");
  let d = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (row[x] !== "1") {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === "1") run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#000");
  svg.append(back, path);
  return svg;
}
