// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The account and the administration when the server serves no window
// (`verso serve` without `--web`, ADR 0073): the same sections the
// window's settings show, on a page of their own drawn as the settings
// are — the side with its sections, the rows at the right.

import { type Account } from "./api";
import { accountEntries } from "./account";
import { brand, el, type Entry, type Item } from "./form";
import { setLang, w } from "./strings";
import { icon } from "../icons";

let ids = 0;

/** `SettingsDialog.item`, for a page without the dialog. */
const item: Item = (title, desc, control) => {
  const id = `web-setting-${++ids}`;
  const titleEl = el("div", { class: "setting-title", id: `${id}-title` }, title);
  const descEl = el("div", { class: "setting-desc", id: `${id}-desc` }, desc);
  const row = el("div", { class: "setting" }, el("div", { class: "setting-text" }, titleEl, descEl));
  if (control) {
    const field = control.matches("input, select") ? control : control.querySelector<HTMLElement>("input, select");
    if (title && !field?.hasAttribute("aria-label")) field?.setAttribute("aria-labelledby", titleEl.id);
    if (field && desc) field.setAttribute("aria-describedby", descEl.id);
    row.append(control);
  }
  return row;
};

export function settingsPage(me: Account, first: "account" | "admin", lead?: string): void {
  setLang(me.lang);
  const s = w();
  const sections: { id: "account" | "admin"; label: string; icon: string; entries: () => Entry[] }[] = [
    { id: "account", label: s.account, icon: "user", entries: () => accountEntries(me, item) },
  ];
  let current = sections.some((x) => x.id === first) ? first : "account";
  document.body.classList.add("web-mode");
  document.querySelector(".web-page")?.remove();
  const nav = el("nav", { class: "settings-nav", "aria-label": s.appName });
  const body = el("div", { class: "settings-body" });
  const mark = brand(28);
  const side = el("div", { class: "settings-side" }, mark, nav);
  const paint = () => {
    const sec = sections.find((x) => x.id === current) ?? sections[0];
    if (!sec) return;
    document.title = `${sec.label} — Verso`;
    nav.replaceChildren(
      ...sections.map((x) => {
        const b = el("button", { type: "button", class: "settings-nav-item", "aria-current": String(x.id === current) });
        b.append(icon(x.icon), el("span", {}, x.label));
        b.addEventListener("click", () => {
          current = x.id;
          history.replaceState(null, "", `/${x.id}`);
          paint();
        });
        return b;
      }),
    );
    const frag: Node[] = [el("h1", { class: "settings-title" }, sec.label)];
    if (lead) frag.push(el("p", { class: "settings-hint" }, lead));
    for (const e of sec.entries()) frag.push(el("h2", { class: "settings-subheading" }, e.group), e.node());
    body.replaceChildren(...frag);
  };
  const main = el("main", { class: "web-page web-settings" }, el("div", { class: "settings-box" }, side, body));
  document.body.append(main);
  paint();
}
