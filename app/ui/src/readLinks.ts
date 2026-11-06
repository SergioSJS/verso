// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Read links (ADR 0105), the owner's side: the dialog that lists the live
// links of a folder or a note, warns how many notes hold secrets, and
// makes or revokes one; "Copy read link…" in a note's menu opens it for
// the note; the tree marks what a live link keeps open. Only the folder's
// owner is answered by the server (item 3). The address of a link crosses
// once, in the answer that makes it — the server keeps a hash — so this
// window keeps it, in memory, for as long as the window lives, and the
// panel offers to copy it again only for those.

import { commands, type ContractError, type ReadLinkInfo } from "./bindings";
import { asDialog, closed, opened } from "./dialogs/a11y";
import { h, ui } from "./dom";
import { told } from "./errors";
import { dateFmt } from "./format";
import { icon } from "./icons";
import { folderName } from "./folder";
import { name } from "./paths";
import { failureText, unreachableAt } from "./reach";
import { rl } from "./readLinkStrings";
import { withServerProof } from "./serverProof";
import { askServerProof } from "./serverProver";
import { isSeated, seatFirst, servedHere } from "./seatState";

/** The live links of the open folder, and whether the server has them on. */
let links: ReadLinkInfo[] = [];
let enabled = false;
/** The addresses made in this window, by the link's id. */
const addresses = new Map<string, string>();

export function readLinksOn(): boolean {
  return enabled;
}

/** The links of the window's folder, asked again: the tree's marks follow. */
export async function loadReadLinks(): Promise<void> {
  const r = await commands.readLinkList();
  enabled = r.status === "ok" && r.data.enabled;
  links = r.status === "ok" ? r.data.links : [];
  markReadLinks();
}

/** The live links whose target is exactly `path`. */
function linksAt(kind: string, path: string): ReadLinkInfo[] {
  return links.filter((l) => l.kind === kind && l.path === path);
}

/** Whether the folder at `path`, or a note, has a live link: a mark. */
export function readLinkMark(path: string, kind: "folder" | "note"): HTMLElement | null {
  if (linksAt(kind, path).length === 0) return null;
  const mark = h("span", "read-link-mark");
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", rl.mark);
  mark.title = rl.mark;
  mark.append(icon("link"));
  return mark;
}

/** The marks of the rows drawn now. */
export function markReadLinks(): void {
  for (const m of ui.treeRoot.querySelectorAll(".read-link-mark")) m.remove();
  for (const s of ui.treeRoot.querySelectorAll<HTMLElement>("summary[data-folder]")) {
    const mark = readLinkMark(s.dataset["folder"] ?? "", "folder");
    if (mark) s.querySelector(".share-mark, .folder-label")?.after(mark);
  }
  for (const li of ui.treeRoot.querySelectorAll<HTMLElement>("li[data-path]")) {
    const mark = readLinkMark(li.dataset["path"] ?? "", "note");
    if (mark) li.querySelector(".row-name")?.after(mark);
  }
}

function said(e: ContractError): string {
  if (e.kind === "prove_first") return rl.proveFirst;
  if (unreachableAt(e) !== null) {
    told(e.kind, e.message, e);
    return failureText(e);
  }
  return e.message;
}

/** A link made or revoked may want a fresh proof (ADR 0083 item 6); a
 *  browser's pages ask on their own (`web/proof.ts`). */
function proved<T>(call: () => Promise<{ status: "ok"; data: T } | { status: "error"; error: ContractError }>) {
  return withServerProof(call, document.documentElement.dataset["host"] === "server" ? null : askServerProof);
}

const day = (epoch: number | null): string => (epoch === null ? "" : dateFmt.format(new Date(epoch * 1000)));

/** What a link points at, in words. */
function target(kind: string, path: string): string {
  if (kind === "folder" && path === "") return rl.whole;
  return `${kind === "note" ? rl.kindNote : rl.kindFolder} “${name(path)}”`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A revocation asked first, in the dialog: the button becomes the question. */
function askFirst(where: HTMLElement, question: string, yes: () => Promise<void>): void {
  const box = h("div", "share-ask");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", question);
  const ok = h("button", "btn danger", rl.yes);
  ok.type = "button";
  const no = h("button", "btn quiet", rl.cancel);
  no.type = "button";
  const back = Array.from(where.childNodes);
  no.addEventListener("click", () => where.replaceChildren(...back));
  ok.addEventListener("click", () => void yes());
  box.append(h("p", "share-ask-text", question), ok, no);
  where.replaceChildren(box);
  ok.focus();
}

/** The dialog of the read links of the folder or the note at `path`. */
export function openReadLinkDialog(kind: "folder" | "note", path: string): void {
  // A folder this app serves: the window sits first (ADR 0117 D4 Q3).
  if (servedHere()) {
    void seatFirst().then((ok) => ok && drawReadLinkDialog(kind, path));
    return;
  }
  drawReadLinkDialog(kind, path);
}

function drawReadLinkDialog(kind: "folder" | "note", path: string): void {
  const overlay = h("div", "quick share-overlay");
  const dialog = h("div", "web-dialog share-dialog read-link-dialog");
  overlay.append(dialog);
  const titleId = "read-link-title";
  const title = h("h2", "web-dialog-title", kind === "folder" && path === "" ? rl.titleWhole(folderName) : rl.title(name(path)));
  title.id = titleId;
  const status = h("p", "share-status");
  status.setAttribute("role", "status");
  const warn = h("p", "read-link-warn");
  warn.setAttribute("role", "status");
  const list = h("ul", "share-people");
  list.setAttribute("aria-label", rl.live);
  const made = h("div", "read-link-made");
  made.hidden = true;
  const close = () => {
    overlay.remove();
    closed(overlay);
  };
  asDialog(overlay, "", close, titleId);

  const draw = () => {
    markReadLinks();
    const mine = linksAt(kind, path);
    list.replaceChildren(
      ...(mine.length === 0
        ? [h("li", "share-empty", rl.none)]
        : mine.map((l) => {
            const li = h("li", "share-person");
            const who = h("span", "share-who");
            const facts = [
              l.expires === null ? rl.noExpiry : rl.expiresOn(day(l.expires)),
              l.last_opened === null ? rl.neverOpened : rl.lastOpened(day(l.last_opened)),
              ...(l.has_password ? [rl.withPassword] : []),
              ...(l.open > 0 ? [rl.openNow(l.open)] : []),
            ];
            who.append(h("strong", "", rl.madeBy(l.made_by, day(l.made_at))), h("small", "", facts.join(" · ")));
            const actions = h("span", "share-person-actions");
            const url = addresses.get(l.id);
            const again = h("button", "btn quiet", rl.copy);
            again.type = "button";
            again.setAttribute("aria-label", url ? rl.copyAddress : rl.noAddress);
            again.disabled = !url;
            again.title = url ? rl.copyAddress : rl.noAddress;
            again.addEventListener("click", () => {
              if (url) void copy(url).then((ok) => (status.textContent = ok ? rl.copied : rl.copyFailed));
            });
            const revoke = h("button", "btn quiet", rl.revoke);
            revoke.type = "button";
            revoke.setAttribute("aria-label", rl.revokeNamed(target(kind, path)));
            revoke.addEventListener("click", () =>
              askFirst(actions, rl.confirmRevoke, async () => {
                const r = await proved(() => commands.readLinkRevoke(l.id));
                if (r.status !== "ok") {
                  status.textContent = said(r.error);
                  draw();
                  return;
                }
                addresses.delete(l.id);
                await loadReadLinks();
                status.textContent = rl.revoked;
                draw();
                (dialog.querySelector("select") as HTMLElement | null)?.focus();
              }),
            );
            actions.append(again, revoke);
            li.append(who, actions);
            return li;
          })),
    );
  };

  // The form: expiry, an optional password, "Make link".
  const form = h("form", "share-form");
  const expId = "read-link-expiry";
  const expLabel = h("label", "", rl.expiry);
  expLabel.htmlFor = expId;
  const expiry = h("select", "share-role");
  expiry.id = expId;
  for (const [value, text] of [["", rl.expNone], ["1", rl.exp1], ["7", rl.exp7], ["30", rl.exp30], ["date", rl.expDate]] as const) {
    const o = h("option", "", text);
    o.value = value;
    expiry.append(o);
  }
  const dateLabel = h("label", "", rl.expDateLabel);
  dateLabel.htmlFor = "read-link-date";
  const date = h("input");
  date.type = "date";
  date.id = "read-link-date";
  date.min = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  dateLabel.hidden = date.hidden = true;
  expiry.addEventListener("change", () => {
    dateLabel.hidden = date.hidden = expiry.value !== "date";
    if (!date.hidden) date.focus();
  });
  const passLabel = h("label", "", rl.password);
  passLabel.htmlFor = "read-link-password";
  const password = h("input");
  password.type = "password";
  password.id = "read-link-password";
  password.autocomplete = "new-password";
  password.minLength = 6;
  password.setAttribute("aria-describedby", "read-link-password-hint");
  const hint = h("small", "settings-hint", rl.passwordHint);
  hint.id = "read-link-password-hint";
  const create = h("button", "btn", rl.create);
  create.type = "submit";
  form.append(expLabel, expiry, dateLabel, date, passLabel, password, hint, create);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let expiresDays: number | null = null;
    let expiresAt: number | null = null;
    if (expiry.value === "date") {
      if (!date.value) return void (status.textContent = rl.needDate);
      // The end of that day, where the person is.
      expiresAt = Math.floor(new Date(`${date.value}T23:59:59`).getTime() / 1000);
      if (expiresAt * 1000 <= Date.now()) return void (status.textContent = rl.badDate);
    } else if (expiry.value) {
      expiresDays = Number(expiry.value);
    }
    create.disabled = true;
    status.textContent = rl.creating;
    void proved(() => commands.readLinkCreate(kind, path, expiresDays, expiresAt, password.value || null)).then(async (r) => {
      create.disabled = false;
      if (r.status !== "ok") return void (status.textContent = said(r.error));
      addresses.set(r.data.link.id, r.data.url);
      password.value = "";
      await loadReadLinks();
      const ok = await copy(r.data.url);
      status.textContent = ok ? rl.madeCopied : rl.made;
      const field = h("input");
      field.readOnly = true;
      field.value = r.data.url;
      field.id = "read-link-address";
      field.addEventListener("focus", () => field.select());
      const label = h("label", "", rl.address);
      label.htmlFor = field.id;
      made.replaceChildren(label, field, h("small", "settings-hint", rl.addressNote));
      made.hidden = false;
      draw();
      field.focus();
      field.select();
    });
  });

  const footer = h("div", "web-actions share-actions");
  const done = h("button", "btn", rl.close);
  done.type = "button";
  done.addEventListener("click", close);
  footer.append(done);
  dialog.append(title, h("p", "settings-hint", rl.lead), warn, h("h3", "read-link-sub", rl.live), list, form, made, status, footer);
  document.body.append(overlay);
  opened(overlay);
  expiry.focus();

  // What the server says: on or off, the live links, and how many notes
  // hold secrets (item 7) before one is made.
  void loadReadLinks().then(() => {
    if (!enabled) {
      form.hidden = true;
      // At its own server's table, the switch is in this app's Settings.
      warn.textContent = isSeated() ? rl.offHere : rl.off;
      warn.classList.add("read-link-off");
    } else {
      void commands.readLinkSecrets(kind, path).then((r) => {
        if (r.status === "ok" && r.data > 0) warn.textContent = rl.secrets(r.data);
      });
    }
    draw();
  });
}
