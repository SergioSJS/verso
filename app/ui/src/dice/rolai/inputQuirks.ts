// Copied from Rolai, the maintainer's dice roller
// (https://github.com/SergioSJS/rolai), apps/web/src/profileInputQuirks.ts, at
// commit 368d677c8347609c243473046d4f06a1126ddb74, for ADR 0088 item 5:
// the values a profile needs that are not an input of their own, worked out before the roll.
// Verso's changes: the import names Verso's copy of the profile types.
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

// Alguns profiles precisam de um valor que nao e um input de verdade —
// combina dois inputs visiveis num numero que so o motor usa. O profile
// schema (docs/system-profiles.md) nao tem "input derivado": field.dice so
// faz substituicao literal de {input.id}, sem aritmetica. Entao quem
// calcula esse valor e a UI, num lugar SO (nao duplicado em roll.ts e
// headless.ts, senao um dos dois fica pra tras — mesma familia de erro do
// AGENTS.md).
//
// fractal: o jogador informa "fatos_aplicaveis" (0+) e "vantagem"
// (sim/nao), mas o field usa "{input.dice_total}d6" — pool de Fatos
// (capada em 3) + 1 se teve Vantagem E tinha pelo menos 1 Fato aplicavel
// (Vantagem sem Fato nao conta, mesmo se o valor chegar aqui como "sim").

import type { ProfileInputs, SystemProfile } from "./profile";

export function applyInputQuirks(
  profile: SystemProfile,
  inputs: ProfileInputs,
): ProfileInputs {
  if (profile.system !== "fractal") return inputs;
  const fatos = Math.max(0, Math.min(3, Number(inputs["fatos_aplicaveis"] ?? 0)));
  const vantagem = fatos >= 1 && inputs["vantagem"] === "sim" ? 1 : 0;
  return { ...inputs, dice_total: fatos + vantagem };
}
