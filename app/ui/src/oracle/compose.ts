// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What a roll becomes in the note (ADR 0102 item 4): the callout a new
 *  insertion makes, and the lines `planOracleEdit` writes into one that is
 *  there. Pure: the words are handed in. */

import type { Answer, Likelihood, OracleResult, SparkResult } from "./engine";
import type { Generated } from "./locate";
import type { TableRollResult } from "./tables";

export interface ComposeWords {
  answer: Record<Answer, string>;
  likelihood: Record<Likelihood, string>;
  calloutTitle: (q: string) => string;
  sparkLabel: string;
  sparkTitle: string;
  sparkActionTheme: string;
  sparkDescriptorFocus: string;
}

/** One line: a line break would leave the callout. */
export function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** A word that sits inside bold or italics: what would open or close them
 *  is escaped. */
export function inline(s: string): string {
  return oneLine(s).replace(/[\\*_]/g, (c) => `\\${c}`);
}

export interface Composed {
  /** For a callout that is there. */
  gen: Generated | null;
  /** For a new callout; `cursor` is just after the result, before the blank line. */
  callout: { text: string; cursor: number };
}

export function composeOracle(
  words: ComposeWords,
  question: string,
  result: OracleResult | null,
  spark: SparkResult | null,
  tableResult?: TableRollResult | null,
): Composed {
  const q = oneLine(question);
  const done = (lines: string[], gen: Generated | null): Composed => {
    const body = lines.join("\n");
    return { gen, callout: { text: `${body}\n\n`, cursor: body.length } };
  };

  if (tableResult) {
    const line = `**${inline(tableResult.entry)}** _(d${tableResult.total}: ${tableResult.roll})_`;
    return done([`> [!oracle] ${oneLine(tableResult.table.name)}`, `> ${line}`], { kind: "table", line });
  }

  if (result) {
    const line = `**${words.answer[result.answer]}** _(d100: ${result.roll}, ${words.likelihood[result.likelihood]})_`;
    const sparkLine = spark ? `${words.sparkLabel} *${inline(spark.formatted)}*` : undefined;
    const lines = [`> [!oracle] ${words.calloutTitle(q)}`];
    if (sparkLine) lines.push(`> ${sparkLine}`);
    lines.push(`> ${line} `);
    return done(lines, { kind: "answer", question: q, line, ...(sparkLine ? { spark: sparkLine } : {}) });
  }

  if (spark) {
    const a = `**${words.sparkActionTheme}:** ${inline(spark.action)} + ${inline(spark.theme)}`;
    const b = `**${words.sparkDescriptorFocus}:** ${inline(spark.descriptor)} + ${inline(spark.focus)}`;
    return done([`> [!oracle] ${words.sparkTitle}`, `> ${a}`, `> ${b}`], { kind: "spark", lines: [a, b] });
  }

  return done([`> [!oracle] ${words.calloutTitle(q)}`], null);
}
