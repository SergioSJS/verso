// Copied from Rolai, the maintainer's dice roller
// (https://github.com/SergioSJS/rolai), packages/rules-engine/src/types.ts, at
// commit 368d677c8347609c243473046d4f06a1126ddb74 (2026-08-21), for ADR 0088
// item 5: its parser and roller copied into the window, the MIT notice kept.
// Verso's changes: none.
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

// Contrato canonico de saida de uma rolagem — ver docs/roll-notation.md.
// Todo resultado que trafega pelo WS ou vai pro historico usa este formato.

export interface RollGroup {
  /** Dados que CONTAM no total (após keep/drop). */
  rolls: number[];
  /**
   * Dados descartados pelo keep/drop, na ordem em que caíram.
   *
   * Ausente quando não houve descarte. Existe pra UI poder mostrar a
   * rolagem inteira — `4d6kh3` que exibe só 3 dados esconde metade do que
   * aconteceu, e em pool grande (`10d6kh1`) fica absurdo: 10 dados rolam,
   * 1 aparece. O total ignora estes valores.
   */
  dropped?: number[];
  modifier?: number;
  total?: number;
  /** Slot de cor do grupo de dados (1 = primário, 2 = secundário, 3 = terciário). */
  slot?: number;
  /** Tema/cor visual legado ou customizado do grupo. */
  theme?: string;
}

export interface RollResult {
  notation: string;
  groups: Record<string, RollGroup>;
  profile?: string;
  outcome?: string;
  // Todas as outcome_rules cuja condition bateu, em ordem de avaliacao.
  // `outcome` e sempre o primeiro elemento (eventos independentes do
  // resultado principal, como o "match" do Ironsworn, aparecem aqui).
  outcome_flags?: string[];
  // Inputs do profile citados nas outcome_rules — o numero contra o qual o
  // resultado foi medido (CD, perícia, valor testado, limite...). So
  // ESTES, nao todos os inputs: "mod"/"mode" ja aparecem embutidos na
  // notacao/nos dados, e repetir escondia o motivo de existir (mostrar o
  // que nao da pra ver so olhando pro resultado). Ausente = profile sem
  // nenhum input desse tipo, ou nenhum foi preenchido.
  tested?: { label: string; value: number | string }[];
  timestamp: string;
}

// Fonte de RNG injetavel — default deve usar crypto.getRandomValues.
// Nunca Math.random() puro (ver docs/security.md).
export type RandomSource = () => number;
