// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folder's trash (ADR 0080): what was deleted — or replaced by a
// device's write — when, by whom, and when it goes for good; searchable,
// newest first; each entry restored to where it was, or beside it when
// that place is taken, and, by whoever may, deleted now; the trash
// emptied, asked first in the page with the count and the size. A section
// of the settings, so the same page on the computer, in a browser and on
// a phone (ADR 0076), reached from the folder's settings, the file tree's
// menu and the command palette (item 4). Not counted in the folder's
// space, and said so (item 8).

import { commands, type TrashEntry, type TrashListing } from "../bindings";
import { afterFileChange } from "../changes";
import { button, h, ui } from "../dom";
import { errorSentence } from "../errors";

const pt = {
  section: "Lixeira",
  open: "Abrir a lixeira",
  lead: "O que foi apagado nesta pasta fica na lixeira dela (.trash) até expirar. Daqui volta para onde estava.",
  summary: (n: number, size: string) => (n === 0 ? "A lixeira está vazia." : `${n} ${n === 1 ? "item" : "itens"} na lixeira, ${size}.`),
  kept: (days: number) => (days === 0 ? "Os arquivos apagados ficam para sempre." : `Os arquivos apagados ficam ${days} ${days === 1 ? "dia" : "dias"} e depois somem de vez.`),
  notCounted: "A lixeira não conta no espaço da pasta.",
  early: (quota: string) => `A lixeira sozinha passou da cota da pasta (${quota}): os itens mais antigos expiram antes do prazo.`,
  keepFor: "Manter arquivos apagados por",
  keepForDesc: "Quanto tempo um arquivo apagado fica na lixeira desta pasta.",
  keepForServer: (most: number) => `Você pode encurtar este prazo; até ${most} ${most === 1 ? "dia" : "dias"}, o máximo que a administração do servidor definiu.`,
  forever: "Para sempre",
  days: (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`,
  search: "Buscar na lixeira",
  caption: "Itens da lixeira, os mais recentes primeiro",
  name: "Nome",
  where: "Onde estava",
  size: "Tamanho",
  deleted: "Apagado",
  expires: "Expira",
  actions: "Ações",
  root: "na raiz",
  folder: "pasta",
  by: (who: string) => `por ${who}`,
  bySync: (server: string) => `pela sincronização com ${server}`,
  replacedBy: (who: string) => `substituído por ${who}`,
  unknownDate: (d: string) => `antes de ${d} (data desconhecida)`,
  never: "nunca",
  restore: "Restaurar",
  restoreName: (n: string) => `Restaurar ${n}`,
  deleteNow: "Apagar agora",
  deleteNowName: (n: string) => `Apagar ${n} agora`,
  deleteAsk: (n: string, size: string) => `Apagar ${n} de vez (${size})? Não dá para desfazer.`,
  empty: "Esvaziar a lixeira",
  emptyAsk: (n: number, size: string) => `Apagar de vez ${n} ${n === 1 ? "item" : "itens"} (${size})? Não dá para desfazer.`,
  yes: "Apagar de vez",
  no: "Cancelar",
  restored: (path: string) => `Restaurado em ${path}.`,
  restoredBeside: (original: string, path: string) => `${original} já existia: restaurado ao lado, como ${path}.`,
  gone: (n: number) => (n === 1 ? "1 item apagado de vez." : `${n} itens apagados de vez.`),
  none: "Nada na lixeira com essas palavras.",
  failed: "Não foi possível ler a lixeira.",
};

const en: typeof pt = {
  section: "Trash",
  open: "Open the trash",
  lead: "What is deleted in this folder stays in its trash (.trash) until it expires. From here it goes back where it was.",
  summary: (n, size) => (n === 0 ? "The trash is empty." : `${n} ${n === 1 ? "item" : "items"} in the trash, ${size}.`),
  kept: (days) => (days === 0 ? "Deleted files are kept forever." : `Deleted files are kept for ${days} ${days === 1 ? "day" : "days"}, then gone for good.`),
  notCounted: "The trash is not counted in the folder's space.",
  early: (quota) => `The trash alone is larger than the folder's quota (${quota}): its oldest items expire early.`,
  keepFor: "Keep deleted files for",
  keepForDesc: "How long a deleted file stays in this folder's trash.",
  keepForServer: (most) => `You may shorten this time; up to ${most} ${most === 1 ? "day" : "days"}, the most the server's admin set.`,
  forever: "Forever",
  days: (n) => `${n} ${n === 1 ? "day" : "days"}`,
  search: "Search the trash",
  caption: "Items in the trash, newest first",
  name: "Name",
  where: "Where it was",
  size: "Size",
  deleted: "Deleted",
  expires: "Expires",
  actions: "Actions",
  root: "at the root",
  folder: "folder",
  by: (who) => `by ${who}`,
  bySync: (server) => `by sync with ${server}`,
  replacedBy: (who) => `replaced by ${who}`,
  unknownDate: (d) => `before ${d} (date unknown)`,
  never: "never",
  restore: "Restore",
  restoreName: (n) => `Restore ${n}`,
  deleteNow: "Delete now",
  deleteNowName: (n) => `Delete ${n} now`,
  deleteAsk: (n, size) => `Delete ${n} for good (${size})? This cannot be undone.`,
  empty: "Empty the trash",
  emptyAsk: (n, size) => `Delete ${n} ${n === 1 ? "item" : "items"} for good (${size})? This cannot be undone.`,
  yes: "Delete for good",
  no: "Cancel",
  restored: (path) => `Restored to ${path}.`,
  restoredBeside: (original, path) => `${original} was taken: restored beside it, as ${path}.`,
  gone: (n) => (n === 1 ? "1 item deleted for good." : `${n} items deleted for good.`),
  none: "Nothing in the trash with these words.",
  failed: "The trash could not be read.",
};

export function trashStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

const pt_ = (): boolean => document.documentElement.lang.startsWith("pt");

function size(bytes: number | null): string {
  let n = bytes ?? 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString(pt_() ? "pt-BR" : "en", { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

function day(seconds: number | null): string {
  return new Date((seconds ?? 0) * 1000).toLocaleDateString(pt_() ? "pt-BR" : "en", { dateStyle: "medium" });
}

/** Today in the person's own calendar, as a restored name says it. */
function today(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The entry's name, and the folder it was in. */
function parts(e: TrashEntry): { name: string; dir: string } {
  const at = e.original.lastIndexOf("/");
  return at < 0 ? { name: e.original, dir: "" } : { name: e.original.slice(at + 1), dir: e.original.slice(0, at) };
}

/** When and by whom, in words. */
function deletedWords(e: TrashEntry): string {
  const s = trashStrings();
  const when = e.known ? day(e.deleted) : s.unknownDate(day(e.deleted));
  const who = e.replaced ? s.replacedBy(e.by ?? "?") : e.sync && e.by ? s.bySync(e.by) : e.by ? s.by(e.by) : "";
  return who ? `${when} · ${who}` : when;
}

/** The trash's line for the folder's settings: its size and count beside
 *  the folder's space, the retention in words, and the way in. */
export function trashSummary(open: () => void): HTMLElement {
  const s = trashStrings();
  const box = h("div", "trash-summary");
  const line = h("span", "setting-value", "…");
  const go = button("ghost", s.open);
  go.type = "button";
  go.addEventListener("click", open);
  box.append(line, go);
  void commands.trashList().then((r) => {
    if (r.status !== "ok") return void (line.textContent = "?");
    line.textContent = `${s.summary(r.data.entries.length, size(r.data.size))} ${s.kept(r.data.days)}`;
  });
  return box;
}

type Item = (title: string, desc: string, control: HTMLElement | null) => HTMLElement;

/** The trash's page. */
export function trashBody(item: Item): HTMLElement {
  const s = trashStrings();
  const box = h("div", "trash");
  const said = h("p", "trash-said");
  said.setAttribute("role", "status");
  let listing: TrashListing | null = null;
  const search = h("input", "settings-search trash-search");
  search.type = "search";
  search.placeholder = s.search;
  search.setAttribute("aria-label", s.search);
  search.addEventListener("keydown", (e) => e.stopPropagation());
  search.addEventListener("input", () => paint());
  const head = h("div", "trash-head");
  const days = h("div");
  const ask = h("div", "trash-ask");
  ask.hidden = true;
  const rows = h("tbody");
  const table = h("table", "web-table trash-table");
  const caption = h("caption", "sr-only", s.caption);
  const hr = h("tr");
  for (const c of [s.name, s.where, s.size, s.deleted, s.expires, s.actions]) {
    const th = h("th", "", c);
    th.scope = "col";
    hr.append(th);
  }
  const thead = h("thead");
  thead.append(hr);
  table.append(caption, thead, rows);
  const wrap = h("div", "web-table-wrap");
  wrap.append(table);
  const nothing = h("p", "settings-hint");
  const tools = h("div", "trash-tools");
  box.append(head, days, ask, tools, wrap, nothing, said);

  /** An irreversible step asked in the page, never in a dialog. */
  const confirmIn = (words: string, yes: () => void, back: HTMLElement | null) => {
    ask.replaceChildren();
    const p = h("p", "", words);
    const ok = button("btn danger", s.yes);
    ok.type = "button";
    const no = button("btn", s.no);
    no.type = "button";
    const close = () => {
      ask.hidden = true;
      ask.replaceChildren();
      back?.focus();
    };
    ok.addEventListener("click", () => {
      close();
      yes();
    });
    no.addEventListener("click", close);
    ask.append(p, ok, no);
    ask.hidden = false;
    no.focus();
  };

  const took = (r: Awaited<ReturnType<typeof commands.trashList>>, words?: string) => {
    if (r.status !== "ok") {
      said.textContent = errorSentence(r.error);
      return;
    }
    listing = r.data;
    if (words) said.textContent = words;
    paint();
  };

  const restore = async (e: TrashEntry) => {
    const r = await commands.trashRestore(e.path, today(), pt_() ? "pt" : "en");
    if (r.status !== "ok") {
      said.textContent = errorSentence(r.error);
      return;
    }
    const words = r.data.beside ? s.restoredBeside(e.original, r.data.path) : s.restored(r.data.path);
    said.textContent = words;
    ui.status.textContent = words;
    await afterFileChange();
    took(await commands.trashList(), words);
  };

  const paint = () => {
    if (!listing) return;
    const l = listing;
    head.replaceChildren(
      h("p", "trash-sentence", s.summary(l.entries.length, size(l.size))),
      h("p", "settings-hint", `${s.kept(l.days)} ${s.notCounted}`),
      ...(l.early && l.quota !== null ? [h("p", "trash-early web-warn", s.early(size(l.quota)))] : []),
    );
    days.replaceChildren();
    if (l.can_set) {
      const sel = h("select");
      const choices = [1, 7, 14, 30, 60, 90, 180, 365].filter((d) => l.most === null || d <= l.most);
      if (!choices.includes(l.days) && l.days !== 0) choices.push(l.days);
      choices.sort((a, b) => a - b);
      const options: [number, string][] = choices.map((d) => [d, s.days(d)]);
      if (l.most === null) options.push([0, s.forever]);
      for (const [v, label] of options) {
        const o = h("option", "", label);
        o.value = String(v);
        o.selected = v === l.days;
        sel.append(o);
      }
      sel.addEventListener("change", () => void commands.trashSetDays(Number(sel.value)).then((r) => took(r)));
      days.append(item(s.keepFor, l.most === null ? s.keepForDesc : `${s.keepForDesc} ${s.keepForServer(l.most)}`, sel));
    }
    tools.replaceChildren(search);
    if (l.can_purge && l.entries.length > 0) {
      const empty = button("ghost danger", s.empty);
      empty.type = "button";
      empty.addEventListener("click", () =>
        confirmIn(s.emptyAsk(l.entries.length, size(l.size)), () => void commands.trashEmpty().then((r) => took(r, s.gone(l.entries.length))), empty),
      );
      tools.append(empty);
    }
    const q = search.value.trim().toLowerCase();
    const shown = l.entries.filter((e) => !q || `${e.original} ${e.by ?? ""}`.toLowerCase().includes(q));
    rows.replaceChildren(
      ...shown.map((e) => {
        const { name, dir } = parts(e);
        const tr = h("tr");
        tr.dataset.path = e.path;
        const nameCell = h("td", "trash-name", name);
        if (e.folder) nameCell.append(h("span", "trash-kind", ` (${s.folder})`));
        const back = button("ghost", s.restore);
        back.type = "button";
        back.setAttribute("aria-label", s.restoreName(name));
        back.addEventListener("click", () => void restore(e));
        const actions = h("td", "trash-actions");
        actions.append(back);
        if (l.can_purge) {
          const del = button("ghost danger", s.deleteNow);
          del.type = "button";
          del.setAttribute("aria-label", s.deleteNowName(name));
          del.addEventListener("click", () =>
            confirmIn(s.deleteAsk(name, size(e.size)), () => void commands.trashDelete([e.path]).then((r) => took(r, s.gone(1))), del),
          );
          actions.append(del);
        }
        tr.append(nameCell, h("td", "", dir || s.root), h("td", "num", size(e.size)), h("td", "", deletedWords(e)), h("td", "", e.expires === null ? s.never : day(e.expires)), actions);
        return tr;
      }),
    );
    wrap.hidden = shown.length === 0;
    nothing.hidden = shown.length > 0 || l.entries.length === 0;
    nothing.textContent = s.none;
  };

  box.prepend(h("p", "settings-hint", s.lead));
  void commands.trashList().then((r) => {
    if (r.status !== "ok") {
      said.textContent = `${s.failed} ${errorSentence(r.error)}`;
      return;
    }
    took(r);
  });
  return box;
}
