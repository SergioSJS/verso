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
import { notice } from "./web/notice";
import { chooseFolder, devicePage, invitePage, resetPage, setupPage, signInLinkPage, signInPage } from "./web/pages";
import { setLang, w } from "./web/strings";

async function start(): Promise<void> {
  const s = await state();
  setLang(s.account?.lang);
  const path = location.pathname;
  const token = (prefix: string) => decodeURIComponent(path.slice(prefix.length));
  if (path.startsWith("/invite/")) return invitePage(token("/invite/"));
  if (path.startsWith("/reset/")) return resetPage(token("/reset/"));
  if (path.startsWith("/signin-link/")) return signInLinkPage(token("/signin-link/"));
  if (path === "/setup") return setupPage();
  if (path === "/device") return devicePage(s.account);
  if (!s.account) {
    if (path !== "/signin") {
      location.href = `/signin?next=${encodeURIComponent(path + location.search)}`;
      return;
    }
    return signInPage(s.secure, s.mail);
  }
  if (path === "/signin") {
    location.href = "/";
    return;
  }
  // The account and the administration are sections of the window's
  // settings: their addresses open the window with the settings there.
  const section = path === "/account" ? "account" : path === "/admin" && s.account.admin ? "admin" : null;
  // Without the window (`verso serve` without `--web`), the same sections
  // on a page of their own.
  if (!s.web) {
    const { settingsPage } = await import("./web/standalone");
    settingsPage(s.account, section ?? "account", w().noWeb);
    if (path !== "/account" && path !== "/admin") history.replaceState(null, "", "/account");
    return;
  }
  if (path === "/account" || path === "/admin") history.replaceState(null, "", "/");
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
  const window_ = await import("./main");
  if (section) {
    const { loadCan } = await import("./can");
    await loadCan();
    window_.settingsDialog.show(section);
  }
}

void start().catch((e: unknown) => {
  console.error(e);
  notice(w().failed, "error");
});
