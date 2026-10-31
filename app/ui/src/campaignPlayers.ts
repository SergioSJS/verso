// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The players' access table (ADR 0110; ADR 0113 K.6): a real table of the
// people at the table, one row each, with columns for what they can do —
// Jogador (avatar, name, a dot while they are at the table), Vê (how many
// notes are released to them, opening the list), Edita (how many they edit,
// the same) and Direitos, how many of the four rights the game master gave
// them (Imagens, Arquivos, Cria notas, Cria boards), opening four switches.
// Under the table, a switch per right for everyone, mixed when the players
// differ. A switch saves at once and says so beside itself. On a phone each
// row becomes a card with the same controls. The rows are kept between the
// server's news, only updated, so a focus, an open list or an answer beside
// a switch is not lost to a repaint.

import { segmented } from "./accessControl";
import { setPlayerLevel } from "./accessDialog";
import type { CampaignPlayer, CampaignTable } from "./bindings";
import { campaign, noteAudience, setRight, type RightName } from "./campaign";
import { feedback, follow, hueOf, noteLink, onlineIds, tableAt, under } from "./campaignParts";
import { cp } from "./campaignStrings";
import { h, ui } from "./dom";
import { icon } from "./icons";
import { LOCALE } from "./strings";
import { tableSource } from "./table/record";

const byName = (a: string, b: string): number => a.localeCompare(b, LOCALE);

/** The notes of the table at `root` that `account` sees: the whole table's
 *  and those released to it (editing a note is seeing it). */
export function seenBy(root: string, account: string): string[] {
  return campaign()
    .notes.filter((n) => under(root, n.path))
    .filter((n) => {
      // The server says it per player (ADR 0113); an older one, by audience.
      if (n.sees) return n.sees.includes(account);
      const a = noteAudience(n.path);
      return a.kind === "table" || (a.kind === "players" && a.accounts.includes(account));
    })
    .map((n) => n.path)
    .sort(byName);
}

/** The notes of the table at `root` that `account` may edit. */
export function editedBy(root: string, account: string): string[] {
  return campaign()
    .notes.filter((n) => under(root, n.path) && (n.edits ? n.edits.includes(account) : n.grant.kind === "group" || (n.grant.kind === "player" && n.grant.account === account)))
    .map((n) => n.path)
    .sort(byName);
}

/** The players at the table at `root`: those who play at it (an older
 *  server that does not say plays them all). */
export function playersAt(root: string): CampaignPlayer[] {
  return campaign().players.filter((p) => !p.roots || p.roots.length === 0 || p.roots.includes(root));
}

type Kind = "sees" | "edits";

/** The four rights of a player (ADR 0113 K.6), in the order they are shown. */
const RIGHTS: readonly RightName[] = ["images", "files", "create_notes", "create_boards"];

/** The accounts of the table that were given `right`. */
function givenTo(t: CampaignTable | undefined, right: RightName): string[] {
  if (!t) return [];
  return (right === "images" ? t.image_players : right === "files" ? t.file_players : right === "create_notes" ? t.note_players : t.board_players) ?? [];
}

/** One number per block, for the ids that tie a count to its list: a root may hold spaces, which an IDREF cannot. */
let blocks = 0;

type Row = {
  tr: HTMLTableRowElement;
  detail: HTMLTableRowElement;
  update(p: CampaignPlayer, online: boolean, granted: ReadonlySet<RightName>): void;
};

/** The game master's players table for the table at `root`. */
export function playersBlock(root: string, after?: () => void): HTMLElement {
  const wrap = h("div", "cd-access");
  const uid = ++blocks;
  let seats = 0;
  const table = h("table", "cd-table");
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", cp.accessCaption);
  const head = h("thead");
  head.setAttribute("role", "rowgroup");
  const hr = h("tr");
  hr.setAttribute("role", "row");
  const th = (text: string, cls = "", glyph = ""): HTMLTableCellElement => {
    const c = h("th", cls);
    c.append(h("span", "cd-col-text", text));
    // On a phone the column's hint is its icon alone; the name stays for readers.
    if (glyph) {
      const g = icon(glyph, "");
      g.classList.add("cd-col-icon");
      c.append(g);
    }
    c.setAttribute("aria-label", text);
    c.scope = "col";
    c.setAttribute("role", "columnheader");
    return c;
  };
  hr.append(th(cp.colPlayer, "cd-col-player"), th(cp.colSees, "cd-col-sees", "eye"), th(cp.colEdits, "cd-col-edits", "edit"), th(cp.colRights, "cd-col-rights", "shield"));
  head.append(hr);
  const body = h("tbody");
  body.setAttribute("role", "rowgroup");
  table.append(head, body);
  const empty = h("p", "share-empty", cp.noPlayers);

  // A switch per right for everyone, under the table: mixed when the
  // players differ (the header's old "todos" box, once per right).
  const everyone = h("fieldset", "cd-rights-all");
  everyone.append(h("legend", "cd-rights-all-title", cp.rightsAll));
  const alls = new Map<RightName, { box: HTMLInputElement; fb: ReturnType<typeof feedback> }>();
  for (const right of RIGHTS) {
    const label = h("label", "cd-all-row");
    const box = h("input", "cd-all");
    box.type = "checkbox";
    box.dataset["key"] = `all:${right}`;
    box.setAttribute("aria-label", cp.rights[right].all);
    const fb = feedback();
    label.append(box, h("span", "cd-all-text", cp.rights[right].label), fb.el);
    everyone.append(label);
    alls.set(right, { box, fb });
  }
  const hint = h("p", "cd-hint cd-images-hint", cp.rightsHint);
  wrap.append(table, empty, everyone, hint);

  const rows = new Map<string, Row>();
  const open = new Set<string>();

  const save = async (right: RightName, ids: string[], on: boolean, done: string, fb: ReturnType<typeof feedback>, undo: () => void): Promise<void> => {
    const ok = await setRight(root, ids, right, on, done);
    if (ok) {
      fb.say(cp.rightsSaved);
      return;
    }
    undo();
    fb.say(`${cp.failed}: ${ui.status.textContent ?? ""}`, true);
  };

  const make = (p: CampaignPlayer): Row => {
    const detailId = `cd-detail-${uid}-${++seats}`;
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
      // The icon is for a phone's narrow row; the number is the count.
      const g = icon(kind === "sees" ? "eye" : "edit", "");
      g.classList.add("cd-count-icon");
      btn.append(g, h("span", "cd-count-n"));
      btn.setAttribute("aria-controls", detailId);
      td.append(btn);
      return { td, btn };
    };
    detail.id = detailId;
    const sees = counter("sees");
    const edits = counter("edits");

    // The rights: a count that opens, under the row, one labelled switch per right.
    const rightsTd = h("td", "cd-num cd-rights");
    rightsTd.setAttribute("role", "cell");
    rightsTd.dataset["label"] = cp.colRights;
    const rightsBtn = h("button", "cd-count-btn");
    rightsBtn.type = "button";
    rightsBtn.dataset["key"] = `rights:${p.id}`;
    const rg = icon("shield", "");
    rg.classList.add("cd-count-icon");
    rightsBtn.append(rg, h("span", "cd-count-n"));
    rightsBtn.setAttribute("aria-controls", detailId);
    rightsTd.append(rightsBtn);
    const rightsSec = h("div", "cd-detail-list cd-rights-list");
    const rightsTitle = h("strong", "", "");
    rightsSec.append(rightsTitle);
    const boxes = new Map<RightName, HTMLInputElement>();
    for (const right of RIGHTS) {
      const line = h("div", "cd-right");
      const lab = h("label", "cd-right-label");
      const sw = h("span", "switch big");
      const box = h("input");
      box.type = "checkbox";
      box.setAttribute("role", "switch");
      box.dataset["key"] = `${right}:${p.id}`;
      sw.append(box, h("span", "switch-track"));
      const fb = feedback();
      lab.append(sw, h("span", "cd-right-text", cp.rights[right].label));
      line.append(lab, fb.el);
      line.append(h("p", "cd-hint cd-right-hint", cp.rights[right].hint));
      rightsSec.append(line);
      boxes.set(right, box);
      box.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") e.stopPropagation();
      });
      box.addEventListener("change", () => {
        const want = box.checked;
        box.disabled = true;
        void save(right, [p.id], want, want ? cp.rights[right].on(p.name) : cp.rights[right].off(p.name), fb, () => {
          box.checked = !want;
        }).then(() => {
          box.disabled = false;
          box.focus();
        });
      });
    }

    const listFor = (kind: Kind): string[] => (kind === "sees" ? seenBy(root, p.id) : editedBy(root, p.id));
    const lists = { sees: h("div", "cd-detail-list"), edits: h("div", "cd-detail-list") };
    detailCell.append(lists.sees, lists.edits, rightsSec);
    const paintDetail = (): void => {
      let any = false;
      for (const kind of ["sees", "edits"] as Kind[]) {
        const sec = lists[kind];
        const shown = open.has(`${kind}:${p.id}`);
        sec.hidden = !shown;
        if (!shown) {
          // A closed list keeps nothing of the last time it was open.
          sec.replaceChildren();
          continue;
        }
        any = true;
        const list = listFor(kind);
        const ul = h("ul", "cd-note-list");
        if (list.length === 0) ul.append(h("li", "cd-hint", cp.noNotes));
        for (const path of list) {
          const li = h("li", "cd-note-row");
          li.append(noteLink(path, after));
          // The same control as the Access dialog, for this player on this file:
          // person → the Table's window, file → the dialog (ADR 0113 item 1).
          const seg = segmented(p.name, kind === "edits" ? "edit" : "see", (level) => {
            void setPlayerLevel(path, p.id, level);
          });
          li.append(seg.el);
          ul.append(li);
        }
        sec.replaceChildren(h("strong", "", kind === "sees" ? cp.seesOf(p.name) : cp.editsOf(p.name)), ul);
      }
      const rightsShown = open.has(`rights:${p.id}`);
      rightsSec.hidden = !rightsShown;
      rightsTitle.textContent = cp.rightsOf(p.name);
      detail.hidden = !any && !rightsShown;
    };
    for (const [key, btn] of [
      [`sees:${p.id}`, sees.btn],
      [`edits:${p.id}`, edits.btn],
      [`rights:${p.id}`, rightsBtn],
    ] as [string, HTMLButtonElement][]) {
      btn.addEventListener("click", () => {
        if (open.has(key)) open.delete(key);
        else open.add(key);
        paint();
      });
    }
    const paintCounts = (): void => {
      for (const [kind, c] of [["sees", sees], ["edits", edits]] as [Kind, typeof sees][]) {
        const n = listFor(kind).length;
        c.btn.querySelector(".cd-count-n")!.textContent = String(n);
        const shown = open.has(`${kind}:${p.id}`);
        c.btn.setAttribute("aria-expanded", String(shown));
        c.btn.setAttribute("aria-label", kind === "sees" ? cp.seesToggle(p.name, n) : cp.editsToggle(p.name, n));
        c.btn.disabled = false;
      }
      paintDetail();
    };

    tr.append(who, sees.td, edits.td, rightsTd);
    return {
      tr,
      detail,
      update(player, online, granted) {
        nameLine.textContent = player.name;
        dot.hidden = !online;
        for (const [right, box] of boxes) {
          box.setAttribute("aria-label", cp.rights[right].one(player.name));
          if (!box.disabled) box.checked = granted.has(right);
        }
        rightsBtn.querySelector(".cd-count-n")!.textContent = `${granted.size}/${RIGHTS.length}`;
        rightsBtn.setAttribute("aria-expanded", String(open.has(`rights:${p.id}`)));
        rightsBtn.setAttribute("aria-label", cp.rightsToggle(player.name, granted.size, RIGHTS.length));
        paintCounts();
      },
    };
  };

  const paint = (): void => {
    const on = onlineIds(root);
    const players = playersAt(root).slice().sort((a, b) => byName(a.name, b.name));
    const given = new Map(RIGHTS.map((r) => [r, new Set(givenTo(tableAt(root), r))] as const));
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
      row.update(p, on.has(p.id), new Set(RIGHTS.filter((r) => given.get(r)?.has(p.id))));
      // In name order, without touching a row that is already in place.
      const at = body.children[i * 2];
      if (at !== row.tr) body.insertBefore(row.tr, at ?? null);
      const next = body.children[i * 2 + 1];
      if (next !== row.detail) body.insertBefore(row.detail, next ?? null);
    });
    for (const [right, { box }] of alls) {
      const n = players.filter((p) => given.get(right)?.has(p.id)).length;
      if (box.disabled) continue;
      box.checked = players.length > 0 && n === players.length;
      box.indeterminate = n > 0 && n < players.length;
    }
    if (keep) wrap.querySelector<HTMLElement>(`[data-key="${keep}"]`)?.focus();
  };

  for (const [right, { box, fb }] of alls) {
    box.addEventListener("change", () => {
      const want = box.checked;
      box.indeterminate = false;
      box.disabled = true;
      const ids = playersAt(root).map((p) => p.id);
      void save(right, ids, want, want ? cp.rights[right].allOn : cp.rights[right].allOff, fb, () => {
        box.checked = !want;
      }).then(() => {
        box.disabled = false;
        paint();
        box.focus();
      });
    });
  }

  follow(wrap, paint);
  let off: (() => void) | null = null;
  off = tableSource().onChange(() => {
    if (wrap.isConnected) paint();
    else if (off) off();
  });
  return wrap;
}
