// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type Completion, type CompletionContext, type CompletionResult, startCompletion } from "@codemirror/autocomplete";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorView } from "codemirror";
import { insertTemplate } from "../daily";
import { score } from "../dialogs/quick";
import { allEntries, allFiles, allNotes } from "../folder";
import { allEmojis } from "../labels";
import { layout } from "../layout/spaces";
import { frontmatterEnd } from "../live";
import { mentionDismissed } from "./mentionDismiss";
import { MENTION_BEFORE, WIKILINK_BEFORE } from "./wikilinkBefore";
import { mentionWritten } from "../mentionLink";
import { proseBefore } from "./linkNames";
import { proseAt } from "./linkSuggest";
import { opening } from "../opening";
import { dirOf, Kind, kindOf, name } from "../paths";
import { linkText, resolveNoteByName } from "../resolve";
import { settings } from "../settings";
import { type SlashSection } from "../slash";
import { ss as secretStrings } from "../secret/strings";
import { hasCapability } from "../capabilities";
import { askOracleInActiveNote } from "../oracle/active";
import { os as oracleText } from "../oracle/strings";
import { LOCALE, t } from "../strings";
import { template as tableTemplate } from "../table";
import { focusTableCell } from "../tableEditor";

/** An inline roll with its notation ready to be typed over (the slash menu's "Dice roll"). */
export const DICE_SNIPPET = "`dice: 1d20`";
/** The slash item's block: `d20-creature` is the default built-in layout's id
 *  (`DEFAULT_LAYOUT_ID`), so the card finds its template. */
const STATBLOCK_SNIPPET = "```statblock\nname: \nlayout: d20-creature\nhp: 10\nac: 10\n```\n";

export const headingsCache = new Map<string, { level: number; text: string }[]>();
export async function completeWikilinks(ctx: CompletionContext): Promise<CompletionResult | null> {
  const before = ctx.matchBefore(WIKILINK_BEFORE);
  if (!before) return null;
  const embed = before.text.startsWith("!");
  const inner = before.text.slice(embed ? 3 : 2);
  const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
  const closing = after === "]]" ? "" : "]]";
  const hash = inner.indexOf("#");
  if (hash >= 0) {
    // Headings of the note named before the `#`.
    const noteName = inner.slice(0, hash);
    const typed = inner.slice(hash + 1).toLowerCase();
    const leaf = layout().activeLeaf;
    const path = noteName === "" ? leaf?.path ?? "" : resolveNoteByName(noteName, leaf?.path ?? "") ?? "";
    if (!path) return null;
    let heads = headingsCache.get(path);
    if (!heads) {
      const r = await opening.readNote(path);
      heads = r.status === "ok" ? r.data.headings.map((hd) => ({ level: hd.level, text: hd.text })) : [];
      headingsCache.set(path, heads);
      setTimeout(() => headingsCache.delete(path), 5000);
    }
    const options: Completion[] = heads
      .filter((hd) => typed === "" || hd.text.toLowerCase().includes(typed))
      .map((hd) => ({ label: hd.text, detail: "#".repeat(hd.level), type: "heading", apply: `${noteName}#${hd.text}${closing}` }));
    return { from: before.from + (embed ? 3 : 2), options, validFor: /^[^\]\n]*$/ };
  }
  const typed = inner.toLowerCase();
  const notes = allNotes.map((p) => ({ path: p, label: name(p), kind: "note" as Kind }));
  const files = allFiles.map((p) => ({ path: p, label: p.split("/").pop() ?? p, kind: kindOf(p) }));
  const pool = embed ? [...files, ...notes] : [...notes, ...files];
  const options: Completion[] = pool
    .map((o) => ({ o, s: score(o.label, o.path, typed) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(a.o.kind !== "note") - Number(b.o.kind !== "note") || a.o.label.localeCompare(b.o.label, LOCALE))
    .slice(0, 60)
    .map(({ o }) => {
      const target = linkText(layout().activeLeaf?.path ?? "", o.path);
      return { label: o.label, detail: dirOf(o.path) || "/", type: o.kind === "note" ? "note" : o.kind === "image" ? "image" : "file", apply: target + closing, boost: o.kind === "note" ? 1 : 0 };
    });
  return { from: before.from + (embed ? 3 : 2), options, filter: false };
}

/** `@` at the start of a word (ADR 0089 item 5, 2026-10-20): the notes the
 *  `[[` list offers, with their aliases, ranked as it ranks them; choosing
 *  one writes `[[Name]]` over the `@` and what was typed (`[[Name|typed]]`
 *  when the whole name was typed another way, as the unlinked mentions
 *  write it). Esc leaves the text. */
export function completeMention(ctx: CompletionContext): CompletionResult | null {
  if (!settings.mentionAt) return null;
  const before = ctx.matchBefore(MENTION_BEFORE);
  if (!before) return null;
  const at = before.from + before.text.indexOf("@");
  if (mentionDismissed(ctx.state, at)) return null;
  const typed = ctx.state.sliceDoc(at + 1, ctx.pos);
  if (typed.startsWith(" ")) return null;
  const line = ctx.state.doc.lineAt(at);
  if (!proseBefore(line.text.slice(0, at - line.from), at - line.from) || !proseAt(ctx.state, at, ctx.pos)) return null;
  const table = /^\s*\|/.test(line.text);
  const here = layout().activeLeaf?.path ?? "";
  const q = typed.toLowerCase();
  type Cand = { path: string; text: string; alias: boolean; s: number };
  const found: Cand[] = [];
  for (const path of allNotes) {
    const nm = name(path);
    let best: Cand | null = null;
    for (const [text, alias] of [[nm, false], ...(allEntries.get(path)?.label?.aliases ?? []).map((a): [string, boolean] => [a, true])] as [string, boolean][]) {
      const s = score(text, path, q);
      if (s > 0 && (!best || s > best.s)) best = { path, text, alias, s };
    }
    if (best) found.push(best);
  }
  const options: Completion[] = found
    .sort((a, b) => b.s - a.s || a.text.localeCompare(b.text, LOCALE))
    .slice(0, 60)
    .map((c) => {
      const target = linkText(here, c.path);
      return {
        label: c.alias ? `${c.text} → ${name(c.path)}` : c.text,
        detail: dirOf(c.path) || "/",
        type: "note",
        apply: (view: EditorView, _c: Completion, from: number, to: number) => {
          const link = mentionWritten(typed, c.text, c.alias, target, table);
          view.dispatch({ changes: { from, to, insert: link }, selection: { anchor: from + link.length }, userEvent: "input.complete", scrollIntoView: true });
        },
      };
    });
  if (options.length === 0) return null;
  return { from: at, options, filter: false };
}

export function completeEmoji(ctx: CompletionContext): CompletionResult | null {
  if (!settings.emojiTrigger) return null;
  const fm = frontmatterEnd(ctx.state.doc);
  if (fm >= 0 && ctx.pos <= fm) return null;
  const tree = ensureSyntaxTree(ctx.state, ctx.pos, 50) ?? syntaxTree(ctx.state);
  for (let n: import("@lezer/common").SyntaxNode | null = tree.resolveInner(ctx.pos - 1, 1); n; n = n.parent) {
    if (/^(FencedCode|CodeBlock|InlineCode|CodeText|HTMLBlock|CommentBlock)$/.test(n.name)) return null;
  }
  const before = ctx.matchBefore(/(?:^|\s):([a-zA-Z0-9_\u00C0-\u024F-]*)$/);
  if (!before) return null;
  const colonIndex = before.text.lastIndexOf(":");
  const typed = before.text.slice(colonIndex + 1).toLowerCase();
  const lang = LOCALE.startsWith("pt") ? "pt" : "en";
  let matches = allEmojis;
  if (typed.length > 0) {
    matches = allEmojis.filter((e) =>
      e.kw.includes(typed) ||
      e.pt.toLowerCase().includes(typed) ||
      e.en.toLowerCase().includes(typed)
    );
  }
  const options: Completion[] = matches.slice(0, 50).map((e) => ({
    label: `${e.c}  ${lang === "pt" ? e.pt : e.en}`,
    detail: lang === "pt" ? e.en : e.pt,
    apply: e.c,
    type: "emoji",
  }));
  return {
    from: before.from + colonIndex,
    options,
    filter: false,
  };
}

export async function completeMarkdown(ctx: CompletionContext): Promise<CompletionResult | null> {
  const wiki = await completeWikilinks(ctx);
  if (wiki) return wiki;
  return completeMention(ctx) ?? completeEmoji(ctx);
}

/** The table just written above the caret: its first header cell takes
 *  the keys (Edit mode draws it as a table, ADR 0064). */
export function focusTableOver(v: EditorView): void {
  const doc = v.state.doc;
  let line = doc.lineAt(v.state.selection.main.head);
  if (!/^\s*\|/.test(line.text) && line.number > 1) line = doc.line(line.number - 1);
  while (line.number > 1 && /^\s*\|/.test(doc.line(line.number - 1).text)) line = doc.line(line.number - 1);
  if (/^\s*\|/.test(line.text)) focusTableCell(v, line.from, -1, 0);
}

/** What the `/` menu offers, in sections, with a line of explanation each. */
export function slashSections(): SlashSection[] {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const time = `${pad(today.getHours())}:${pad(today.getMinutes())}`;
  const s = t.slash;
  return [
    { title: s.basic, items: [
      { icon: "heading", title: `${t.headingN} 1`, description: s.h1, keywords: "# h1 titulo title", insert: "# " },
      { icon: "heading", title: `${t.headingN} 2`, description: s.h2, keywords: "## h2", insert: "## " },
      { icon: "heading", title: `${t.headingN} 3`, description: s.h3, keywords: "### h3", insert: "### " },
      { icon: "quote", title: t.quote, description: s.quote, keywords: "> citação blockquote", insert: "> " },
      { icon: "code", title: t.codeBlock, description: s.code, keywords: "``` code", insert: "```\n\n```", cursor: 4 },
      { icon: "rule", title: t.divider, description: s.divider, keywords: "--- hr", insert: "---\n" },
    ] },
    { title: s.lists, items: [
      { icon: "task", title: t.task, description: s.task, keywords: "- [ ] todo checkbox tarefa", insert: "- [ ] " },
      { icon: "bullets", title: t.bullets, description: s.bullets, keywords: "- lista bullet", insert: "- " },
      { icon: "numbers", title: t.numbers, description: s.numbers, keywords: "1. ordered", insert: "1. " },
    ] },
    { title: s.callouts, items: [
      { icon: "quote", title: t.calloutNoteTitle, description: s.calloutNote, keywords: "[!note] note nota aviso", insert: "> [!note] " },
      { icon: "quote", title: t.calloutTipTitle, description: s.calloutTip, keywords: "[!tip] tip dica", insert: "> [!tip] " },
      { icon: "warn", title: t.calloutWarningTitle, description: s.calloutWarning, keywords: "[!warning] warning atenção", insert: "> [!warning] " },
      { icon: "quote", title: s.toggleTitle, description: s.toggle, keywords: "toggle recolher dobrar fold [!note]-", insert: "> [!note]- " },
      // What it does not protect, said where it is made (ADR 0087 item 7).
      { icon: "lock", title: secretStrings.slashTitle, description: secretStrings.slashDesc, keywords: "[!secret] secret segredo mestre gm", insert: "> [!secret] " },
      ...(hasCapability("oracles") ? [{ icon: "quote", title: oracleText.slashOracle, description: oracleText.slashOracleDesc, keywords: "[!oracle] oracle oraculo solo improviso", insert: "> [!oracle] " }] : []),
    ] },
    { title: s.insert, items: [
      { icon: "table", title: t.table, description: s.table, keywords: "| tabela table", insert: () => tableTemplate(3, 2), run: (v) => focusTableOver(v) },
      { icon: "wikilink", title: t.wikilink, description: s.wikilink, keywords: "[[ link nota", insert: "[[", run: (v) => startCompletion(v) },
      { icon: "note", title: t.embedNote, description: s.embed, keywords: "![[ embed transclusão", insert: "![[", run: (v) => startCompletion(v) },
      { icon: "image", title: t.image, description: s.image, keywords: "![[ imagem png jpg", insert: "![[", run: (v) => startCompletion(v) },
      { icon: "link", title: t.link, description: s.link, keywords: "[]() url http", insert: "[](url)", cursor: 1 },
      { icon: "calendar", title: t.today, description: date, keywords: "data date hoje", insert: date },
      { icon: "calendar", title: t.now, description: time, keywords: "hora time agora", insert: time },
      { icon: "template", title: t.insertTemplate, description: s.template, keywords: "template modelo", insert: "", run: () => insertTemplate() },
      ...(hasCapability("diceRolling") ? [{ icon: "dice", title: oracleText.slashDice, description: oracleText.slashDiceDesc, keywords: "dice dado roll rolar d20 `dice:`", insert: DICE_SNIPPET, select: [DICE_SNIPPET.indexOf("1d20"), DICE_SNIPPET.length - 1] as [number, number] }] : []),
      ...(hasCapability("oracles") ? [{ icon: "sparkles", title: oracleText.slashAsk, description: oracleText.slashAskDesc, keywords: "oracle oraculo spark solo rpg dados", insert: "", run: () => askOracleInActiveNote() }] : []),
      ...(hasCapability("statblocks") ? [{ icon: "note", title: oracleText.slashStatblock, description: oracleText.slashStatblockDesc, keywords: "statblock ficha monstro npc atributos", insert: STATBLOCK_SNIPPET, cursor: STATBLOCK_SNIPPET.indexOf("name: ") + "name: ".length }] : []),
      { icon: "tag", title: t.addProperty, description: oracleText.slashAddPropertyDesc, keywords: "propriedade property frontmatter meta tag", insert: "", run: () => {
        const leaf = layout().activeLeaf;
        const note = leaf as { addProperty?: () => void; readOnly?: boolean } | null;
        if (note?.addProperty && !note.readOnly) note.addProperty();
      } },
    ] },
  ];
}
