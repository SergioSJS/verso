// What the update panel shows of a release's notes (ADR 0051, revised
// 2026-10-14). A release's page opens with a guide to downloading —
// tables, links, the changelogs folded — that means nothing inside the
// app; each language's "what's new" is marked for it
// (scripts/release-page.mjs):
//
//   <!-- verso:news:en --> … <!-- verso:news:end -->
//   <!-- verso:news:pt-BR --> … <!-- verso:news:end -->
//
// The panel shows the window's language, else the other, as plain lines:
// a section's name, then "• " and each item's words, no Markdown left. A
// release from before the marks (its body the raw changelog, English, a
// rule, then pt-BR) shows its first twenty lines the same way.

const END = "<!-- verso:news:end -->";
/** The rule between the languages of a release from before the marks. */
const OLD_SPLIT = /\n-{3,}\n+\*\*Português \(Brasil\)\*\*\n/;
const OLD_LINES = 20;

/** The notes of a release, `body`, as the update panel shows them to a
 *  window in `locale` ("pt-BR" or "en"). */
export function updateNews(body: string, locale: string): string {
  const mine = locale.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  for (const lang of [mine, mine === "en" ? "pt-BR" : "en"]) {
    const mark = `<!-- verso:news:${lang} -->`;
    const start = body.indexOf(mark);
    if (start < 0) continue;
    const end = body.indexOf(END, start + mark.length);
    if (end < 0) continue;
    const shown = plainLines(body.slice(start + mark.length, end), Infinity);
    if (shown) return shown;
  }
  const split = OLD_SPLIT.exec(body);
  const part = !split ? body : mine === "pt-BR" ? body.slice(split.index + (split[0] ?? "").length) : body.slice(0, split.index);
  return plainLines(part, OLD_LINES);
}

/** A line's words: links as their text, no bold, italics, code or tags. */
function words(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Markdown as plain lines, at most `max`: headings as their words with a
 *  blank line before them, items as "• " and their bold lead (or their
 *  words), tables, rules, HTML and code blocks left out. */
function plainLines(md: string, max: number): string {
  const out: string[] = [];
  let fence = false;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      fence = !fence;
      continue;
    }
    if (fence || line === "" || line.startsWith("|") || line.startsWith("<") || /^([-*_])\1{2,}$/.test(line)) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    let text: string;
    if (heading) {
      if (out.length > 0) out.push("");
      text = words(heading[1] ?? "");
    } else if (item) {
      const body = item[1] ?? "";
      const lead = /^\*\*(.+?)\*\*/.exec(body);
      text = `• ${words(lead?.[1] ?? body)}`;
    } else {
      text = words(line);
    }
    if (text.replace(/^• /, "") !== "") out.push(text);
  }
  const kept = out.slice(0, max);
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return kept.join("\n");
}
