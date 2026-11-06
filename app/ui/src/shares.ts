// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The owner shares a folder of theirs (ADR 0081 item 7): the tree marks a
// shared folder, its menu has "Share…", and the dialog says who has access
// and in which role, adds a person by e-mail, changes a role, removes a
// person or the whole share — each removal asked first, in the dialog
// (item 18) — and offers the folder of the attachments the notes show
// when it lies outside (item 11). Only the owner shares (item 4): the
// window learns it when the server answers the list of shares, and shows
// nothing of this otherwise. An e-mail no account has is invited by a
// link when the owner runs the server (ADR 0081 item 4: only the admin
// invites a new person) — the way a folder with no table is invited to,
// on a UniVerso and where this app serves (ADR 0117, decided 2026-11-04).

import { commands, type ContractError, type FolderShare } from "./bindings";
import { asDialog, closed, opened } from "./dialogs/a11y";
import { h, ui } from "./dom";
import { told } from "./errors";
import { failureText, unreachableAt } from "./reach";
import { allNotes, folderName } from "./folder";
import { serverLink } from "./can";
import { LOCALE } from "./strings";
import { folderAccess } from "./access";
import { icon } from "./icons";
import { dirOf, name } from "./paths";
import { withServerProof } from "./serverProof";
import { askServerProof } from "./serverProver";
import { roleWord, sh } from "./shareStrings";
import { loadReadLinks, openReadLinkDialog } from "./readLinks";
import { rl } from "./readLinkStrings";
import { seatFirst, servedHere } from "./seatState";

/** The folders of the open folder shared with someone, by path. */
const shared = new Map<string, FolderShare>();
let owner = false;

/** Whether the person may share here: the owner of a server's folder. */
export function mayShare(): boolean {
  // The server says who the person is (ADR 0113): the game master of a
  // folder's table is its owner. A host with no such answer (a folder of
  // this computer synced to a server, until S8) keeps the share list's own.
  // A folder this app serves, the window not at its table yet: its owner
  // has the rows, and the first sits (ADR 0117 D4 Q3, revised 2026-11-05).
  if (servedHere()) return true;
  const a = folderAccess();
  return a ? a.seat === "master" : owner;
}

/** The shares of the window's folder, asked again: the tree's marks follow. */
export async function loadShares(): Promise<void> {
  const r = await commands.shareList();
  owner = r.status === "ok";
  shared.clear();
  if (r.status === "ok") for (const s of r.data.slice(1)) if (s.path && s.people.length > 0) shared.set(s.path, s);
  markShared();
  dispatchEvent(new Event("verso:campaign-status"));
  // The read links are the owner's too (ADR 0105), and mark the tree beside:
  // the game master's at their own server's table too (ADR 0117 D4 Q3),
  // whose server lists its shares as a UniVerso does (D9).
  if (owner || mayShare()) await loadReadLinks();
}

/** Whether the folder at `path`, or one inside it, is shared. */
export function sharedUnder(path: string): boolean {
  return [...shared.keys()].some((p) => p === path || p.startsWith(`${path}/`));
}

/** A shared folder's mark in the tree, named for a screen reader. */
export function shareMark(path: string): HTMLElement | null {
  const s = shared.get(path);
  if (!s) return null;
  const mark = h("span", "share-mark");
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", sh.sharedWith(s.people.length));
  mark.title = sh.sharedWith(s.people.length);
  mark.append(icon("user"));
  return mark;
}

/** The marks of the folders drawn now. */
export function markShared(): void {
  for (const s of ui.treeRoot.querySelectorAll<HTMLElement>("summary[data-folder]")) {
    s.querySelector(".share-mark")?.remove();
    const mark = shareMark(s.dataset["folder"] ?? "");
    if (mark) s.querySelector(".folder-label")?.after(mark);
  }
}

function said(e: ContractError): string {
  if (e.kind === "prove_first") return sh.proveFirst;
  // The server did not answer: which one, and why it may be; the console
  // and the log have it too (errors.ts).
  if (unreachableAt(e) !== null) {
    told(e.kind, e.message, e);
    return failureText(e);
  }
  return /no account has that e-mail/i.test(e.message) ? sh.noAccount : e.message;
}

/** Whether the server refused an e-mail no account has and said this
 *  person may invite it: the server's admin. */
function mayInvite(e: ContractError): boolean {
  return /no account has that e-mail: make an invitation link/i.test(e.message);
}

/** A share command the server may want a fresh proof for (ADR 0083 item
 *  6; giving or changing a role does): in the desktop app the person is
 *  asked on the spot and the command sent once more; a browser's pages
 *  ask on their own (`web/proof.ts`), so there it goes as it is. */
function proved<T>(call: () => Promise<{ status: "ok"; data: T } | { status: "error"; error: ContractError }>) {
  return withServerProof(call, document.documentElement.dataset.host === "server" ? null : askServerProof);
}

/** The attachments the notes under `path` embed that lie outside it: the
 *  folder most of them are in, and how many. */
async function outsideAttachments(path: string): Promise<{ folder: string; count: number } | null> {
  const inside = `${path}/`;
  const dirs = new Map<string, number>();
  let count = 0;
  for (const note of allNotes.filter((n) => n.startsWith(inside)).slice(0, 300)) {
    const r = await commands.links(note);
    if (r.status !== "ok") continue;
    for (const l of r.data) {
      const to = l.resolved;
      if (!l.embed || !to || to.toLowerCase().endsWith(".md") || to.startsWith(inside)) continue;
      count++;
      dirs.set(dirOf(to), (dirs.get(dirOf(to)) ?? 0) + 1);
    }
  }
  if (count === 0) return null;
  const folder = [...dirs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return { folder, count };
}

/** A removal asked first, in the dialog: the button becomes the question. */
function askFirst(where: HTMLElement, question: string, yes: () => Promise<void>): void {
  const box = h("div", "share-ask");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", question);
  const q = h("p", "share-ask-text", question);
  const ok = h("button", "btn danger", sh.yes);
  ok.type = "button";
  const no = h("button", "btn quiet", sh.cancel);
  no.type = "button";
  const back = Array.from(where.childNodes);
  no.addEventListener("click", () => where.replaceChildren(...back));
  ok.addEventListener("click", () => void yes());
  box.append(q, ok, no);
  where.replaceChildren(box);
  ok.focus();
}

/** The share dialog of the folder at `path` (`""` the whole folder). */
export function openShareDialog(path: string): void {
  // A folder this app serves, the window not at its table yet: it sits
  // first, and the share is the server's (ADR 0117 D4 Q3, 2026-11-05).
  if (servedHere()) {
    void seatFirst().then((ok) => ok && drawShareDialog(path));
    return;
  }
  drawShareDialog(path);
}

function drawShareDialog(path: string): void {
  const whole = path === "";
  // A layer of the page like the window's other dialogs, not a `<dialog>`
  // in the browser's top layer: what opens over it — the palette, a menu —
  // is above it, and it is inert under them (dialogs/a11y.ts).
  const overlay = h("div", "quick share-overlay");
  const dialog = h("div", "web-dialog share-dialog");
  overlay.append(dialog);
  const titleId = "share-title";
  const title = h("h2", "web-dialog-title", whole ? sh.titleWhole(folderName) : sh.title(name(path)));
  title.id = titleId;
  const status = h("p", "share-status");
  status.setAttribute("role", "status");
  // Whatever the server refuses is said here and seen: scrolled into view
  // (a phone's dialog may be taller than the screen).
  new MutationObserver(() => status.scrollIntoView?.({ block: "nearest" })).observe(status, { childList: true, characterData: true });
  const list = h("ul", "share-people");
  list.setAttribute("aria-label", sh.people);
  const attachments = h("div", "share-attachments");
  const footer = h("div", "web-actions share-actions");
  const missing = h("p", "share-missing", sh.missing);
  missing.setAttribute("role", "alert");
  missing.hidden = true;
  const close = () => {
    overlay.remove();
    closed(overlay);
    void loadShares();
  };
  // Named by its title; Tab kept inside, Escape closes it.
  asDialog(overlay, "", close, titleId);

  // Add a person, or change their role.
  const form = h("form", "share-form");
  const emailId = "share-email";
  const emailLabel = h("label", "", sh.email);
  emailLabel.htmlFor = emailId;
  const email = h("input");
  email.type = "email";
  email.id = emailId;
  email.required = true;
  email.autocomplete = "off";
  const roleLabel = h("label", "", sh.role);
  roleLabel.htmlFor = "share-role";
  const role = roleSelect(whole, "reader");
  role.id = "share-role";
  const add = h("button", "btn", sh.add);
  add.type = "submit";
  form.append(emailLabel, email, roleLabel, role, add);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    invite.replaceChildren();
    void proved(() => commands.shareGrant(path, email.value.trim(), role.value)).then((r) => {
      if (r.status !== "ok") {
        if (mayInvite(r.error)) return offerInvite(email.value.trim(), role.value);
        return void (status.textContent = said(r.error));
      }
      status.textContent = sh.added(email.value.trim());
      email.value = "";
      draw(r.data);
    });
  });

  // An e-mail no account has, and the owner runs the server: an invitation
  // link carrying this folder at this role, shown once with Copy.
  const invite = h("div", "share-invite");
  const offerInvite = (to: string, at: string) => {
    status.textContent = sh.noAccountInvite(to);
    const make = h("button", "btn", sh.inviteMake);
    make.type = "button";
    make.setAttribute("aria-label", sh.inviteMakeNamed(to));
    make.addEventListener("click", () => {
      make.disabled = true;
      void proved(() => commands.shareInvite(path, to, at)).then(async (r) => {
        make.disabled = false;
        if (r.status !== "ok") return void (status.textContent = said(r.error));
        const link = await serverLink(r.data.link);
        const field = h("input");
        field.readOnly = true;
        field.value = link;
        field.setAttribute("aria-label", sh.inviteField);
        const copy = h("button", "btn", sh.inviteCopy);
        copy.type = "button";
        copy.addEventListener("click", () => {
          void navigator.clipboard.writeText(link).then(() => (status.textContent = sh.inviteCopied));
        });
        const line = h("div", "cd-link");
        line.append(field, copy);
        const when = new Date(r.data.expires * 1000).toLocaleDateString(LOCALE, { day: "numeric", month: "long" });
        invite.replaceChildren(line, h("p", "cd-hint", sh.inviteExpires(when)));
        email.value = "";
        field.select();
      });
    });
    invite.replaceChildren(make);
    make.focus();
  };

  const draw = (s: FolderShare) => {
    missing.hidden = !s.missing;
    list.replaceChildren(
      ...(s.people.length === 0
        ? [h("li", "share-empty", sh.nobody)]
        : s.people.map((p) => {
            const li = h("li", "share-person");
            const who = h("span", "share-who");
            who.append(h("strong", "", p.name), h("small", "", p.email));
            const actions = h("span", "share-person-actions");
            const select = roleSelect(whole, p.role);
            select.setAttribute("aria-label", sh.roleOf(p.name, roleWord(p.role)));
            select.addEventListener("change", () => {
              void proved(() => commands.shareGrant(path, p.email, select.value)).then((r) => {
                if (r.status !== "ok") return void (status.textContent = said(r.error));
                status.textContent = sh.saved;
                draw(r.data);
              });
            });
            const remove = h("button", "btn quiet", sh.remove);
            remove.type = "button";
            remove.setAttribute("aria-label", sh.removeNamed(p.name));
            remove.addEventListener("click", () =>
              askFirst(actions, sh.confirmRemove(p.name), async () => {
                const r = await proved(() => commands.shareRevoke(path, p.id));
                if (r.status !== "ok") {
                  status.textContent = said(r.error);
                  return;
                }
                status.textContent = sh.removed;
                draw(r.data);
                email.focus();
              }),
            );
            actions.append(select, remove);
            li.append(who, actions);
            return li;
          })),
    );
    footer.replaceChildren();
    if (!whole && s.id) {
      const stop = h("button", "btn quiet danger", sh.stop);
      stop.type = "button";
      stop.addEventListener("click", () =>
        askFirst(footer, sh.confirmStop, async () => {
          const r = await proved(() => commands.shareRevoke(path, null));
          if (r.status !== "ok") {
            status.textContent = said(r.error);
            return;
          }
          status.textContent = sh.stopped;
          draw(r.data);
          email.focus();
        }),
      );
      footer.append(stop);
    }
    const link = h("button", "btn quiet", rl.buttonFolder);
    link.type = "button";
    link.addEventListener("click", () => openReadLinkDialog("folder", path));
    footer.append(link);
    const done = h("button", "btn", sh.close);
    done.type = "button";
    done.addEventListener("click", close);
    footer.append(done);
    if (!whole) void drawAttachments(s);
  };

  const drawAttachments = async (s: FolderShare) => {
    if (s.attachments) {
      const off = h("button", "btn quiet", sh.attachmentsRemove);
      off.type = "button";
      off.addEventListener("click", () => {
        void proved(() => commands.shareAttachments(path, null)).then((r) => (r.status === "ok" ? draw(r.data) : void (status.textContent = said(r.error))));
      });
      attachments.replaceChildren(h("p", "", sh.attachmentsShown(s.attachments)), off);
      return;
    }
    attachments.replaceChildren(h("p", "settings-hint", sh.attachmentsLooking));
    const out = await outsideAttachments(path);
    if (!out) {
      attachments.replaceChildren(h("p", "settings-hint", sh.attachmentsNone));
      return;
    }
    if (out.folder === "") {
      attachments.replaceChildren(h("p", "", sh.attachmentsAtRoot(out.count)));
      return;
    }
    const include = h("button", "btn quiet", sh.attachmentsAdd(out.folder));
    include.type = "button";
    // Only once someone has the share: the share is made with its first person.
    include.disabled = !s.id;
    include.addEventListener("click", () => {
      void proved(() => commands.shareAttachments(path, out.folder)).then((r) => (r.status === "ok" ? draw(r.data) : void (status.textContent = said(r.error))));
    });
    attachments.replaceChildren(h("p", "", sh.attachmentsOutside(out.count, out.folder)), include);
  };

  dialog.append(title, h("p", "settings-hint", sh.kept), missing, list, form, invite, attachments, status, footer);
  document.body.append(overlay);
  opened(overlay);
  email.focus();
  void commands.shareList().then((r) => {
    if (r.status !== "ok") {
      status.textContent = said(r.error);
      return;
    }
    draw(r.data.find((s) => s.path === path) ?? { id: null, path, people: [], attachments: null, missing: false });
  });
}

function roleSelect(whole: boolean, value: string): HTMLSelectElement {
  const select = h("select", "share-role");
  const roles = whole ? ["reader", "editor", "owner"] : ["reader", "editor"];
  for (const r of roles) {
    const o = h("option", "", roleWord(r));
    o.value = r;
    o.selected = r === value;
    select.append(o);
  }
  return select;
}
