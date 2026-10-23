// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's dialog (ADR 0110): open or closed, an invitation link to
// copy, the players, "release everything" and "hide everything", the
// table's limits (the log's ceiling and an image's size), and undoing the
// table. Each change is said in the status line; a question that cannot be
// taken back is asked first, in the dialog.

import { commands, type CampaignStatus, type CampaignTable, type ContractError } from "./bindings";
import { releaseAll, releaseNotes, setTable, undoTable, campaign, tableFor } from "./campaign";
import { cp } from "./campaignStrings";
import { asDialog, closed, opened } from "./dialogs/a11y";
import { h, ui } from "./dom";
import { folderName } from "./folder";
import { name } from "./paths";
import { withServerProof } from "./serverProof";
import { askServerProof } from "./serverProver";

const MB = 1024 * 1024;

/** An invitation is a sensitive action: the desktop asks the person on the
 *  spot, a browser's pages ask themselves (ADR 0083 item 6). */
function proved<T>(call: () => Promise<{ status: "ok"; data: T } | { status: "error"; error: ContractError }>) {
  return withServerProof(call, document.documentElement.dataset.host === "server" ? null : askServerProof);
}

function table(root: string): CampaignTable | undefined {
  return campaign().tables.find((t) => t.root === root) ?? tableFor(root);
}

/** Ask first, in the dialog: the button becomes the question. */
function askFirst(where: HTMLElement, question: string, yes: () => Promise<void>): void {
  const box = h("div", "share-ask");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", question);
  const q = h("p", "share-ask-text", question);
  const ok = h("button", "btn danger", cp.yes);
  ok.type = "button";
  const no = h("button", "btn quiet", cp.cancel);
  no.type = "button";
  const back = Array.from(where.childNodes);
  no.addEventListener("click", () => where.replaceChildren(...back));
  ok.addEventListener("click", () => void yes());
  box.append(q, ok, no);
  where.replaceChildren(box);
  ok.focus();
}

/** The dialog of the table at `root` (`""` the whole folder). `undo`: it
 *  opens with the question of undoing it asked. */
export function openCampaignDialog(root: string, undo = false): void {
  const whole = root === "";
  const overlay = h("div", "quick share-overlay campaign-overlay");
  const dialog = h("div", "web-dialog share-dialog campaign-dialog");
  overlay.append(dialog);
  const title = h("h2", "web-dialog-title", whole ? cp.titleWhole(folderName) : cp.title(name(root)));
  title.id = "campaign-title";
  const status = h("p", "share-status");
  status.setAttribute("role", "status");
  const close = () => {
    overlay.remove();
    closed(overlay);
  };
  asDialog(overlay, "", close, "campaign-title");

  // Open or closed (MC.1 = A).
  const openRow = h("label", "campaign-open");
  const open = h("input");
  open.type = "checkbox";
  open.id = "campaign-open";
  openRow.append(open, h("span", "", cp.open));
  const openHint = h("p", "settings-hint", cp.openHint);
  open.addEventListener("change", () => {
    void setTable(root, { open: open.checked }, cp.saved).then((ok) => {
      if (!ok) open.checked = !open.checked;
      status.textContent = ui.status.textContent ?? "";
    });
  });

  // The invitation: a link to copy.
  const invite = h("section", "campaign-invite");
  const inviteTitle = h("h3", "campaign-sub", cp.invite);
  const inviteHint = h("p", "settings-hint", cp.inviteHint);
  const make = h("button", "btn", cp.inviteMake);
  make.type = "button";
  const made = h("div", "read-link-made");
  made.hidden = true;
  make.addEventListener("click", () => {
    void proved(() => commands.campaignInvite(root)).then((r) => {
      if (r.status !== "ok") {
        status.textContent = r.error.kind === "prove_first" ? cp.proveFirst : r.error.message;
        return;
      }
      const link = r.data.link.startsWith("/") ? `${location.origin}${r.data.link}` : r.data.link;
      const field = h("input");
      field.readOnly = true;
      field.value = link;
      field.setAttribute("aria-label", cp.inviteField);
      const copy = h("button", "btn quiet", cp.inviteCopy);
      copy.type = "button";
      copy.addEventListener("click", () => {
        void navigator.clipboard.writeText(link).then(() => (status.textContent = cp.inviteCopied));
      });
      made.replaceChildren(field, copy);
      made.hidden = false;
      field.select();
    });
  });
  invite.append(inviteTitle, inviteHint, make, made);

  // The players, as the server counts them.
  const playersTitle = h("h3", "campaign-sub", cp.players);
  const players = h("ul", "share-people");
  players.setAttribute("aria-label", cp.players);

  // Release or hide everything.
  const bulk = h("div", "web-actions share-actions campaign-bulk");
  const draw = (s: CampaignStatus) => {
    const t = s.tables.find((x) => x.root === root) ?? table(root);
    open.checked = t?.open ?? true;
    make.disabled = !s.can_invite;
    inviteHint.textContent = s.can_invite ? cp.inviteHint : `${cp.inviteHint} ${cp.inviteNeedsAdmin}`;
    players.replaceChildren(...(s.players.length === 0 ? [h("li", "share-empty", cp.noPlayers)] : s.players.map((p) => h("li", "share-person", p.name))));
    logMax.value = String(t?.log_max ?? 20000);
    imageMax.value = String(Math.round((t?.image_max ?? 10 * MB) / MB));
  };

  const release = h("button", "btn", cp.releaseAll);
  release.type = "button";
  release.addEventListener("click", () =>
    askFirst(bulk, cp.releaseAllConfirm, async () => {
      const ok = await releaseAll(root);
      status.textContent = ok ? cp.releasedAll : (ui.status.textContent ?? "");
      bulk.replaceChildren(...bulkRows());
    }),
  );
  const hide = h("button", "btn quiet", cp.hideAll);
  hide.type = "button";
  hide.addEventListener("click", () =>
    askFirst(bulk, cp.hideAllConfirm, async () => {
      const ok = await releaseNotes([root], false);
      status.textContent = ok ? cp.hiddenAll : (ui.status.textContent ?? "");
      bulk.replaceChildren(...bulkRows());
    }),
  );
  const bulkRows = () => [release, hide];
  bulk.append(...bulkRows());

  // The table's limits (MS.1).
  const limits = h("section", "campaign-limits");
  const limitsTitle = h("h3", "campaign-sub", cp.limits);
  const logMaxLabel = h("label", "", cp.logMax);
  logMaxLabel.htmlFor = "campaign-log-max";
  const logMax = h("input");
  logMax.type = "number";
  logMax.id = "campaign-log-max";
  logMax.min = "1000";
  logMax.max = "200000";
  logMax.step = "1000";
  const logHint = h("small", "settings-hint", cp.logMaxHint);
  const imageMaxLabel = h("label", "", cp.imageMax);
  imageMaxLabel.htmlFor = "campaign-image-max";
  const imageMax = h("input");
  imageMax.type = "number";
  imageMax.id = "campaign-image-max";
  imageMax.min = "1";
  imageMax.max = "30";
  const imageHint = h("small", "settings-hint", cp.imageMaxHint);
  const save = h("button", "btn", cp.save);
  save.type = "button";
  save.addEventListener("click", () => {
    void setTable(root, { logMax: Number(logMax.value), imageMax: Math.round(Number(imageMax.value) * MB) }, cp.saved).then((ok) => {
      status.textContent = ok ? cp.saved : (ui.status.textContent ?? "");
      draw(campaign());
    });
  });
  const form = h("div", "share-form");
  form.append(logMaxLabel, logMax, h("span"), logHint, imageMaxLabel, imageMax, h("span"), imageHint, save);
  limits.append(limitsTitle, form);

  // Undo the table, and close.
  const footer = h("div", "web-actions share-actions");
  const ask = () =>
    askFirst(footer, cp.undoConfirm, async () => {
      if (await undoTable(root)) {
        close();
      } else {
        footer.replaceChildren(...footerRows());
      }
    });
  const undoBtn = h("button", "btn quiet danger", cp.undoTable);
  undoBtn.type = "button";
  undoBtn.addEventListener("click", ask);
  const done = h("button", "btn", cp.close);
  done.type = "button";
  done.addEventListener("click", close);
  const footerRows = () => [undoBtn, done];
  footer.append(...footerRows());

  dialog.append(title, h("p", "settings-hint", cp.intro), openRow, openHint, invite, playersTitle, players, bulk, limits, status, footer);
  document.body.append(overlay);
  opened(overlay);
  draw(campaign());
  open.focus();
  if (undo) ask();
}
