// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The UniVerso's own Cloudflare link in the console's Server page (ADR
// 0117 D4 item 2, R5; revises ADR 0077 item 6): where it stands, its
// address with Copy, a quick link's time left; Turn on (a quick link, or
// the own address by a tunnel's token), Extend 12 hours, Turn off. The
// server asks a fresh proof to turn it on or extend it (`api` asks the
// person for it). The token typed is sent once and never shown again.

import { ApiError, api } from "./api";
import { cw } from "./consoleStrings";
import { button, el, input, snippet } from "./form";
import { bytes } from "./strings";

/** The link as the server says it (`verso_server::tunnel::json`). */
export type LinkView = {
  state: "off" | "starting" | "on" | "offline";
  origin: string | null;
  /** A quick link's end, in milliseconds since 1970. */
  until: number | null;
  own: boolean;
  ended: string | null;
  protocol: string | null;
  download: { done: number; total: number | null } | null;
  hostname: string | null;
  port: number;
  atStart: string;
  tokenSet: boolean;
  publicUrl: boolean;
};

/** The words of where the link stands. Exported for its test. */
export function linkWords(v: LinkView, now = Date.now()): string[] {
  const s = cw();
  if (v.state === "starting") {
    return [v.download ? s.linkDownload(bytes(v.download.done), v.download.total === null ? null : bytes(v.download.total)) : s.linkStarting];
  }
  if (v.state === "offline") return [s.linkOffline];
  if (v.state === "off") return [v.ended ? s.linkEnded(v.ended) : s.linkOff];
  const words = [s.linkOn];
  if (v.until !== null) {
    const left = Math.max(0, Math.round((v.until - now) / 60000));
    words.push(s.linkLeft(Math.floor(left / 60), left % 60), s.linkTesting);
  }
  return words;
}

/** The panel; it reads the link again while it starts, and every half
 *  minute while it is on (the time left). */
export async function linkPanel(): Promise<HTMLElement> {
  const s = cw();
  const panel = el("section", { class: "console-panel", "aria-labelledby": "link-title", "data-link": "" });
  const status = el("div", { role: "status", "aria-live": "polite", "data-link-state": "" });
  const said = el("p", { class: "settings-hint web-said", role: "alert" });
  const controls = el("div", { class: "console-form-row" });
  const own = el("div", { class: "console-panel", "data-link-own": "" });
  let timer: number | undefined;

  const fail = (e: unknown) => {
    said.classList.add("web-error");
    said.textContent = e instanceof ApiError ? e.said : s.failed;
  };
  const run = (b: HTMLButtonElement, work: () => Promise<LinkView>) => {
    b.addEventListener("click", () => {
      said.classList.remove("web-error");
      said.textContent = "";
      b.disabled = true;
      work()
        .then(draw)
        .catch(fail)
        .finally(() => {
          b.disabled = false;
        });
    });
  };

  const draw = (v: LinkView) => {
    window.clearTimeout(timer);
    const lines = linkWords(v).map((w) => el("p", { class: "settings-hint" }, w));
    const address = v.state === "on" && v.origin ? [el("p", {}, el("strong", {}, s.linkAddress)), snippet(v.origin, s.linkCopy, s.linkCopied)] : [];
    status.replaceChildren(...lines, ...address);
    status.dataset.state = v.state;
    const buttons: HTMLElement[] = [];
    if (v.state === "on" || v.state === "starting") {
      if (v.state === "on" && v.until !== null) {
        const extend = button(s.linkExtend, "save");
        run(extend, () => api<LinkView>("POST", "/api/admin/link/extend"));
        buttons.push(extend);
      }
      const off = button(s.linkTurnOff, "danger");
      run(off, () => api<LinkView>("DELETE", "/api/admin/link"));
      buttons.push(off);
      own.hidden = true;
    } else {
      const quick = button(s.linkQuick, "save");
      run(quick, () => api<LinkView>("POST", "/api/admin/link", { mode: "quick" }));
      buttons.push(quick);
      own.hidden = false;
      const host = input("text", { placeholder: s.linkHostname, "aria-label": s.linkHostname, autocomplete: "off", spellcheck: "false", inputmode: "url" });
      host.value = v.hostname ?? "";
      const token = input("password", { placeholder: s.linkToken, "aria-label": s.linkToken, autocomplete: "off" });
      const go = button(s.linkOwn);
      run(go, async () => {
        const body: Record<string, string> = { mode: "own", hostname: host.value.trim() };
        if (token.value.trim()) body.token = token.value.trim();
        const r = await api<LinkView>("POST", "/api/admin/link", body);
        token.value = "";
        return r;
      });
      own.replaceChildren(
        el("p", { class: "settings-hint" }, s.linkOwnLead(v.port)),
        ...(v.tokenSet ? [el("p", { class: "settings-hint" }, s.linkTokenSet)] : []),
        el("div", { class: "console-form-row" }, host, token, go),
      );
    }
    controls.replaceChildren(...buttons);
    // While starting, read again soon; while on, the time left moves.
    const again = v.state === "starting" ? 1500 : v.state === "on" ? 30000 : 0;
    if (again) {
      timer = window.setTimeout(() => {
        if (!panel.isConnected) return;
        api<LinkView>("GET", "/api/admin/link").then(draw).catch(fail);
      }, again);
    }
  };

  const first = await api<LinkView>("GET", "/api/admin/link");
  panel.append(
    el("h2", { id: "link-title", class: "console-sub" }, s.link),
    el("p", { class: "settings-hint" }, s.linkLead),
    el("p", { class: "settings-hint" }, s.linkAtStart(first.atStart)),
    ...(first.publicUrl ? [el("p", { class: "settings-hint" }, s.linkPublicUrl)] : []),
    status,
    controls,
    own,
    said,
  );
  draw(first);
  return panel;
}
