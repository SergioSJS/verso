// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings › Appearance › Text: a short excerpt shown in the note's own text
// styles, under the font size, so the size can be judged where it is set. It
// is a real `.preview`, so it takes --note-scale, the theme's fonts and
// colours and the chosen text width from the root, and follows them live (a
// MutationObserver on the root). Wider than the dialog, it is scaled down
// as a whole; when that would be too small to read it wraps at the dialog's
// width instead and keeps the true font size.

import { h } from "./dom";
import { pt, t } from "./strings";

const words = t === pt
  ? { label: "Exemplo", h: "A ponte de pedra", p: "O dragão dormia sob a ponte de pedra, enrolado em suas memórias. Quando a lua subiu, o ferreiro da aldeia ouviu o ronco e não quis acordá-lo.", li: "Levar o mapa e três tochas" }
  : { label: "Example", h: "The stone bridge", p: "The dragon slept beneath the stone bridge, curled around its memories. When the moon rose, the village smith heard the snoring and chose not to wake it.", li: "Bring the map and three torches" };

export const fontSampleWords = { label: words.label };

/** The narrowest a scaled-down sample may get before it wraps instead. */
const FLOOR = 0.6;
/** The widest a text width (full) is laid out before being fitted. */
const CAP = 1200;

export function fontSample(): HTMLElement {
  const box = h("div", "font-sample");
  const label = h("div", "font-sample-label", words.label);
  const frame = h("div", "font-sample-frame");
  frame.setAttribute("aria-hidden", "true");
  const body = h("div", "preview font-sample-body");
  const p = h("p", "", words.p);
  const ul = h("ul");
  ul.append(h("li", "", words.li));
  body.append(h("h2", "", words.h), p, ul);
  frame.append(body);
  box.append(label, frame);

  const fit = (): void => {
    if (!box.isConnected) return;
    const avail = frame.clientWidth;
    if (avail <= 0) return;
    body.style.transform = "";
    body.style.width = `${CAP}px`;
    const natural = Math.min(CAP, body.offsetWidth);
    let scale = Math.min(1, avail / natural);
    let width = natural;
    if (scale < FLOOR) { scale = 1; width = avail; }
    body.style.width = `${width}px`;
    body.style.transform = scale < 1 ? `scale(${scale})` : "";
    frame.style.height = `${Math.ceil(body.offsetHeight * scale)}px`;
    frame.dataset.scale = String(Math.round(scale * 100) / 100);
  };
  let queued = false;
  const later = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fit(); });
  };
  new MutationObserver(later).observe(document.documentElement, { attributes: true });
  new ResizeObserver(later).observe(frame);
  later();
  return box;
}
