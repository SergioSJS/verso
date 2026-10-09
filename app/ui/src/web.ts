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
import { el } from "./web/form";
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
  // The window itself.
  document.documentElement.dataset.host = "server";
  startBridge(chooseFolder);
  addEventListener("verso:role", (e) => {
    const role = (e as CustomEvent<string | null>).detail;
    document.documentElement.dataset.role = role ?? "";
    if (role === "reader") notice(w().readOnlyBanner);
  });
  await import("./main");
  // The way to the account's page and, for an admin, the server's, beside
  // the window's own status bar.
  const bar = document.querySelector(".status-bar");
  if (bar) {
    const links = el("span", { class: "web-links" }, el("a", { href: "/account" }, w().account));
    if (s.account.admin) links.append(el("a", { href: "/admin" }, w().admin));
    bar.append(links);
  }
}

void start().catch((e: unknown) => {
  console.error(e);
  notice(w().failed, "error");
});
