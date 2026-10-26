// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The roll block (ADR 0107, "As built" 2026-10-22; docs/spec/dialect.md): a
// roll of the Table kept in a note as a fenced block whose info string is
// `roll`. Plain text anywhere (Obsidian shows a code block); Verso draws it
// as a fixed card and never rolls it again. Pure: no DOM, no IO.
//
// Grammar (one line each, in this order when written; read in any order):
//
//   block      = header? ( rollLine tableLines? | oracleLines ) diceLine? other*
//   header     = pair ( " · " pair )*          pair = key ": " value
//                key  = quem | who | quando | when | onde | where
//                onde = "[[" note "]]"
//   rollLine   = notation " → " breakdown " = " total      ("->" is read too)
//   breakdown  = [ "-" ] group ( (" + " | " - ") group )* [ (" + " | " - ") n ]
//   group      = "[" face ( ", " face )* "]"   a face: 16, ~3 (dropped), + - 0 (Fudge)
//   tableLines = "tabela: " source / "linha: " text           (en: table / row)
//   oracleLines= "oráculo: " (pergunta|faísca|tabela) / "tabela: " name
//                / "resposta: " text / "rolagem: " n           (en: oracle: question|spark|table,
//                                                                   answer, draw)
//   diceLine   = "dados: " body " " number " " outline          (en: dice) three #rrggbb colours
//
// The keys are written in the language of the window and read in either.
// A line that is none of these is kept (`extra`) and written back last. A
// block with no roll line and no oracle line is not a roll block: `null`,
// and the note shows it as the plain code it is.

import type { DiceTermRoll } from "../bindings";

export type RollLang = "pt" | "en";
export type RollKind = "dice" | "table" | "oracle";
export type OracleKind = "question" | "spark" | "table";
export type RollTerm = Pick<DiceTermRoll, "sign" | "fudge" | "kept" | "dropped">;
export type RollColours = { body: string; number: string; outline: string };

export type RollBlock = {
  who: string;
  /** Local time as written, `2026-10-22 21:40`. */
  when: string;
  /** The link text of the note it was rolled in (inside `[[ ]]`), or "". */
  where: string;
  kind: RollKind;
  notation: string;
  terms: RollTerm[];
  modifier: number;
  /** The total; the oracle's d100 face or place (null for a spark). */
  total: number | null;
  /** A random table roll's source, as the log has it (`[[Note#^id]]`). */
  source: string;
  /** A table row, or the oracle's answer. */
  row: string;
  oracle: OracleKind | null;
  /** An oracle table's name. */
  oracleTable: string;
  dice: RollColours | null;
  /** Lines the grammar does not know, kept as they were. */
  extra: string[];
};

const KEYS: Record<string, string> = {
  quem: "who", who: "who", quando: "when", when: "when", onde: "where", where: "where",
  tabela: "table", table: "table", linha: "row", row: "row",
  oráculo: "oracle", oraculo: "oracle", oracle: "oracle",
  resposta: "answer", answer: "answer", rolagem: "draw", draw: "draw",
  dados: "dice", dice: "dice",
};
const WORDS: Record<RollLang, Record<string, string>> = {
  pt: { who: "quem", when: "quando", where: "onde", table: "tabela", row: "linha", oracle: "oráculo", answer: "resposta", draw: "rolagem", dice: "dados" },
  en: { who: "who", when: "when", where: "where", table: "table", row: "row", oracle: "oracle", answer: "answer", draw: "draw", dice: "dice" },
};
const ORACLE_WORDS: Record<RollLang, Record<OracleKind, string>> = {
  pt: { question: "pergunta", spark: "faísca", table: "tabela" },
  en: { question: "question", spark: "spark", table: "table" },
};
const ORACLE_READ: Record<string, OracleKind> = { pergunta: "question", question: "question", faísca: "spark", faisca: "spark", spark: "spark", tabela: "table", table: "table" };

const HEX = /^#[0-9a-f]{6}$/i;

/** Whether a fence's info string names a roll block: `roll`, any case. */
export function isRollFence(info: string): boolean {
  return (info.trim().split(/\s/, 1)[0]?.toLowerCase() ?? "") === "roll";
}

/** Whether a rendered fence's `<code>` is a roll block. */
export function isRollCode(code: Element): boolean {
  for (const c of Array.from(code.classList)) if (c.startsWith("language-") && isRollFence(c.slice("language-".length))) return true;
  return false;
}

/** A block with nothing in it yet. */
export function emptyBlock(): RollBlock {
  return { who: "", when: "", where: "", kind: "dice", notation: "", terms: [], modifier: 0, total: null, source: "", row: "", oracle: null, oracleTable: "", dice: null, extra: [] };
}

/** `a · b · c` split at the separators outside `[[ ]]`. */
function segments(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < line.length; i++) {
    if (line.startsWith("[[", i)) depth++;
    else if (line.startsWith("]]", i) && depth > 0) depth--;
    else if (depth === 0 && line.startsWith(" · ", i)) {
      out.push(line.slice(from, i));
      from = i + 3;
    }
  }
  out.push(line.slice(from));
  return out;
}

/** `key: value` with a key of the grammar; null when the line is not one. */
function pairOf(text: string): { key: string; value: string } | null {
  const m = /^([A-Za-zÀ-ÿ]+):[ \t]*(.*)$/.exec(text.trim());
  const key = m ? KEYS[m[1]!.toLowerCase()] : undefined;
  return m && key ? { key, value: m[2]!.trim() } : null;
}

/** `[16] + 5` read into its groups and its modifier; null when it does not read. */
function readBreakdown(text: string): { terms: RollTerm[]; modifier: number } | null {
  const tokens = text.match(/\[[^\]]*\]|[+-]|\d+|\S/g) ?? [];
  const terms: RollTerm[] = [];
  let modifier = 0;
  let sign: 1 | -1 = 1;
  let afterSign = false;
  for (const tok of tokens) {
    if (tok === "+" || tok === "-") {
      sign = tok === "-" ? -1 : 1;
      afterSign = true;
    } else if (tok.startsWith("[")) {
      const kept: number[] = [];
      const dropped: number[] = [];
      let fudge = false;
      for (const raw of tok.slice(1, -1).split(",")) {
        let f = raw.trim();
        const drop = f.startsWith("~");
        if (drop) f = f.slice(1).trim();
        let v: number;
        if (f === "+" || f === "-" || f === "0") {
          fudge = true;
          v = f === "+" ? 1 : f === "-" ? -1 : 0;
        } else if (/^\d{1,9}$/.test(f)) v = Number(f);
        else return null;
        (drop ? dropped : kept).push(v);
      }
      if (kept.length + dropped.length === 0) return null;
      terms.push({ sign, fudge, kept, dropped });
      sign = 1;
      afterSign = false;
    } else if (/^\d+$/.test(tok) && Number(tok) <= 1e9) {
      modifier += sign * Number(tok);
      sign = 1;
      afterSign = false;
    } else return null;
  }
  return afterSign || terms.length === 0 ? null : { terms, modifier };
}

/** The text between a roll block's fences, read; null when it is not a roll block. */
export function parseRoll(text: string): RollBlock | null {
  const b = emptyBlock();
  let sawRoll = false;
  let sawOracle = false;
  let answer = "";
  let draw: number | null = null;
  for (const line of text.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const parts = segments(trimmed).map(pairOf);
    if (parts.every((p) => p && (p.key === "who" || p.key === "when" || p.key === "where"))) {
      for (const p of parts) {
        if (!p) continue;
        if (p.key === "who") b.who = p.value;
        else if (p.key === "when") b.when = p.value;
        else b.where = p.value.replace(/^\[\[(.*)\]\]$/, "$1");
      }
      continue;
    }
    const pair = pairOf(trimmed);
    if (pair) {
      if (pair.key === "table") {
        b.source = pair.value;
        b.oracleTable = pair.value;
      } else if (pair.key === "row") b.row = pair.value;
      else if (pair.key === "oracle") {
        const o = ORACLE_READ[pair.value.toLowerCase()];
        if (o) {
          b.oracle = o;
          sawOracle = true;
        } else b.extra.push(trimmed);
      } else if (pair.key === "answer") answer = pair.value;
      else if (pair.key === "draw") draw = /^\d{1,9}$/.test(pair.value) ? Number(pair.value) : null;
      else if (pair.key === "dice") {
        const c = pair.value.split(/\s+/);
        b.dice = c.length === 3 && c.every((x) => HEX.test(x)) ? { body: c[0]!.toLowerCase(), number: c[1]!.toLowerCase(), outline: c[2]!.toLowerCase() } : null;
        if (!b.dice) b.extra.push(trimmed);
      } else b.extra.push(trimmed);
      continue;
    }
    const m = /^(.+?)\s*(?:→|->)\s*(.+?)\s*=\s*(-?\d{1,9})$/.exec(trimmed);
    const br = m ? readBreakdown(m[2]!) : null;
    if (m && br && !sawRoll) {
      sawRoll = true;
      b.notation = m[1]!.trim();
      b.terms = br.terms;
      b.modifier = br.modifier;
      b.total = Number(m[3]);
      continue;
    }
    b.extra.push(trimmed);
  }
  if (sawOracle) {
    b.kind = "oracle";
    b.row = answer || b.row;
    b.total = draw;
    b.source = "";
    b.terms = [];
    b.modifier = 0;
    b.notation = "";
    if (b.oracle !== "table") b.oracleTable = "";
  } else if (sawRoll) {
    b.kind = b.source !== "" || b.row !== "" ? "table" : "dice";
    b.oracleTable = "";
    if (answer !== "") b.extra.push(`answer: ${answer}`);
  } else return null;
  return b;
}

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, " ").trim();

/** The groups and the modifier of a roll, as the roll line writes them. */
export function breakdownOf(terms: readonly RollTerm[], modifier: number): string {
  const face = (v: number, fudge: boolean): string => (fudge ? (v < 0 ? "-" : v > 0 ? "+" : "0") : String(v));
  let out = "";
  terms.forEach((t, i) => {
    const faces = [...t.kept.map((v) => face(v, t.fudge)), ...t.dropped.map((v) => `~${face(v, t.fudge)}`)].join(", ");
    out += i === 0 ? (t.sign < 0 ? "-" : "") : t.sign < 0 ? " - " : " + ";
    out += `[${faces}]`;
  });
  if (modifier !== 0) out += `${modifier < 0 ? " - " : " + "}${Math.abs(modifier)}`;
  return out;
}

/** The lines between the fences, in the language of the window. */
export function writeRoll(b: RollBlock, lang: RollLang): string {
  const w = WORDS[lang];
  const lines: string[] = [];
  const head = [b.who && `${w["who"]}: ${oneLine(b.who)}`, b.when && `${w["when"]}: ${oneLine(b.when)}`, b.where && `${w["where"]}: [[${oneLine(b.where)}]]`].filter(Boolean);
  if (head.length > 0) lines.push(head.join(" · "));
  if (b.kind === "oracle") {
    lines.push(`${w["oracle"]}: ${ORACLE_WORDS[lang][b.oracle ?? "question"]}`);
    if (b.oracle === "table" && b.oracleTable) lines.push(`${w["table"]}: ${oneLine(b.oracleTable)}`);
    if (b.row) lines.push(`${w["answer"]}: ${oneLine(b.row)}`);
    if (b.total !== null) lines.push(`${w["draw"]}: ${b.total}`);
  } else {
    lines.push(`${oneLine(b.notation)} → ${breakdownOf(b.terms, b.modifier)} = ${b.total ?? 0}`);
    if (b.kind === "table") {
      if (b.source) lines.push(`${w["table"]}: ${oneLine(b.source)}`);
      if (b.row) lines.push(`${w["row"]}: ${oneLine(b.row)}`);
    }
  }
  if (b.dice) lines.push(`${w["dice"]}: ${b.dice.body} ${b.dice.number} ${b.dice.outline}`);
  lines.push(...b.extra);
  return lines.join("\n");
}

/** The block as it stands in a note: fenced, the fence longer than any run of backticks inside. */
export function fenced(inner: string): string {
  let longest = 0;
  for (const run of inner.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}roll\n${inner}\n${fence}`;
}

/** What a screen reader and a note's plain reading say of a roll. */
export function sentence(b: RollBlock, words: { oracle: Record<OracleKind, string> }): string {
  const who = b.who ? `${b.who}: ` : "";
  if (b.kind === "oracle") return `${who}${words.oracle[b.oracle ?? "question"]}${b.oracleTable ? ` ${b.oracleTable}` : ""}: ${b.row}${b.total !== null ? ` (${b.total})` : ""}`;
  const how = breakdownOf(b.terms, b.modifier);
  const row = b.kind === "table" && b.row ? ` ${b.row}` : "";
  return `${who}${b.notation} = ${b.total ?? 0}${row} (${how})`;
}
