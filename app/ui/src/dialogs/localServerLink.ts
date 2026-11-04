// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The two boxes under the switch of *Transformar em servidor* (ADR 0117
// D1, D4 Q2) and the internet link's panel (D3 item 6): *Na minha rede* is
// a setting, changed while serving is off; *Por um link na internet* is
// the link itself — ticked while serving, it turns on at once; ticked
// before, it turns on with the server; it is never kept across starts.
// While on, the link is always visible: its address with Copy and a QR,
// the time left with Extend, and the state in a live region. Every
// failure says why, in words (`linkWhy`).

import { commands, type ContractError, type LocalLink, type LocalServerStatus } from "../bindings";
import { button, h } from "../dom";
import { errorSentence } from "../errors";
import { busy } from "../reach";
import { clockAt, linkStrings, linkWhy, timeLeft } from "./localServerLinkStrings";
import { ownAddress } from "./localServerOwn";
import { drawQr } from "./qr";

export type Ctx = {
  /** Say a sentence in the section's live line. */
  say: (text: string) => void;
  /** Draw the section again from the host's status. */
  redraw: () => void;
};

/** A box busy while its command runs: not ticked again under it. */
function hold(box: HTMLInputElement, on: boolean): void {
  box.disabled = on;
  if (on) box.setAttribute("aria-busy", "true");
  else box.removeAttribute("aria-busy");
}

/** A refusal of the link's path in words; the rest as everywhere. */
export function whyOf(e: ContractError | unknown): string {
  const message = (e as { message?: unknown } | null)?.message;
  return (typeof message === "string" && linkWhy(message, linkStrings())) || errorSentence(e);
}

/** What the panel's live line says for the link `l`. */
export function linkSentence(l: LocalLink): string {
  const w = linkStrings();
  if (l.state === "starting") return w.starting;
  if (l.state === "on") return l.own ? w.onOwn : w.on;
  if (l.state === "offline") return w.offline;
  return (l.ended && w.ended[l.ended]) || w.off;
}

export type Boxes = {
  el: HTMLElement;
  /** The link's box is ticked (before a start, the person's wish). */
  wanted: () => boolean;
  draw: (s: LocalServerStatus) => void;
  /** Turn the link on now; says how it went. */
  turnOn: () => Promise<boolean>;
};

export function linkBoxes(ctx: Ctx): Boxes {
  const w = linkStrings();
  const el = h("div", "ls-boxes");
  el.setAttribute("role", "group");
  const title = h("h3", "ls-h", w.boxesTitle);
  title.id = "ls-boxes-title";
  el.setAttribute("aria-labelledby", title.id);

  const check = (id: string, label: string, help: string): [HTMLInputElement, HTMLElement, HTMLElement] => {
    const input = h("input");
    input.type = "checkbox";
    input.id = id;
    const helpEl = h("p", "ls-help ls-box-help", help);
    helpEl.id = `${id}-help`;
    input.setAttribute("aria-describedby", helpEl.id);
    const row = h("label", "ls-check ls-box");
    row.htmlFor = id;
    row.append(input, h("span", "", label));
    return [input, row, helpEl];
  };
  const [net, netRow, netHelp] = check("ls-network", w.network, w.networkDesc);
  const [link, linkRow, linkHelp] = check("ls-link", w.linkBox, w.linkDesc);
  const testing = h("p", "ls-help ls-testing", w.linkTesting);

  // The link's panel, shown while it is wanted, starting, on or just ended.
  const panel = h("div", "ls-link");
  const live = h("p", "ls-state ls-link-state");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  const where = h("div", "ls-link-where");
  const left = h("p", "ls-help ls-link-left");
  left.id = "ls-link-left";
  const extend = button("btn", w.extend);
  extend.type = "button";
  extend.setAttribute("aria-describedby", left.id);
  const notes = h("div", "ls-link-notes");
  const own = ownAddress(ctx);
  panel.append(live, where, left, extend, notes);
  el.append(title, netRow, netHelp, linkRow, linkHelp, testing, panel, own.el);

  let status: LocalServerStatus | null = null;
  let wish = false;
  let timer = 0;
  let shownOrigin = "";

  const tick = () => {
    const l = status?.link;
    if (!el.isConnected) {
      window.clearInterval(timer);
      timer = 0;
      return;
    }
    if (!l || l.state !== "on" || l.until === null) {
      left.textContent = l?.state === "on" ? w.noCeiling : "";
      return;
    }
    const { h: hours, m } = timeLeft(l.until, Date.now());
    left.textContent = w.left(hours, m, clockAt(l.until, document.documentElement.lang));
  };

  const drawWhere = (l: LocalLink) => {
    if (l.state !== "on" || !l.origin) {
      where.replaceChildren();
      shownOrigin = "";
      return;
    }
    // The same address drawn once: a redraw keeps the QR open if it was.
    if (shownOrigin === l.origin) return;
    shownOrigin = l.origin;
    const origin = l.origin;
    const line = h("p", "ls-fp ls-link-url");
    line.append(h("strong", "", `${w.address}: `), h("code", "", origin));
    const copy = button("btn", w.copy);
    copy.type = "button";
    const copied = h("p", "ls-help");
    copied.setAttribute("role", "status");
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(origin).then(
        () => (copied.textContent = w.copied),
        () => (copied.textContent = w.notCopied),
      );
    });
    const qr = h("details", "ls-adv ls-link-qr");
    qr.append(h("summary", "", w.showQr));
    if (l.qr.length > 0) qr.append(drawQr(l.qr, w.qrLabel(origin)));
    where.replaceChildren(line, copy, copied, qr);
  };

  const draw = (s: LocalServerStatus) => {
    status = s;
    const l = s.link;
    const up = l.state === "on" || l.state === "starting";
    net.checked = s.network;
    net.disabled = s.serving;
    netHelp.textContent = s.serving ? `${w.networkDesc} ${w.networkLocked}` : w.networkDesc;
    if (up) wish = true;
    else if (s.serving) wish = false;
    link.checked = wish;
    link.disabled = l.state === "starting";
    panel.hidden = !(wish || up || l.state === "offline" || (l.ended !== null && l.ended !== "stopped" && l.ended !== "quit"));
    // Said only while shown: a hidden line is no one's to read.
    live.textContent = panel.hidden ? "" : !up && wish && !s.serving ? w.linkLater : linkSentence(l);
    drawWhere(l);
    extend.hidden = !(l.state === "on" && l.until !== null);
    notes.replaceChildren();
    if (l.state === "on" && l.protocol === "http2") notes.append(h("p", "ls-help", w.http2));
    if (l.state === "on" && !l.own) notes.append(h("p", "ls-help", w.newEachRun));
    if (up) notes.append(h("p", "ls-help", w.credits));
    tick();
    if (l.state === "on" && !timer) timer = window.setInterval(tick, 30_000);
    own.draw(s);
  };

  const turnOn = async (): Promise<boolean> => {
    hold(link, true);
    live.textContent = w.starting;
    ctx.say(w.starting);
    const r = await commands.localServerLinkOn();
    hold(link, false);
    if (r.status !== "ok") {
      wish = false;
      link.checked = false;
      const said = whyOf(r.error);
      live.textContent = said;
      ctx.say(said);
      ctx.redraw();
      return false;
    }
    ctx.say(linkSentence(r.data));
    ctx.redraw();
    return true;
  };

  net.addEventListener("change", () => {
    const on = net.checked;
    void commands.localServerNetwork(on).then((r) => {
      if (r.status !== "ok") {
        net.checked = !on;
        return ctx.say(whyOf(r.error));
      }
      ctx.say(w.networkNow(on));
      ctx.redraw();
    });
  });
  link.addEventListener("change", () => {
    wish = link.checked;
    if (!status?.serving) {
      // Turned on with the server; said so where the person looks.
      panel.hidden = !wish;
      live.textContent = wish ? w.linkLater : "";
      return;
    }
    if (wish) {
      void turnOn();
      return;
    }
    hold(link, true);
    void commands.localServerLinkOff().then((r) => {
      hold(link, false);
      if (r.status !== "ok") {
        link.checked = true;
        wish = true;
        return ctx.say(whyOf(r.error));
      }
      ctx.say(w.off);
      ctx.redraw();
    });
  });
  extend.addEventListener("click", () => {
    busy(extend, true);
    void commands.localServerLinkExtend().then((r) => {
      busy(extend, false);
      if (r.status !== "ok") return ctx.say(whyOf(r.error));
      const at = r.data.until === null ? "" : clockAt(r.data.until, document.documentElement.lang);
      ctx.say(w.extended(at));
      ctx.redraw();
    });
  });

  return { el, wanted: () => wish, draw, turnOn };
}
