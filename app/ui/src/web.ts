// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window in a browser, served by `verso serve` (ADR 0073): `web.html`
// is the app's own page with this script in place of `main.js`
// (`build-index.mjs --web`). It asks the server who is signed in, shows the
// page the address names — sign-in, the first admin's setup, an
// invitation, a reset, a device, the account, the admin page — or, for a
// person signed in, starts the window over the bridge (`web/bridge.ts`).

import { setByApp, setStateFallback, state, stateWasKept } from "./web/api";
import { offline } from "./web/offline/manager";
import { o } from "./web/offline/strings";
import { currentFolderId, startBridge, startVisitorBridge } from "./web/bridge";
import { pullSettings, pushSettings } from "./web/settingsSync";
import { notice } from "./web/notice";
import { ensureClipboard } from "./web/clipboard";
import { plainHttpMark, plainHttpNotice } from "./web/plainHttp";
import { chooseFolder, devicePage, invitePage, pairPage, resetPage, setupPage, signInLinkPage, signInPage } from "./web/pages";
import { setLang, w } from "./web/strings";
import { setProver } from "./web/proof";
import { askProof } from "./web/proveDialog";
import { holdClicks } from "./earlyClicks";
import { watchDeskOnPhone } from "./deskOnPhone";
import { localSignInNotes, watchTableOffline } from "./web/localTable";
import { setPasskeysOffered } from "./web/passkeys";

// The folder button is on the page before the window's script, which this
// one imports only after the server said who is signed in: a click on it
// meanwhile is kept and made once the switcher is wired (the button shows
// it is busy until then).
watchDeskOnPhone();
const openHeld = holdClicks(document.getElementById("open"));

/** The window of a read link (ADR 0105): no account, no offline copy, no
 *  sync — the page the address names, asked of the server and shown only
 *  when the link opens (and its passphrase, if any, was proved). */
async function visitor(token: string): Promise<void> {
  const { readLinkGate, endedPage, rw } = await import("./web/readLink");
  const gate = await readLinkGate(token);
  if (!gate) return;
  document.documentElement.dataset.host = "server";
  document.documentElement.dataset.visitor = "link";
  startVisitorBridge(token, endedPage);
  addEventListener("verso:role", (e) => (document.documentElement.dataset.role = (e as CustomEvent<string | null>).detail ?? ""));
  // A link to one note opens that note: there is nothing else to choose.
  // Heard before the window starts, which shows the folder as it does.
  const { note } = gate;
  // The window of a note link is named for the note: the tree must not
  // take that note for the root's folder note and hide it.
  if (note) document.documentElement.dataset.visitorNote = "1";
  const loaded = import("./main");
  addEventListener(
    "verso:folder-shown",
    () => {
      notice(rw().banner);
      if (note) void loaded.then((m) => m.openNote(note, false));
    },
    { once: true },
  );
  await loaded;
  openHeld();
}

async function start(): Promise<void> {
  // A read link's address opens the window for whoever holds it, with no
  // account to ask for (ADR 0105); nothing of the signed-in flow runs.
  if (location.pathname.startsWith("/r/")) {
    const token = decodeURIComponent(location.pathname.slice("/r/".length)).split("/")[0] ?? "";
    return visitor(token);
  }
  // Copying works over plain HTTP too, where the browser gives no
  // clipboard of its own (ADR 0073 item 6, amended 2026-10-16).
  ensureClipboard();
  // A sensitive action the server wants proved again asks here, on any
  // page (ADR 0083 item 6).
  setProver(askProof);
  // What this browser keeps for use offline (ADR 0092), opened first: the
  // page that opens with no network is told who it is from it.
  await offline.init();
  setStateFallback(() => offline.cachedState());
  const s = await state();
  setByApp(Boolean(s.local));
  setPasskeysOffered(s.passkeys !== false);
  setLang(s.account?.lang);
  if (stateWasKept()) {
    // Offline: the folders kept open the window; nothing else is asked.
    notice(offline.keptFolders().length > 0 ? o().startOffline : o().nothingKept);
  } else if (s.account) {
    void offline.rememberState({ ...s, csrf: null });
  } else if (offline.keptFolders().length > 0) {
    // The server says nobody is signed in here: the session ended (signed
    // out in another tab, or the server ended it), and what this device
    // kept for the account goes (ADR 0092 item 6).
    const lost = await offline.wipe();
    notice(o().wipedByServer(lost), "error");
  }
  const path = location.pathname;
  const token = (prefix: string) => decodeURIComponent(path.slice(prefix.length));
  if (path.startsWith("/invite/")) return invitePage(token("/invite/"), s.account);
  if (path.startsWith("/reset/")) return resetPage(token("/reset/"));
  if (path.startsWith("/signin-link/")) return signInLinkPage(token("/signin-link/"));
  if (path === "/setup") return setupPage();
  if (path === "/device") return devicePage(s.account);
  // "This app is a server" (ADR 0096, ADR 0117 D3 item 2): the owner's
  // phone is paired (the QR's address, or a code typed at /pair) where
  // this door pairs; a person invited signs in, on the network as through
  // the internet link.
  if (s.local && !s.account) {
    const pairing = s.pairing !== false;
    if (path === "/pair" && pairing) return pairPage();
    if (path !== "/signin") {
      location.href = `/signin?next=${encodeURIComponent(path === "/pair" ? "/" : path + location.search)}`;
      return;
    }
    signInPage(false);
    localSignInNotes(pairing, s.passkeys !== false);
    return;
  }
  if (s.local && path === "/pair") {
    location.replace("/");
    return;
  }
  if (!s.account) {
    if (path !== "/signin") {
      location.href = `/signin?next=${encodeURIComponent(path + location.search)}`;
      return;
    }
    return signInPage(s.mail);
  }
  if (path === "/signin") {
    location.href = "/";
    return;
  }
  // The administration is a console of its own (ADR 0077), served with or
  // without the window.
  if (path === "/admin" || path.startsWith("/admin/")) {
    if (!s.account.admin) {
      location.href = "/";
      return;
    }
    const { consolePage } = await import("./web/console");
    consolePage(s.account);
    return;
  }
  // The account is a section of the window's settings: its address opens
  // the window with the settings there.
  const section = path === "/account" ? "account" : null;
  // Without the window (`verso serve` without `--web`), the account on a
  // page of its own.
  if (!s.web) {
    const { settingsPage } = await import("./web/standalone");
    settingsPage(s.account, "account", w().noWeb);
    if (path !== "/account") history.replaceState(null, "", "/account");
    return;
  }
  if (path === "/account") history.replaceState(null, "", "/");
  document.documentElement.dataset.host = "server";
  await pullSettings(s.account);
  pushSettings();
  // Ask the browser to keep this site's storage (ADR 0073 item 8): WebKit
  // is likelier to grant it to a page installed on the home screen; a
  // refusal changes nothing today, when nothing is kept offline.
  void navigator.storage?.persist?.().catch(() => false);
  startBridge(chooseFolder);
  // A computer that serves: its table can go away under the window (the
  // computer off, asleep, the link ended), said as the table offline.
  if (s.local) watchTableOffline();
  plainHttpNotice();
  plainHttpMark();
  // The reader's role is shown by the closed lock beside the folder's name
  // (screen/frame.ts), not by a line at the top (maintainer, 2026-10-23).
  addEventListener("verso:role", (e) => {
    const next = currentFolderId() ? (e as CustomEvent<string | null>).detail : null;
    document.documentElement.dataset.role = next ?? "";
  });
  const window_ = await import("./main");
  openHeld();
  if (section) {
    const { loadCan } = await import("./can");
    await loadCan();
    window_.settingsDialog.show(section);
  }
}

// A page left while it still loads (a link followed, a reload) has its
// module imports cut short: that is not a failure to report.
let leaving = false;
addEventListener("pagehide", () => (leaving = true));
addEventListener("beforeunload", () => (leaving = true));

void start().catch((e: unknown) => {
  if (leaving) return;
  console.error(e);
  notice(w().failed, "error");
});
