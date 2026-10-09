// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window in a browser, served by `verso serve` (ADR 0073): `web.html`
// is the app's own page with this script in place of `main.js`
// (`build-index.mjs --web`). It asks the server who is signed in, shows the
// page the address names — sign-in, the first admin's setup, an
// invitation, a reset, a device, the account, the admin page — or, for a
// person signed in, starts the window over the bridge (`web/bridge.ts`).

import { state } from "./web/api";
import { startBridge } from "./web/bridge";
import { pullSettings, pushSettings } from "./web/settingsSync";
import { el, page } from "./web/form";
import { notice } from "./web/notice";
import { chooseFolder, devicePage, invitePage, resetPage, setupPage, signInPage } from "./web/pages";
import { setLang, w } from "./web/strings";

async function start(): Promise<void> {
  const s = await state();
  setLang(s.account?.lang);
  const path = location.pathname;
  const token = (prefix: string) => decodeURIComponent(path.slice(prefix.length));
  if (path.startsWith("/invite/")) return invitePage(token("/invite/"));
  if (path.startsWith("/reset/")) return resetPage(token("/reset/"));
  if (path === "/setup") return setupPage();
  if (path === "/device") return devicePage(s.account);
  if (!s.account) {
    if (path !== "/signin") {
      location.href = `/signin?next=${encodeURIComponent(path + location.search)}`;
      return;
    }
    return signInPage(s.secure);
  }
  if (path === "/signin") {
    location.href = "/";
    return;
  }
  if (path === "/account") {
    const { accountPage } = await import("./web/account");
    return accountPage(s.account, s.account.admin);
  }
  if (path === "/admin") {
    if (!s.account.admin) {
      location.href = "/";
      return;
    }
    const { adminPage } = await import("./web/admin");
    return adminPage(s.account);
  }
  // The window itself — only when the server serves it (`--web`).
  if (!s.web) {
    page("Verso", el("p", {}, w().noWeb), el("p", {}, el("a", { href: "/account" }, w().account)));
    return;
  }
  document.documentElement.dataset.host = "server";
  await pullSettings();
  pushSettings();
  // Ask the browser to keep this site's storage (ADR 0073 item 8): WebKit
  // is likelier to grant it to a page installed on the home screen; a
  // refusal changes nothing today, when nothing is kept offline.
  void navigator.storage?.persist?.().catch(() => false);
  startBridge(chooseFolder);
  addEventListener("verso:role", (e) => {
    const role = (e as CustomEvent<string | null>).detail;
    document.documentElement.dataset.role = role ?? "";
    if (role === "reader") notice(w().readOnlyBanner);
  });
  await import("./main");
  // The way to the account's page and, for an admin, the server's, beside
  // the window's own status bar.
  // On a phone the status bar leaves (ADR 0076 item 6): the same links
  // also end the side bar, which the bottom bar opens.
  const links = (): HTMLElement => {
    const box = el("span", { class: "web-links" }, el("a", { href: "/account" }, w().account));
    if (s.account?.admin) box.append(el("a", { href: "/admin" }, w().admin));
    return box;
  };
  document.querySelector(".status-bar")?.append(links());
  const side = links();
  side.classList.add("web-links-side");
  document.querySelector("aside.side")?.append(side);
}

void start().catch((e: unknown) => {
  console.error(e);
  notice(w().failed, "error");
});
