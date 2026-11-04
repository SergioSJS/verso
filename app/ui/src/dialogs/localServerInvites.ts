// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// *Convidar pessoas* (ADR 0117 D3 item 2, D4 Q5 and Q8): a single-use link
// for seven days, to a folder served whole at reading or editing, or to
// no folder; the link shown once with Copy, then the list of this
// server's invitations — the table's too — with End for one still
// waiting. On the network as through the link: the host builds the link
// from the link's origin while it has one.

import { commands, type LocalFolder, type LocalServerStatus } from "../bindings";
import { button, h } from "../dom";
import { busy } from "../reach";
import { whyOf } from "./localServerLink";
import { linkStrings } from "./localServerLinkStrings";

function when(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en");
}

export function invitations(say: (text: string) => void): { el: HTMLElement; draw: (s: LocalServerStatus, folders: LocalFolder[]) => Promise<void> } {
  const w = linkStrings();
  const el = h("div", "ls-invites");
  const title = h("h3", "ls-h", w.invTitle);
  const lead = h("p", "ls-help", w.invLead);
  const form = h("form", "ls-inv-form");
  const field = (id: string, label: string, select: HTMLSelectElement): HTMLElement => {
    const row = h("p", "ls-pick");
    const l = h("label", "ls-help", label);
    l.htmlFor = id;
    select.id = id;
    row.append(l, select);
    return row;
  };
  const folder = h("select");
  const role = h("select");
  for (const [value, label] of [["reader", w.invReader], ["editor", w.invEditor]] as const) {
    const o = h("option", "", label);
    o.value = value;
    role.append(o);
  }
  const make = h("button", "btn primary", w.invMake);
  make.type = "submit";
  const needsOn = h("p", "ls-help", w.invNeedsOn);
  form.append(field("ls-inv-folder", w.invFolder, folder), field("ls-inv-role", w.invRole, role), make);
  // The link just made: said once.
  const made = h("div", "ls-inv-made");
  made.hidden = true;
  const listTitle = h("h4", "ls-h", w.invListTitle);
  const list = h("ul", "ls-phones ls-inv-list");
  list.setAttribute("aria-labelledby", "ls-inv-list-title");
  listTitle.id = "ls-inv-list-title";
  el.append(title, lead, form, needsOn, made, listTitle, list);

  let serving = false;
  /** The internet link's origin while it is on: an invitation not built
   *  from it is one of the network. */
  let origin: string | null = null;

  const showMade = (link: string, onNetwork: boolean) => {
    const line = h("p", "ls-fp");
    line.append(h("strong", "", `${w.invLink}: `), h("code", "", link));
    const copy = button("btn", w.invCopy);
    const copied = h("p", "ls-help");
    copied.setAttribute("role", "status");
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(link).then(
        () => (copied.textContent = w.invCopied),
        () => (copied.textContent = w.notCopied),
      );
    });
    made.replaceChildren(h("p", "ls-help", w.invMade), line, copy, copied);
    if (onNetwork) made.append(h("p", "ls-help", w.invOnNetwork));
    made.hidden = false;
    copy.focus();
  };

  const drawList = async () => {
    const r = await commands.localServerInvitations();
    list.replaceChildren();
    if (r.status !== "ok") return say(whyOf(r.error));
    if (r.data.length === 0) list.append(h("li", "ls-help", w.invNone));
    for (const i of r.data) {
      const li = h("li", "ls-phone");
      const what = w.invWhat(i.folder, i.role);
      const who = h("div", "ls-phone-who");
      who.append(h("strong", "", `${what} · ${w.invState(i.state, i.used_by)}`), h("small", "", w.invWhen(when(i.created), when(i.expires))));
      li.append(who);
      if (i.state === "pending") {
        const end = button("btn", w.invEnd);
        end.setAttribute("aria-label", w.invEndNamed(what));
        end.addEventListener("click", () => {
          busy(end, true);
          void commands.localServerInvitationRevoke(i.id).then((res) => {
            busy(end, false);
            if (res.status !== "ok") return say(whyOf(res.error));
            say(w.invEnded);
            void drawList();
          });
        });
        li.append(end);
      }
      list.append(li);
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(make, true);
    const key = folder.value || null;
    void commands.localServerInvite(key, role.value === "editor").then((r) => {
      busy(make, false);
      if (r.status !== "ok") return say(whyOf(r.error));
      say(w.invMade);
      showMade(r.data.link, !(origin && r.data.link.startsWith(`${origin}/`)));
      void drawList();
    });
  });
  /** The folder the person picked, kept across redraws; none picked yet,
   *  the first served folder. */
  let picked: string | null = null;
  folder.addEventListener("change", () => {
    picked = folder.value;
    // No folder, no role to give.
    role.disabled = !folder.value || !serving;
  });

  const draw = async (s: LocalServerStatus, folders: LocalFolder[]) => {
    serving = s.serving;
    origin = s.link.state === "on" ? s.link.origin : null;
    folder.replaceChildren();
    // Folders served whole: a folder served in part is the phones' alone.
    for (const f of folders.filter((f) => f.ticked && f.parts.length === 0)) {
      const o = h("option", "", f.place ? `${f.name} (${f.place})` : f.name);
      o.value = f.key;
      folder.append(o);
    }
    const none = h("option", "", w.invNoFolder);
    none.value = "";
    folder.append(none);
    if (picked !== null && [...folder.options].some((o) => o.value === picked)) folder.value = picked;
    folder.disabled = !s.serving;
    role.disabled = !s.serving || !folder.value;
    make.disabled = !s.serving;
    needsOn.hidden = s.serving;
    if (!s.serving) made.hidden = true;
    await drawList();
  };
  return { el, draw };
}
