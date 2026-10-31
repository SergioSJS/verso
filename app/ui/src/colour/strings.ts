// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the colour swatches and their picker say (ADR 0108 item 8), in both
// languages (ADR 0035).

import { LANG } from "../strings";

const pt = {
  /** The swatch as a button (the editor) and as a picture (reading). */
  adjust: (code: string) => `Cor ${code} — ajustar`,
  shows: (code: string) => `Cor ${code}`,
  picker: "Seletor de cor",
  square: "Saturação e brilho",
  squareValue: (s: number, v: number) => `saturação ${s}%, brilho ${v}%`,
  hue: "Matiz",
  hueValue: (h: number) => `${h} graus`,
  alpha: "Opacidade",
  alphaValue: (a: number) => `${a}%`,
  hint: "Setas ajustam, Enter aplica, Esc cancela.",
  said: (code: string) => `Cor ${code}`,
};

const en: typeof pt = {
  adjust: (code) => `Colour ${code} — adjust`,
  shows: (code) => `Colour ${code}`,
  picker: "Colour picker",
  square: "Saturation and brightness",
  squareValue: (s, v) => `saturation ${s}%, brightness ${v}%`,
  hue: "Hue",
  hueValue: (h) => `${h} degrees`,
  alpha: "Opacity",
  alphaValue: (a) => `${a}%`,
  hint: "Arrows adjust, Enter applies, Esc cancels.",
  said: (code) => `Colour ${code}`,
};

export const cs: typeof pt = LANG.toLowerCase().startsWith("pt") ? pt : en;
