// Copied from Rolai, the maintainer's dice roller
// (https://github.com/SergioSJS/rolai), packages/rules-engine/src/rng.ts, at
// commit 368d677c8347609c243473046d4f06a1126ddb74 (2026-08-21), for ADR 0088
// item 5: its parser and roller copied into the window, the MIT notice kept.
// Verso's changes: `rollDie` draws again a value past the last whole multiple of the
// sides, so that a die has no modulo bias (ADR 0088 item 7); the comments in
// English say so.
//
// MIT License
//
// Copyright (c) 2026 Sérgio J. Sousa
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Fonte de RNG injetavel. Default: crypto.getRandomValues, disponivel em
// Node 18+ (global webcrypto), browser e WebView Android. NUNCA usar
// Math.random() puro — ver docs/security.md.

import type { RandomSource } from "./types";

function requireCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error(
      "crypto.getRandomValues indisponivel neste ambiente — injete um RandomSource explicito",
    );
  }
  return c;
}

// RandomSource default: uniforme em [0, 1) via 32 bits do CSPRNG.
export const cryptoRandomSource: RandomSource = () => {
  const buf = new Uint32Array(1);
  requireCrypto().getRandomValues(buf);
  const value = buf[0];
  if (value === undefined) {
    // impossivel na pratica (buffer de 1 elemento), mas noUncheckedIndexedAccess
    throw new Error("falha ao ler bytes aleatorios");
  }
  return value / 2 ** 32;
};

// Rola um dado de `sides` faces usando a fonte fornecida.
//
// Verso: the source's value read as a 32-bit draw (what
// `cryptoRandomSource` gives, exactly); a draw at or past the last whole
// multiple of `sides` is drawn again, so that every face is equally likely
// — `Math.floor(rand() * sides)` favours the low faces of a die whose
// sides do not divide 2^32 (ADR 0088 item 7).
export function rollDie(sides: number, rand: RandomSource): number {
  // A die with no face, or half of one, has no draw to wait for: the loop
  // below would never end (`x < NaN` is never true).
  if (!Number.isInteger(sides) || sides < 1) throw new RangeError(`A die needs a whole number of faces, 1 or more (got ${sides}).`);
  const span = 2 ** 32;
  const limit = Math.floor(span / sides) * sides;
  for (;;) {
    const x = Math.floor(rand() * span);
    if (x < limit) return 1 + (x % sides);
  }
}
