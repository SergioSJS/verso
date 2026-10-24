// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The players' access table (ADR 0110; ADR 0107 item 3 as amended
// 2026-10-24): a real table of the people at the table, one row each, with
// columns for what they can do — Jogador (avatar, name, a dot while they
// are at the table), Vê (how many notes are released to them, opening the
// list), Edita (how many they edit, the same) and Imagens, a switch the
// game master turns to let that player send images to the chat. The header
// holds a "todos" box for the Imagens column, mixed when the players differ.
// A switch saves at once and says so beside itself. On a phone each row
// becomes a card with the same controls. The rows are kept between the
// server's news, only updated, so a focus, an open list or an answer beside
// a switch is not lost to a repaint.

import type { CampaignPlayer } from "./bindings";
import { campaign, noteAudience, setImages } from "./campaign";
import { feedback, follow, hueOf, noteLink, onlineIds, tableAt, under } from "./campaignParts";
import { cp } from "./campaignStrings";
import { h, ui } from "./dom";
import { LOCALE } from "./strings";
import { tableSource } from "./table/record";

const byName = (a: string, b: string): number => a.localeCompare(b, LOCALE);

/** The notes of the table at `root` that `account` sees: the whole table's
 *  and those released to it (editing a note is seeing it). */
export function seenBy(root: string, account: string): string[] {
  return campaign()
    .notes.filter((n) => under(root, n.path))
    .filter((n) => {
      const a = noteAudience(n.path);
      return a.kind === "table" || (a.kind === "players" && a.accounts.includes(account));
    })
    .map((n) => n.path)
    .sort(byName);
}

/** The notes of the table at `root` that `account` may edit. */
export function editedBy(root: string, account: string): string[] {
  return campaign()
    .notes.filter((n) => under(root, n.path) && (n.grant.kind === "group" || (n.grant.kind === "player" && n.grant.account === account)))
    .map((n) => n.path)
    .sort(byName);
}

/** The players at the table at `root`: those who play at it (an older
 *  server that does not say plays them all). */
export function playersAt(root: string): CampaignPlayer[] {
  return campaign().players.filter((p) => !p.roots || p.roots.length === 0 || p.roots.includes(root));
}

type Kind = "sees" | "edits";

type Row = {
  tr: HTMLTableRowElement;
  detail: HTMLTableRowElement;
  update(p: CampaignPlayer, online: boolean, granted: boolean): void;
  readonly switch: HTMLInputElement;
};

/** The game master's players table for the table at `root`. */
export function playersBlock(root: string, after?: () => void): HTMLElement {
  const wrap = h("div", "cd-access");
  const table = h("table", "cd-table");
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", cp.accessCaption);
  const head = h("thead");
  head.setAttribute("role", "rowgroup");
  const hr = h("tr");
  hr.setAttribute("role", "row");
  const th = (text: string, cls = ""): HTMLTableCellElement => {
    const c = h("th", cls, text);
    c.scope = "col";
    c.setAttribute("role", "columnheader");
    return c;
  };
  const imagesHead = th("", "cd-col-images");
  const imagesLabel = h("span", "cd-col-label", cp.colImages);
  const all = h("input", "cd-all");
  all.type = "checkbox";
  all.id = `cd-all-${root || "root"}`;
  all.setAttribute("aria-label", cp.imagesAll);
  all.title = cp.imagesAll;
  const allText = h("label", "cd-all-text", cp.imagesAllShort);
  allText.htmlFor = all.id;
  const allFb = feedback();
  imagesHead.append(imagesLabel, h("span", "cd-all-box"));
  imagesHead.querySelector(".cd-all-box")?.append(all, allText, allFb.el);
  hr.append(th(cp.colPlayer, "cd-col-player"), th(cp.colSees), th(cp.colEdits), imagesHead);
  head.append(hr);
  const body = h("tbody");
  body.setAttribute("role", "rowgroup");
  table.append(head, body);
  const hint = h("p", "cd-hint cd-images-hint", cp.imagesHint);
  const empty = h("p", "share-empty", cp.noPlayers);
  wrap.append(table, empty, hint);

  const rows = new Map<string, Row>();
  const open = new Set<string>();

  const save = async (ids: string[], on: boolean, done: string, fb: ReturnType<typeof feedback>, undo: () => void): Promise<void> => {
    const ok = await setImages(root, ids, on, done);
    if (ok) {
      fb.say(cp.imagesSaved);
      return;
    }
    undo();
    fb.say(`${cp.failed}: ${ui.status.textContent ?? ""}`, true);
  };

  const make = (p: CampaignPlayer): Row => {
    const tr = h("tr", "cd-player");
    tr.setAttribute("role", "row");
    const who = h("th", "cd-who");
    who.scope = "row";
    who.setAttribute("role", "rowheader");
    const avatar = h("span", "cd-avatar", [...p.name][0]?.toUpperCase() ?? "?");
    avatar.style.setProperty("--hue", String(hueOf(p.id)));
    avatar.setAttribute("aria-hidden", "true");
    const nameLine = h("span", "cd-player-name", p.name);
    const dot = h("span", "cd-online", "●");
    dot.title = cp.online;
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", cp.online);
    dot.hidden = true;
    const text = h("span", "cd-who-text");
    text.append(nameLine, dot);
    const whoBox = h("span", "cd-who-box");
    whoBox.append(avatar, text);
    who.append(whoBox);

    const detail = h("tr", "cd-detail");
    detail.setAttribute("role", "row");
    detail.hidden = true;
    const detailCell = h("td");
    detailCell.colSpan = 4;
    detailCell.setAttribute("role", "cell");
    detail.append(detailCell);

    const counter = (kind: Kind): { td: HTMLTableCellElement; btn: HTMLButtonElement } => {
      const td = h("td", "cd-num");
      td.setAttribute("role", "cell");
      td.dataset["label"] = kind === "sees" ? cp.colSees : cp.colEdits;
      const btn = h("button", "cd-count-btn");
      btn.type = "button";
      btn.dataset["key"] = `${kind}:${p.id}`;
      btn.setAttribute("aria-controls", `cd-detail-${root || "root"}-${p.id}`);
      td.append(btn);
      return { td, btn };
    };
    detail.id = `cd-detail-${root || "root"}-${p.id}`;
    const sees = counter("sees");
    const edits = counter("edits");

    const imagesTd = h("td", "cd-images");
    imagesTd.setAttribute("role", "cell");
    imagesTd.dataset["label"] = cp.colImages;
    const sw = h("label", "switch");
    const box = h("input");
    box.type = "checkbox";
    box.setAttribute("role", "switch");
    box.setAttribute("aria-label", cp.imagesOne(p.name));
    sw.append(box, h("span", "switch-track"));
    const fb = feedback();
    imagesTd.append(sw, fb.el);
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") e.stopPropagation();
    });
    box.addEventListener("change", () => {
      const want = box.checked;
      box.setAttribute("aria-checked", String(want));
      box.disabled = true;
      void save([p.id], want, want ? cp.imagesOn(p.name) : cp.imagesOff(p.name), fb, () => {
        box.checked = !want;
        box.setAttribute("aria-checked", String(!want));
      }).then(() => {
        box.disabled = false;
        box.focus();
      });
    });

    const listFor = (kind: Kind): string[] => (kind === "sees" ? seenBy(root, p.id) : editedBy(root, p.id));
    const paintDetail = (): void => {
      const lines: HTMLElement[] = [];
      for (const kind of ["sees", "edits"] as Kind[]) {
        if (!open.has(`${kind}:${p.id}`)) continue;
        const list = listFor(kind);
        const sec = h("div", "cd-detail-list");
        sec.append(h("strong", "", kind === "sees" ? cp.seesOf(p.name) : cp.editsOf(p.name)));
        const ul = h("ul", "cd-note-list");
        if (list.length === 0) ul.append(h("li", "cd-hint", cp.noNotes));
        for (const path of list) {
          const li = h("li");
          li.append(noteLink(path, after));
          ul.append(li);
        }
        sec.append(ul);
        lines.push(sec);
      }
      detailCell.replaceChildren(...lines);
      detail.hidden = lines.length === 0;
    };
    for (const [kind, c] of [["sees", sees], ["edits", edits]] as [Kind, typeof sees][]) {
      c.btn.addEventListener("click", () => {
        const key = `${kind}:${p.id}`;
        if (open.has(key)) open.delete(key);
        else open.add(key);
        paint();
      });
    }
    const paintCounts = (): void => {
      for (const [kind, c] of [["sees", sees], ["edits", edits]] as [Kind, typeof sees][]) {
        const n = listFor(kind).length;
        c.btn.textContent = String(n);
        const shown = open.has(`${kind}:${p.id}`);
        c.btn.setAttribute("aria-expanded", String(shown));
        c.btn.setAttribute("aria-label", kind === "sees" ? cp.seesToggle(p.name, n) : cp.editsToggle(p.name, n));
        c.btn.disabled = false;
      }
      paintDetail();
    };

    tr.append(who, sees.td, edits.td, imagesTd);
    return {
      tr,
      detail,
      switch: box,
      update(player, online, granted) {
        nameLine.textContent = player.name;
        dot.hidden = !online;
        box.setAttribute("aria-label", cp.imagesOne(player.name));
        if (!box.disabled) {
          box.checked = granted;
          box.setAttribute("aria-checked", String(granted));
        }
        paintCounts();
      },
    };
  };

  const paint = (): void => {
    const on = onlineIds(root);
    const players = playersAt(root).slice().sort((a, b) => byName(a.name, b.name));
    const granted = new Set(tableAt(root)?.image_players ?? []);
    const keep = document.activeElement instanceof HTMLElement ? (document.activeElement.dataset["key"] ?? null) : null;
    empty.hidden = players.length > 0;
    table.hidden = players.length === 0;
    const ids = new Set(players.map((p) => p.id));
    for (const [id, row] of rows) {
      if (ids.has(id)) continue;
      row.tr.remove();
      row.detail.remove();
      rows.delete(id);
    }
    players.forEach((p, i) => {
      let row = rows.get(p.id);
      if (!row) {
        row = make(p);
        rows.set(p.id, row);
      }
      row.update(p, on.has(p.id), granted.has(p.id));
      // In name order, without touching a row that is already in place.
      const at = body.children[i * 2];
      if (at !== row.tr) body.insertBefore(row.tr, at ?? null);
      const next = body.children[i * 2 + 1];
      if (next !== row.detail) body.insertBefore(row.detail, next ?? null);
    });
    const n = players.filter((p) => granted.has(p.id)).length;
    if (!all.disabled) {
      all.checked = players.length > 0 && n === players.length;
      all.indeterminate = n > 0 && n < players.length;
      all.setAttribute("aria-checked", all.indeterminate ? "mixed" : String(all.checked));
    }
    if (keep) wrap.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  };

  all.addEventListener("change", () => {
    const want = all.checked;
    all.indeterminate = false;
    all.disabled = true;
    const ids = playersAt(root).map((p) => p.id);
    void save(ids, want, want ? cp.imagesAllOn : cp.imagesAllOff, allFb, () => {
      all.checked = !want;
    }).then(() => {
      all.disabled = false;
      paint();
      all.focus();
    });
  });

  follow(wrap, paint);
  let off: (() => void) | null = null;
  off = tableSource().onChange(() => {
    if (wrap.isConnected) paint();
    else if (off) off();
  });
  return wrap;
}
