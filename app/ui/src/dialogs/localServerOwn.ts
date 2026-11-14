// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// *Usar meu endereço* (ADR 0117 D10 (a)), under the link's box: the three
// steps a person does by hand, written where they read them — own a
// domain and add it to Cloudflare, sign in in the browser, type the
// hostname — and the app's part behind two buttons. Once set up: the
// address, the choice between it and a quick link, and Remove (with a
// way to forget it here alone when Cloudflare cannot be asked).

import { commands, type LocalServerStatus } from "../bindings";
import { button, h } from "../dom";
import { busy } from "../reach";
import type { Ctx } from "./localServerLink";
import { linkStrings, linkWhy } from "./localServerLinkStrings";
import { localStrings } from "./localServerStrings";
import { errorSentence } from "../errors";

/** Cloudflare's own page on adding a domain (D10 item 1). */
export const ADD_SITE = "https://developers.cloudflare.com/fundamentals/manage-domains/add-site/";

function why(e: unknown): string {
  const message = (e as { message?: unknown } | null)?.message;
  return (typeof message === "string" && linkWhy(message, linkStrings())) || errorSentence(e);
}

export function ownAddress(ctx: Ctx): { el: HTMLElement; draw: (s: LocalServerStatus) => void } {
  const w = linkStrings();
  const el = h("details", "ls-adv ls-own");
  el.append(h("summary", "", w.ownTitle));
  const body = h("div", "ls-own-body");
  const live = h("p", "ls-state");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  el.append(body, live);

  const say = (text: string) => {
    live.textContent = text;
  };

  /** Before an address exists: the three steps. */
  const steps = (s: LocalServerStatus): HTMLElement[] => {
    const howTo = button("btn", w.ownHowTo);
    howTo.addEventListener("click", () => void commands.openUrl(ADD_SITE));
    const login = button("btn", w.ownLogin);
    const byHand = h("p", "ls-help");
    byHand.hidden = true;
    login.addEventListener("click", () => {
      busy(login, true);
      say(w.ownWaiting);
      void commands.localServerOwnAddressLogin().then((r) => {
        busy(login, false);
        if (r.status !== "ok") return say(why(r.error));
        const l = r.data;
        if (l.signed_in) {
          say(l.already ? w.ownAlready : w.ownLoggedIn);
          return ctx.redraw();
        }
        say(w.ownLoginFailed(l.why ?? ""));
        // The page cloudflared printed, for a browser that did not open.
        const url = l.url;
        if (url) {
          const open = button("btn", w.ownOpenByHand);
          open.addEventListener("click", () => void commands.openUrl(url));
          byHand.replaceChildren(open);
          byHand.hidden = false;
        }
      });
    });
    const form = h("form", "ls-adv-form");
    const label = h("label", "srv-label", w.ownHost);
    label.htmlFor = "ls-own-host";
    const host = h("input");
    host.id = "ls-own-host";
    host.type = "text";
    host.inputMode = "url";
    host.spellcheck = false;
    host.autocomplete = "off";
    host.setAttribute("autocapitalize", "none");
    host.addEventListener("keydown", (e) => e.stopPropagation());
    const setUp = h("button", "btn primary", w.ownSetUp);
    setUp.type = "submit";
    form.append(label, host, setUp);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      busy(setUp, true);
      say(w.ownSettingUp);
      void commands.localServerOwnAddressSetUp(host.value).then((r) => {
        busy(setUp, false);
        if (r.status !== "ok") {
          say(why(r.error));
          host.focus();
          return;
        }
        const name = r.data.own_address?.hostname ?? host.value;
        say(w.ownDone(name));
        ctx.redraw();
      });
    });
    const signed = s.cloudflare_signed_in ? [h("p", "ls-help", w.ownSignedIn)] : [];
    return [
      h("p", "ls-help", w.ownLead),
      h("p", "ls-help", w.ownStep1),
      howTo,
      h("p", "ls-help", w.ownStep2),
      ...signed,
      login,
      byHand,
      h("p", "ls-help", w.ownStep3),
      form,
    ];
  };

  /** Once set up: the address, the mode, Remove. */
  const setUpRows = (s: LocalServerStatus, hostname: string): HTMLElement[] => {
    const use = h("input");
    use.type = "checkbox";
    use.id = "ls-own-use";
    use.checked = s.link_own;
    const linkUp = s.link.state === "on" || s.link.state === "starting";
    use.disabled = linkUp;
    const useLabel = h("label", "ls-check");
    useLabel.htmlFor = use.id;
    useLabel.append(use, h("span", "", w.ownUse));
    use.addEventListener("change", () => {
      const own = use.checked;
      use.disabled = true;
      void commands.localServerLinkMode(own).then((r) => {
        use.disabled = false;
        if (r.status !== "ok") {
          use.checked = !own;
          return say(why(r.error));
        }
        say(w.ownUseNow(own));
        ctx.redraw();
      });
    });
    const remove = button("btn", w.ownRemove);
    const removeRow = h("div", "ls-own-remove");
    removeRow.append(remove);
    const ask = () => {
      const row = h("div", "ls-confirm");
      row.setAttribute("role", "alertdialog");
      row.setAttribute("aria-label", w.ownRemove);
      const yes = h("button", "btn danger", w.ownRemove);
      yes.type = "button";
      const no = h("button", "btn", localStrings().cancel);
      no.type = "button";
      row.append(h("span", "", w.ownRemoveAsk), yes, no);
      no.addEventListener("click", () => {
        removeRow.replaceChildren(remove);
        remove.focus();
      });
      yes.addEventListener("click", () => {
        busy(yes, true);
        void commands.localServerOwnAddressRemove(false).then((r) => {
          if (r.status === "ok") {
            say(w.ownRemoved);
            return ctx.redraw();
          }
          // Cloudflare could not be asked: forgetting here is the way back.
          busy(yes, false);
          say(w.ownRemoveFailed(r.error.message));
          const here = button("btn", w.ownForgetHere);
          here.addEventListener("click", () => {
            busy(here, true);
            void commands.localServerOwnAddressRemove(true).then((r2) => {
              busy(here, false);
              if (r2.status !== "ok") return say(why(r2.error));
              say(w.ownForgotten);
              ctx.redraw();
            });
          });
          removeRow.replaceChildren(remove, here);
          here.focus();
        });
      });
      removeRow.replaceChildren(row);
      queueMicrotask(() => no.focus());
    };
    remove.addEventListener("click", ask);
    const rows: HTMLElement[] = [h("p", "ls-fp", w.ownIs(hostname)), useLabel];
    if (linkUp) rows.push(h("p", "ls-help", w.ownModeLocked));
    rows.push(removeRow);
    return rows;
  };

  let drawn = "";
  const draw = (s: LocalServerStatus) => {
    // Redrawn only when what it shows changed: a field being typed in, or
    // a confirmation open, is not replaced under the person.
    const key = JSON.stringify([s.own_address?.hostname ?? null, s.link_own, s.cloudflare_signed_in, s.link.state]);
    if (key === drawn) return;
    drawn = key;
    const hostname = s.own_address?.hostname;
    body.replaceChildren(...(hostname ? setUpRows(s, hostname) : steps(s)));
    // The address set up says itself open: it is what the link uses.
    if (hostname) el.open = true;
  };
  return { el, draw };
}
