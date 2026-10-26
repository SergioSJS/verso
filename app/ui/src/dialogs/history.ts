// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A file's version history (ADR 0091 item 5): the versions newest first,
// with when — in this computer's time zone —, who and the size of the
// change; one chosen shows its diff against the current text and against
// the version before it, read as lines that go and come, not by colour
// alone (item 10); "Restaurar esta versão" asks first, writes it as a new
// write over the text the diff was made against (invariant 11) and says
// what it did; "Copiar como nova nota" puts it beside the file. Reached
// from the palette, the note's menus and the status bar, by whoever may
// write the file — a reader has none (item 6).

import { commands, type ContractError, type HistoryListing, type VersionAuthor, type VersionEntry } from "../bindings";
import { may } from "../access";
import { afterFileChange } from "../changes";
import { ask } from "../dialog";
import { diffLines, diffNode } from "../diff";
import { button, h, ui } from "../dom";
import { errorSentence, told } from "../errors";
import { leavesUnder } from "../layout/spaces";
import { copyStamp, hasHistory } from "../historyFiles";
import { name } from "../paths";
import { LOCALE } from "../strings";
import { asDialog, closed, opened } from "./a11y";
import { historyStrings } from "./historyStrings";


/** Whether this window may open a file's history now. */
export function historyFor(path: string | null | undefined): path is string {
  return Boolean(path) && may(path as string, "edit") && hasHistory(path as string);
}

function size(bytes: number): string {
  let n = bytes;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString(LOCALE, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

/** A time as this computer shows it, in its own time zone. */
export function when(ms: number): string {
  return new Date(ms).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });
}


function author(a: VersionAuthor): string {
  const s = historyStrings();
  switch (a.kind) {
    case "computer":
      return s.computer(a.name);
    case "agent":
      return s.agent(a.name);
    case "outside":
      return s.outside;
    default:
      return a.name;
  }
}

/** Who a version names, in words. */
export function who(v: VersionEntry): string {
  const s = historyStrings();
  if (v.authors.length === 0) return v.kind === "found" ? s.found : s.outside;
  return v.authors.map(author).join(", ");
}

/** What `kind` of failure means here, in the window's words. */
function failure(e: ContractError | unknown): string {
  const s = historyStrings();
  const kind = (e as ContractError | null)?.kind ?? "";
  const message = (e as ContractError | null)?.message ?? "";
  if (kind === "changed") return /sync/.test(message) ? s.notSynced : s.changed;
  if (kind === "unavailable" || kind === "unreachable") return s.serverDown;
  if (kind === "refused") return s.notAllowed;
  if (kind === "exists") return s.taken;
  if (kind === "quota") return s.quota;
  return errorSentence(e);
}

/** The file as it is now, and the revision a restore writes over. */
type Now = { text: string; revision: string } | null;

async function readNow(path: string): Promise<Now> {
  const r = /\.md$/i.test(path) ? await commands.readNote(path) : await commands.readText(path);
  return r.status === "ok" ? { text: r.data.text, revision: r.data.revision } : null;
}

/** Changes a diff counts: lines that come, lines that go. */
function counted(before: string, after: string): [number, number] {
  const lines = diffLines(before.split(/\r?\n/), after.split(/\r?\n/));
  return [lines.filter((l) => l.startsWith("+ ")).length, lines.filter((l) => l.startsWith("- ")).length];
}

let open: HTMLElement | null = null;

/** Open the history of `path`. */
export async function openHistory(path: string): Promise<void> {
  const s = historyStrings();
  open?.remove();
  // What is typed and not yet saved is the current text: saved first.
  for (const l of leavesUnder(path)) if (l.path === path) await l.flush();
  const shade = h("div", "quick history-dialog");
  const box = h("div", "history-box");
  const head = h("div", "history-head");
  const title = h("h2", "history-title", s.titleOf(name(path)));
  title.id = "history-title";
  const shut = button("ghost iconic", s.close, "close");
  shut.type = "button";
  shut.setAttribute("aria-label", s.close);
  head.append(title, shut);
  const summary = h("div", "history-summary");
  const said = h("p", "history-said");
  said.setAttribute("role", "status");
  const rows = h("tbody");
  const table = h("table", "web-table history-table");
  const hr = h("tr");
  for (const c of [s.when, s.who, s.change, s.bytes]) {
    const th = h("th", "", c);
    th.scope = "col";
    hr.append(th);
  }
  const thead = h("thead");
  thead.append(hr);
  table.append(h("caption", "sr-only", s.caption), thead, rows);
  const wrap = h("div", "web-table-wrap history-list");
  wrap.append(table);
  const detail = h("section", "history-detail");
  detail.hidden = true;
  const body = h("div", "history-body");
  body.append(wrap, detail);
  box.append(head, summary, body, said);
  shade.append(box);
  document.body.append(shade);
  open = shade;
  const close = () => {
    shade.remove();
    if (open === shade) open = null;
    closed(shade);
  };
  asDialog(shade, s.titleOf(name(path)), close, title.id);
  shut.addEventListener("click", close);
  shade.addEventListener("mousedown", (e) => {
    if (e.target === shade) close();
  });
  opened(shade);
  shut.focus();

  let listing: HistoryListing | null = null;
  let now: Now = null;
  let chosen: VersionEntry | null = null;
  let against: "now" | "before" = "now";
  const texts = new Map<string, string | null>();
  const say = (words: string) => {
    said.textContent = words;
    ui.status.textContent = words;
  };

  const textOf = async (v: VersionEntry): Promise<string | null | undefined> => {
    if (texts.has(v.id)) return texts.get(v.id);
    const r = await commands.historyRead(path, v.id);
    if (r.status !== "ok") {
      say(failure(r.error));
      told(r.error.kind, r.error.message, r.error);
      return undefined;
    }
    texts.set(v.id, r.data.text);
    return r.data.text;
  };

  const load = async (keep: string | null = null) => {
    summary.replaceChildren(h("p", "settings-hint", s.loading));
    const r = await commands.historyList(path);
    if (r.status !== "ok") {
      const again = button("ghost", s.again);
      again.type = "button";
      again.addEventListener("click", () => void load(keep));
      summary.replaceChildren(h("p", "web-warn", `${s.failed} ${failure(r.error)}`), again);
      told(r.error.kind, r.error.message, r.error);
      return;
    }
    listing = r.data;
    now = listing.gone === null ? await readNow(path) : null;
    paintList();
    const pick = listing.versions.find((v) => v.id === keep) ?? null;
    if (pick) void choose(pick);
    else {
      chosen = null;
      detail.hidden = true;
    }
  };

  const paintList = () => {
    const l = listing;
    if (!l) return;
    const lines = [h("p", "history-sentence", `${s.count(l.versions.length)}, ${s.kept(l.days)}.`), h("p", "settings-hint", s.size(size(l.size ?? 0)))];
    if (l.early) lines.push(h("p", "web-warn", s.early));
    if (l.partial) lines.push(h("p", "web-warn history-partial", /out of reach/.test(l.partial) ? s.partialDown : s.partial(l.partial)));
    if (l.gone !== null) lines.push(h("p", "web-warn", s.gone(when(l.gone))));
    if (l.versions.length === 0) lines.push(h("p", "settings-hint", s.none));
    summary.replaceChildren(...lines);
    wrap.hidden = l.versions.length === 0;
    rows.replaceChildren(
      ...l.versions.map((v) => {
        const tr = h("tr");
        tr.dataset["id"] = v.id;
        if (chosen?.id === v.id) tr.setAttribute("aria-current", "true");
        const pick = button("ghost history-pick", when(v.at ?? 0));
        pick.type = "button";
        pick.setAttribute("aria-label", s.pick(when(v.at ?? 0)));
        pick.setAttribute("aria-pressed", String(chosen?.id === v.id));
        pick.addEventListener("click", () => void choose(v));
        const whoCell = h("td", "history-who", who(v));
        if (v.kind === "restore") whoCell.append(h("span", "history-tag", s.restoredTag));
        if (v.kind === "room") whoCell.append(h("span", "history-tag", s.roomTag));
        if (v.here_only) whoCell.append(h("span", "history-tag", s.hereOnly));
        const change = h("td", "num", s.lines(v.added, v.removed));
        change.setAttribute("aria-label", s.linesSaid(v.added, v.removed));
        const first = h("td");
        first.append(pick);
        tr.append(first, whoCell, change, h("td", "num", size(v.size ?? 0)));
        return tr;
      }),
    );
  };

  const choose = async (v: VersionEntry) => {
    chosen = v;
    paintList();
    detail.hidden = false;
    detail.replaceChildren(h("p", "settings-hint", s.loading));
    const text = await textOf(v);
    if (text === undefined || chosen !== v) return;
    const l = listing;
    if (!l) return;
    const at = l.versions.indexOf(v);
    const before = l.versions[at + 1] ?? null;
    const heading = h("h3", "history-detail-title", s.detail(when(v.at ?? 0), who(v)));
    // Compare with: the current text, or the version before.
    const group = h("div", "history-compare");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", s.compare);
    group.append(h("span", "history-compare-label", `${s.compare}:`));
    for (const [value, label] of [["now", s.withNow], ["before", s.withBefore]] as const) {
      const id = `history-against-${value}`;
      const input = h("input");
      input.type = "radio";
      input.name = "history-against";
      input.id = id;
      input.checked = against === value;
      input.addEventListener("change", () => {
        against = value;
        void choose(v);
      });
      const lab = h("label", "", label);
      lab.htmlFor = id;
      group.append(input, lab);
    }
    const shown = h("div", "history-diff");
    if (text === null) shown.append(h("p", "settings-hint", s.binary(size(v.size ?? 0))));
    else if (against === "now") {
      if (now === null) shown.append(h("p", "settings-hint", s.noNow));
      else if (now.text === text) shown.append(h("p", "settings-hint", s.same));
      else {
        const [back, out] = counted(now.text, text);
        shown.append(h("p", "history-diff-said", s.diffNow(back, out)), diffed(now.text, text));
      }
    } else if (before === null) shown.append(h("p", "settings-hint", s.first));
    else {
      const prior = await textOf(before);
      if (prior === undefined || chosen !== v) return;
      const [a, r] = counted(prior ?? "", text);
      shown.append(h("p", "history-diff-said", s.diffBefore(a, r)), diffed(prior ?? "", text));
    }
    const actions = h("div", "history-actions");
    const restore = button("save", s.restore);
    restore.type = "button";
    restore.addEventListener("click", () => void restoreIt(v));
    const copy = button("ghost", s.copy);
    copy.type = "button";
    copy.addEventListener("click", () => void copyIt(v));
    actions.append(restore, copy);
    if (l.can_delete) {
      const del = button("ghost danger", s.remove);
      del.type = "button";
      del.addEventListener("click", () => void removeIt(v));
      actions.append(del);
    }
    detail.replaceChildren(heading, group, shown, actions);
  };

  const diffed = (from: string, to: string): HTMLElement => {
    const pre = diffNode(from, to, true);
    pre.setAttribute("aria-label", s.diffLabel);
    pre.tabIndex = 0;
    return pre;
  };

  const restoreIt = async (v: VersionEntry) => {
    if (!(await ask(s.restoreAsk(when(v.at ?? 0)), { yes: s.restoreYes, no: s.cancel }))) return;
    for (const l of leavesUnder(path)) if (l.path === path) await l.flush();
    // The diff was made against `now`: a file changed since is said, and
    // the diff made again, before anything is written (invariant 11).
    const fresh = listing?.gone === null ? await readNow(path) : null;
    if ((fresh?.revision ?? null) !== (now?.revision ?? null)) {
      say(s.changed);
      await load(v.id);
      return;
    }
    const r = await commands.historyRestore(path, v.id, now?.revision ?? null);
    if (r.status !== "ok") {
      say(failure(r.error));
      told(r.error.kind, r.error.message, r.error);
      if (r.error.kind === "changed") await load(v.id);
      return;
    }
    say(v.id.startsWith("s:") ? s.restoredThere(when(v.at ?? 0)) : s.restored(when(v.at ?? 0)));
    await afterFileChange();
    const words = said.textContent ?? "";
    await load(null);
    said.textContent = words;
  };

  const copyIt = async (v: VersionEntry) => {
    const r = await commands.historyCopy(path, v.id, copyStamp(v.at ?? 0), LOCALE.startsWith("pt") ? "pt" : "en");
    if (r.status !== "ok") {
      say(failure(r.error));
      told(r.error.kind, r.error.message, r.error);
      return;
    }
    say(s.copied(r.data.path));
    await afterFileChange();
  };

  const removeIt = async (v: VersionEntry) => {
    if (!(await ask(s.removeAsk(when(v.at ?? 0)), { yes: s.removeYes, no: s.cancel }))) return;
    const r = await commands.historyDelete(path, v.id);
    if (r.status !== "ok") {
      say(failure(r.error));
      told(r.error.kind, r.error.message, r.error);
      return;
    }
    listing = r.data;
    chosen = null;
    detail.hidden = true;
    paintList();
    say(s.removed(when(v.at ?? 0)));
  };

  await load(null);
}

let bar: HTMLButtonElement | null = null;

/** The status bar's way into the front tab's history (item 5): there
 *  only while the front tab is a file this window may write. */
export function historyButton(path: string | null): void {
  if (!bar) {
    const s = historyStrings();
    bar = button("ghost iconic bar-toggle status-history", s.command, "history");
    bar.setAttribute("aria-label", s.command);
    bar.addEventListener("click", () => {
      const p = bar?.dataset["path"];
      if (p) void openHistory(p);
    });
    ui.words.after(bar);
  }
  bar.hidden = !historyFor(path);
  bar.dataset["path"] = bar.hidden ? "" : (path ?? "");
}
