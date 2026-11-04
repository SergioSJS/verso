// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "This app is a server" (ADR 0096): the settings' section that turns it
// on and off, ticks the folders served, lists the paired phones with
// Revoke, and shows the log; the pairing dialog (a QR, the address and a
// code to type, a countdown, and "Was it you?"); and the mark in the
// status bar while it serves. Every action says what happened, failures
// included, where the person acted.

import { listen } from "@tauri-apps/api/event";
import { commands, type ContractError, type LocalAddressChoice, type LocalFolder, type LocalLink, type LocalPairState, type LocalPairing, type LocalServerStatus } from "../bindings";
import { button, h, ui } from "../dom";
import { errorSentence } from "../errors";
import { icon } from "../icons";
import { phoneConnectedHeard, serveDroppedHeard, serveStoppedHeard } from "../notify/sources";
import { busy } from "../reach";
import { asDialog, closed, opened } from "./a11y";
import { servedFolders } from "./servedFolders";
import { localStrings } from "./localServerStrings";
import { linkBoxes, linkSentence, whyOf } from "./localServerLink";
import { linkStrings } from "./localServerLinkStrings";
import { invitations } from "./localServerInvites";
import { accountsBlock } from "./localServerAccounts";
import { playersBlock } from "./localServerPlayers";
import { hearSeat, onSeatChange, seatBlock, seatOnMark, setOpener } from "./localServerSeat";
import type { openFolderBy } from "../open";
import { drawQr } from "./qr";

/** What the host emits as `local-server` (verso_server::local::Event). */
type Heard =
  | { kind: "changed" }
  | { kind: "asked" }
  | { kind: "phoneConnected"; name: string }
  | { kind: "stopped"; why: string }
  | { kind: "dropped"; what: string[] }
  | { kind: "unreachable" }
  | { kind: "pairingEnded"; why: string };

const EXPLAINED = "verso-local-server-explained";

function when(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en");
}

/** `address:port` as a person types it. */
function where(s: LocalServerStatus): string {
  const a = s.addresses[0] ?? "?";
  return `${a.includes(":") ? `[${a}]` : a}:${s.port ?? "?"}`;
}

/* ---------- The status bar's mark, and what the host tells ---------- */

let heard = false;
let mark: HTMLElement | null = null;
const redraws = new Set<() => void>();

/** Refresh what shows the mode's state: the mark, and the section if it
 *  is on screen. */
async function refreshMark(): Promise<void> {
  const r = await commands.localServerStatus();
  if (r.status !== "ok" || !r.data.supported) return markOff();
  const s = r.data;
  if (!s.serving) return markOff();
  const w = localStrings();
  // An app that started serving by itself before this window listened.
  if (s.dropped.length > 0) serveDroppedHeard(w.droppedSaid(s.dropped.join(", ")));
  if (!mark) {
    mark = h("span", "ls-mark");
    mark.id = "local-mark";
    mark.setAttribute("role", "status");
    const text = h("span", "ls-mark-text");
    const stop = button("ghost ls-mark-stop", w.markStop);
    stop.textContent = w.markStop;
    stop.setAttribute("aria-label", w.markStopLabel);
    stop.addEventListener("click", () => {
      busy(stop, true);
      void commands.localServerStop().then(() => {
        busy(stop, false);
        // The host tells of a stop by itself, not of this one: the mark and
        // the section follow what the person did.
        void refreshMark();
        for (const redraw of redraws) redraw();
      });
    });
    mark.append(icon("globe"), text, stop);
    ui.status.after(mark);
  }
  const text = mark.querySelector<HTMLElement>(".ls-mark-text");
  // The internet link is said in the mark while it is on (ADR 0117 D3
  // item 6): nothing listens on the internet without being visible.
  const linkOn = s.link.state === "on" || s.link.state === "starting";
  if (text) text.textContent = linkOn ? linkStrings().markLink : w.mark(s.phones_connected);
  mark.title = linkOn && s.link.origin ? s.link.origin : where(s);
  seatOnMark(mark);
}

function markOff(): void {
  mark?.remove();
  mark = null;
}

/** Listen to the host, once: the mark follows, a phone's first connection
 *  and a stop by itself are notifications (ADR 0084), a phone asking opens
 *  the question wherever the person is. */
export function hearLocalServer(open: typeof openFolderBy): void {
  if (heard) return;
  heard = true;
  setOpener(open);
  void listen<Heard>("local-server", (e) => {
    const p = e.payload;
    void refreshMark();
    for (const redraw of redraws) redraw();
    if (p.kind === "phoneConnected") phoneConnectedHeard(p.name);
    else if (p.kind === "stopped") serveStoppedHeard(localStrings().stoppedNet);
    // A start, the person's or the app's own (keep on), left out chosen
    // folders that are gone from the disk.
    else if (p.kind === "dropped") serveDroppedHeard(localStrings().droppedSaid(p.what.join(", ")));
    else if (p.kind === "asked") openPairing();
  });
  // The internet link (ADR 0117 D3 item 6): the mark and the section
  // follow; a link that ended by itself is said where the person reads.
  hearSeat();
  onSeatChange(() => {
    void refreshMark();
    for (const redraw of redraws) redraw();
  });
  void listen<LocalLink>("local-server-link", (e) => {
    void refreshMark();
    for (const redraw of redraws) redraw();
    const l = e.payload;
    if (l.state === "offline" || l.ended === "ceiling") serveStoppedHeard(`${linkStrings().linkFell}. ${linkSentence(l)}`);
  });
  void refreshMark();
}

/** How many phones are connected now, for the updater's restart dialog
 *  (ADR 0096 item 18); 0 when it does not serve. */
export async function phonesConnected(): Promise<number> {
  const r = await commands.localServerStatus();
  return r.status === "ok" && r.data.serving ? r.data.phones_connected : 0;
}

export function restartNote(n: number): string {
  return localStrings().restartPhones(n);
}

/* ---------- The section ---------- */

type Item = (title: string, desc: string, control: HTMLElement | null) => HTMLElement;

export function localServerBody(_item: Item): HTMLElement {
  const w = localStrings();
  const box = h("div", "ls");
  const said = h("p", "ls-said");
  said.setAttribute("role", "status");
  const say = (text: string): void => {
    said.textContent = text;
  };
  // The host's refusals of serving in words (a synced folder, serving on); the rest as everywhere.
  const failed = (e: ContractError | unknown) => say(whyOf(e) || w.failed);

  const lead = h("p", "ls-lead", w.lead);
  // The two boxes under the switch, and the link (ADR 0117 D1).
  const boxes = linkBoxes({ say, redraw: () => void redraw() });
  // Invitations (ADR 0117 D3 item 2).
  const invites = invitations(say);
  // The people invited: a new password, sessions, remove (ADR 0117 D9).
  const players = playersBlock(say);
  // Other people's desktop apps, read links, passkeys (ADR 0117 D9).
  const accounts = accountsBlock(say);
  // The window at its own table (ADR 0117 D4 Q3).
  const seat = seatBlock(say);
  const unsupported = h("p", "ls-warn", w.unsupported);
  unsupported.hidden = true;

  // Folders.
  const foldersHead = h("h3", "ls-h", w.foldersTitle);
  const foldersLead = h("p", "ls-help", w.foldersLead);
  const served = servedFolders({
    heading: foldersHead,
    syncsWith: w.syncsWith,
    locked: w.foldersLocked,
    none: w.noFolders,
    tick: async (key, ticked) => {
      const r = await commands.localServerTick(key, ticked);
      if (r.status !== "ok") {
        failed(r.error);
        return null;
      }
      return r.data;
    },
    subfolders: async (key) => {
      const r = await commands.localServerSubfolders(key);
      if (r.status !== "ok") {
        failed(r.error);
        return null;
      }
      return r.data;
    },
    whole: async (key) => {
      const r = await commands.localServerWhole(key);
      if (r.status !== "ok") {
        failed(r.error);
        return null;
      }
      return r.data;
    },
    choose: async (key, parts) => {
      const r = await commands.localServerParts(key, parts);
      if (r.status !== "ok") {
        failed(r.error);
        return null;
      }
      return r.data;
    },
  });
  const folders = served.el;
  // Run.
  const run = h("button", "btn primary", w.turnOn);
  run.type = "button";
  const state = h("p", "ls-state");
  state.setAttribute("role", "status");
  // The system refusing what comes in, with the steps to allow it.
  const blocked = h("div", "ls-warn");
  blocked.setAttribute("role", "alert");
  blocked.hidden = true;
  const keep = h("input");
  keep.type = "checkbox";
  keep.id = "ls-keep";
  const keepLabel = h("label", "ls-check");
  keepLabel.htmlFor = keep.id;
  keepLabel.append(keep, h("span", "", w.keepOn));
  const keepHelp = h("p", "ls-help", w.keepOnDesc);
  // Phones connected at once, at most (item 13, amended 2026-10-16).
  const most = h("input");
  most.type = "number";
  most.min = "1";
  most.max = "16";
  most.step = "1";
  most.id = "ls-most";
  most.inputMode = "numeric";
  // Its own row, not a check's: a box 16 px wide hid the number (the
  // maintainer, 2026-10-16). − and + for a finger beside it.
  const mostLabel = h("div", "ls-number");
  const mostName = h("label", "", w.maxConnected);
  mostName.htmlFor = most.id;
  const step = (by: number, label: string): HTMLButtonElement => {
    const b = h("button", "btn ls-step", by < 0 ? "−" : "+");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => {
      const n = Math.min(16, Math.max(1, Math.trunc(Number(most.value) || 0) + by));
      if (String(n) === most.value) return;
      most.value = String(n);
      most.dispatchEvent(new Event("change"));
    });
    return b;
  };
  const mostSteps = h("span", "ls-steps");
  mostSteps.append(step(-1, w.maxConnectedFewer), most, step(1, w.maxConnectedMore));
  mostLabel.append(mostName, mostSteps);
  const mostHelp = h("p", "ls-help", w.maxConnectedDesc);
  const pair = h("button", "btn", w.pair);
  pair.type = "button";
  const pairHelp = h("p", "ls-help", w.pairNeedsOn);
  // Phones.
  const phonesHead = h("h3", "ls-h", w.pairedTitle);
  const phones = h("ul", "ls-phones");
  const danger = h("div", "ls-danger");
  // Certificate.
  const cert = h("div", "ls-cert");
  // Log.
  const log = h("details", "ls-log");

  let status: LocalServerStatus | null = null;

  const confirmRow = (ask: string, yes: () => void, back: HTMLElement): HTMLElement => {
    const row = h("div", "ls-confirm");
    row.setAttribute("role", "alertdialog");
    row.setAttribute("aria-label", ask);
    const yesBtn = h("button", "btn danger", w.yes);
    yesBtn.type = "button";
    const no = h("button", "btn", w.cancel);
    no.type = "button";
    row.append(h("span", "", ask), yesBtn, no);
    yesBtn.addEventListener("click", () => {
      row.replaceWith(back);
      yes();
    });
    no.addEventListener("click", () => {
      row.replaceWith(back);
      back.focus();
    });
    queueMicrotask(() => no.focus());
    return row;
  };

  const drawFolders = served.draw;

  const drawCert = (s: LocalServerStatus) => {
    cert.replaceChildren(h("h3", "ls-h", w.certTitle), h("p", "ls-help", s.certificate === "files" ? w.certFiles : w.certOwn));
    if (s.fingerprint) {
      const fp = h("p", "ls-fp");
      fp.append(h("strong", "", `${w.fingerprint}: `), h("code", "", s.fingerprint));
      cert.append(fp);
    }
    if (s.tailscale) cert.append(h("p", "ls-help", w.tailscale));
    const details = h("details", "ls-adv");
    details.append(h("summary", "", w.advanced));
    const form = h("form", "ls-adv-form");
    const field = (label: string, value: string | null, id: string): HTMLInputElement => {
      const l = h("label", "srv-label", label);
      l.htmlFor = id;
      const i = h("input");
      i.id = id;
      i.type = "text";
      i.value = value ?? "";
      i.spellcheck = false;
      i.setAttribute("autocomplete", "off");
      i.addEventListener("keydown", (e) => e.stopPropagation());
      form.append(l, i);
      return i;
    };
    const c = field(w.certFile, s.cert_file, "ls-cert-file");
    const k = field(w.keyFile, s.key_file, "ls-key-file");
    const n = field(w.hostName, s.host_name, "ls-host-name");
    const save = h("button", "btn", w.saveCert);
    save.type = "submit";
    form.append(save);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      busy(save, true);
      void commands.localServerSettings(s.keep_on, c.value, k.value, n.value, s.max_connected).then((r) => {
        busy(save, false);
        if (r.status !== "ok") return failed(r.error);
        say(w.saved);
        void redraw();
      });
    });
    details.append(form);
    cert.append(details);
  };

  const drawPhones = async (s: LocalServerStatus) => {
    const r = await commands.localServerPhones();
    phones.replaceChildren();
    if (r.status !== "ok") return failed(r.error);
    if (r.data.length === 0) phones.append(h("li", "ls-help", w.pairedNone));
    for (const p of r.data) {
      const li = h("li", "ls-phone");
      const who = h("div", "ls-phone-who");
      who.append(h("strong", "", w.phone(p.name, p.role)), h("small", "", w.phoneWhen(when(p.paired), when(p.last_seen), p.address)));
      const revoke = h("button", "btn", w.revoke);
      revoke.type = "button";
      revoke.setAttribute("aria-label", w.revokeNamed(p.name));
      revoke.addEventListener("click", () => {
        busy(revoke, true);
        void commands.localServerRevoke(p.id).then((res) => {
          busy(revoke, false);
          if (res.status !== "ok") return failed(res.error);
          say(w.revoked);
          void redraw();
        });
      });
      // Reader or editor, changed here without pairing again; a phone that
      // is connected has it from its next command.
      const mayEdit = h("input");
      mayEdit.type = "checkbox";
      mayEdit.id = `ls-edit-${p.id}`;
      mayEdit.checked = p.role === "editor";
      mayEdit.setAttribute("aria-label", w.mayEditNamed(p.name));
      const mayLabel = h("label", "ls-check", w.mayEdit);
      mayLabel.htmlFor = mayEdit.id;
      mayLabel.prepend(mayEdit);
      mayEdit.addEventListener("change", () => {
        const editor = mayEdit.checked;
        mayEdit.disabled = true;
        void commands.localServerPhoneRole(p.id, editor).then((res) => {
          mayEdit.disabled = false;
          if (res.status !== "ok") {
            mayEdit.checked = !editor;
            return failed(res.error);
          }
          say(w.roleNow(p.name, editor));
          void redraw();
        });
      });
      const acts = h("div", "ls-phone-acts");
      acts.append(mayLabel, revoke);
      li.append(who, acts);
      phones.append(li);
    }
    const on = s.port !== null ? w.serving(where(s)) : linkStrings().servingLinkOnly;
    state.textContent = s.serving ? `${on} ${w.phones(s.phones_paired, s.phones_connected)}.` : `${w.off} ${w.phones(s.phones_paired, 0)}.`;
  };

  const drawDanger = () => {
    danger.replaceChildren();
    const forget = h("button", "btn", w.forgetAll);
    forget.type = "button";
    forget.addEventListener("click", () => {
      forget.replaceWith(
        confirmRow(
          w.forgetAsk,
          () =>
            void commands.localServerForget().then((r) => {
              if (r.status !== "ok") return failed(r.error);
              say(w.forgotten(r.data));
              void redraw();
            }),
          forget,
        ),
      );
    });
    const replace = h("button", "btn", w.replaceId);
    replace.type = "button";
    replace.addEventListener("click", () => {
      replace.replaceWith(
        confirmRow(
          w.replaceAsk,
          () =>
            void commands.localServerReplaceIdentity().then((r) => {
              if (r.status !== "ok") return failed(r.error);
              say(w.replaced);
              void redraw();
            }),
          replace,
        ),
      );
    });
    danger.append(forget, replace, h("p", "ls-help", w.replaceIdDesc));
  };

  const drawLog = async () => {
    const r = await commands.localServerAudit();
    log.replaceChildren(h("summary", "", w.logTitle));
    if (r.status !== "ok") return;
    const list = h("ul", "ls-log-list");
    if (r.data.length === 0) list.append(h("li", "ls-help", w.logEmpty));
    for (const e of r.data.slice(0, 60)) {
      const li = h("li");
      const what = w.actions[e.action] ?? e.action;
      li.append(h("time", "", when(e.at)), ` · ${what}`);
      if (e.subject) li.append(` · ${e.subject}`);
      if (e.address) li.append(` · ${e.address}`);
      list.append(li);
    }
    log.append(list, h("p", "ls-help", w.logKept));
  };

  const redraw = async (): Promise<void> => {
    const r = await commands.localServerStatus();
    if (r.status !== "ok") return failed(r.error);
    status = r.data;
    const s = r.data;
    void refreshMark();
    unsupported.hidden = s.supported;
    for (const el of [foldersHead, foldersLead, folders, run, state, boxes.el, invites.el, players.el, accounts.el, seat.el, keepLabel, keepHelp, mostLabel, mostHelp, pair, pairHelp, phonesHead, phones, danger, cert, log]) el.hidden = !s.supported;
    if (!s.supported) return;
    keep.checked = s.keep_on;
    most.value = String(s.max_connected);
    run.textContent = s.serving ? w.turnOff : w.turnOn;
    blocked.hidden = !(s.serving && s.unreachable);
    if (!blocked.hidden) {
      const mac = /mac/i.test(navigator.platform);
      const windows = /win/i.test(navigator.platform);
      const steps = mac ? w.unreachableMac : windows ? w.unreachableWindows : w.unreachableLinux(s.port);
      blocked.replaceChildren(h("p", "", w.unreachable), h("p", "ls-help", steps));
    }
    // Pairing is the network's (a phone on the same Wi-Fi): not with the
    // internet link alone.
    const onNet = s.serving && s.port !== null;
    pair.disabled = !onNet;
    pairHelp.hidden = onNet;
    pairHelp.textContent = s.serving ? linkStrings().pairNeedsNetwork : w.pairNeedsOn;
    boxes.draw(s);
    if (!s.serving && s.stopped_because) say(w.stoppedNet);
    const f = await commands.localServerFolders();
    if (f.status === "ok") drawFolders(f.data, s.serving);
    seat.draw(s, f.status === "ok" ? f.data : []);
    await invites.draw(s, f.status === "ok" ? f.data : []);
    await players.draw(s);
    await accounts.draw(s);
    await drawPhones(s);
    drawCert(s);
    drawDanger();
    await drawLog();
  };
  redraws.add(() => void redraw());

  run.addEventListener("click", () => {
    void (async () => {
      if (status?.serving) {
        busy(run, true);
        const r = await commands.localServerStop();
        busy(run, false);
        if (r.status !== "ok") return failed(r.error);
        say(w.off);
        return redraw();
      }
      // At least one box (ADR 0117 D1): the network, the link, or both.
      const net = status?.network ?? true;
      const link = boxes.wanted();
      if (!net && !link) return say(linkStrings().tickOne);
      if (net) {
        // The system's prompts are the network's (ADR 0096 item 9).
        if (!(await explainFirst())) return;
        busy(run, true);
        const r = await commands.localServerStart();
        busy(run, false);
        if (r.status !== "ok") return failed(r.error);
        say(w.serving(where(r.data)));
        // Chosen folders no longer on the disk were left out: said here and
        // in the notifications, not only in the row.
        if (r.data.dropped.length > 0) {
          const said = w.droppedSaid(r.data.dropped.join(", "));
          say(said);
        }
      }
      if (link) {
        busy(run, true);
        await boxes.turnOn();
        busy(run, false);
      }
      return redraw();
    })();
  });
  most.addEventListener("change", () => {
    const s = status;
    if (!s) return;
    const n = Math.trunc(Number(most.value));
    if (!(n >= 1 && n <= 16)) {
      most.value = String(s.max_connected);
      return say(w.maxConnectedBad);
    }
    void commands.localServerSettings(s.keep_on, s.cert_file, s.key_file, s.host_name, n).then((r) => {
      if (r.status !== "ok") {
        most.value = String(s.max_connected);
        return failed(r.error);
      }
      status = r.data;
      say(w.maxConnectedNow(n));
    });
  });
  keep.addEventListener("change", () => {
    const s = status;
    if (!s) return;
    void commands.localServerSettings(keep.checked, s.cert_file, s.key_file, s.host_name, s.max_connected).then((r) => {
      if (r.status !== "ok") {
        keep.checked = !keep.checked;
        return failed(r.error);
      }
      status = r.data;
    });
  });
  pair.addEventListener("click", () => openPairing());

  // In the order a person goes through it: whether it serves and the switch,
  // then what it serves, then the phones, then what is rarely touched.
  const runRow = h("div", "ls-run");
  runRow.append(state, run);
  const block = (...items: HTMLElement[]): HTMLElement => {
    const b = h("div", "ls-block");
    b.append(...items);
    return b;
  };
  box.append(
    block(lead, unsupported, runRow, said, boxes.el, blocked, keepLabel, keepHelp),
    block(foldersHead, foldersLead, folders),
    block(seat.el),
    block(invites.el),
    block(players.el),
    block(accounts.el),
    block(phonesHead, pair, pairHelp, phones, mostLabel, mostHelp),
    block(cert, danger, log),
  );
  void redraw();
  return box;
}

/* ---------- Before the first turn-on (item 9) ---------- */

/** Say what the system will ask and why, once; false when the person
 *  backs out. */
function explainFirst(): Promise<boolean> {
  const w = localStrings();
  let known = false;
  try {
    known = localStorage.getItem(EXPLAINED) === "1";
  } catch {
    // No storage: asked each time.
  }
  if (known) return Promise.resolve(true);
  return new Promise((resolve) => {
    const el = h("div", "quick");
    const box = h("div", "plan-box ls-dialog");
    const title = h("h2", "", w.firstTitle);
    title.id = "ls-first-title";
    const body = w.firstBody.map((t) => h("p", "ls-help", t));
    const go = h("button", "btn primary", w.firstGo);
    go.type = "button";
    const no = h("button", "btn", w.cancel);
    no.type = "button";
    const actions = h("div", "confirm-actions");
    actions.append(no, go);
    box.append(title, ...body, actions);
    el.append(box);
    document.body.append(el);
    const done = (ok: boolean) => {
      closed(el);
      el.remove();
      if (ok) {
        try {
          localStorage.setItem(EXPLAINED, "1");
        } catch {
          // Asked again next time.
        }
      }
      resolve(ok);
    };
    asDialog(el, w.firstTitle, () => done(false), "ls-first-title");
    go.addEventListener("click", () => done(true));
    no.addEventListener("click", () => done(false));
    opened(el);
    go.focus();
  });
}

/* ---------- The pairing dialog ---------- */

let dialog: HTMLElement | null = null;

/** Open the pairing dialog: a window of two minutes while it stays open;
 *  closing it ends the window. A phone that presents the token raises the
 *  question here — "Was it you?" — and only Allow lets it in. */
export function openPairing(): void {
  if (dialog) return;
  const w = localStrings();
  const el = h("div", "quick");
  dialog = el;
  const box = h("div", "plan-box ls-dialog");
  const title = h("h2", "", w.pairTitle);
  title.id = "ls-pair-title";
  const body = h("div", "ls-pair-body");
  const live = h("p", "ls-state");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  const ask = h("section", "ls-ask");
  ask.hidden = true;
  const close = h("button", "btn", w.closeDialog);
  close.type = "button";
  const actions = h("div", "confirm-actions");
  actions.append(close);
  box.append(title, body, live, ask, actions);
  el.append(box);
  document.body.append(el);
  let timer = 0;
  let alive = true;
  const finish = (say?: string) => {
    if (!alive) return;
    alive = false;
    window.clearInterval(timer);
    void commands.localServerPairClose();
    closed(el);
    el.remove();
    dialog = null;
    if (say) ui.status.textContent = say;
    // The section shows who is paired now; in the app the host's event
    // says so too, in a harness nothing else does.
    for (const redraw of redraws) redraw();
  };
  asDialog(el, w.pairTitle, () => finish(), "ls-pair-title");
  close.addEventListener("click", () => finish());
  opened(el);
  close.focus();

  let shown = false;
  let askedKey = "";
  const drawAsk = (state: LocalPairState) => {
    const a = state.asked;
    if (!a) {
      ask.hidden = true;
      actions.hidden = false;
      askedKey = "";
      return;
    }
    // The two answers are the dialog's actions while a phone waits (each
    // ends the window); a Close under them was a third button alone on a
    // row of its own.
    actions.hidden = true;
    const key = `${a.device}|${a.asked}`;
    if (key === askedKey) return;
    askedKey = key;
    ask.hidden = false;
    ask.replaceChildren(h("h3", "ls-h", w.asked));
    const facts = h("dl", "ls-facts");
    // The phone's name as it gave it, isolated: a name in another
    // direction does not turn the words around it.
    const named = h("dd");
    named.append(h("bdi", "", a.device));
    const when_ = new Date(a.asked);
    facts.append(
      h("dt", "", w.askedDevice),
      named,
      h("dt", "", w.askedAddress), h("dd", "", a.address), h("dt", "", w.askedWhen), h("dd", "", Number.isNaN(when_.getTime()) ? a.asked : when_.toLocaleString()));
    const editor = h("input");
    editor.type = "checkbox";
    editor.id = "ls-editor";
    const editorLabel = h("label", "ls-check");
    editorLabel.htmlFor = editor.id;
    editorLabel.append(editor, h("span", "", w.canEdit));
    const allow = h("button", "btn primary", w.allow);
    allow.type = "button";
    const refuse = h("button", "btn", w.refuse);
    refuse.type = "button";
    const answer = (yes: boolean) => {
      busy(allow, true);
      busy(refuse, true);
      void commands.localServerAnswer(yes, editor.checked).then((r) => {
        if (r.status !== "ok") {
          busy(allow, false);
          busy(refuse, false);
          live.textContent = errorSentence(r.error) || w.failed;
          return;
        }
        finish(yes ? w.allowed : w.refusedDone);
      });
    };
    allow.addEventListener("click", () => answer(true));
    refuse.addEventListener("click", () => answer(false));
    const row = h("div", "confirm-actions");
    row.append(refuse, allow);
    ask.append(facts, editorLabel, h("p", "ls-help", w.canEditDesc), row);
    refuse.focus();
  };

  const poll = async () => {
    const r = await commands.localServerPairState();
    if (!alive) return;
    if (r.status !== "ok") {
      live.textContent = errorSentence(r.error) || w.failed;
      return;
    }
    const s = r.data;
    if (!s.open && !s.asked) {
      window.clearInterval(timer);
      live.textContent = shown ? w.expired : w.failed;
      return;
    }
    if (s.open) live.textContent = s.asked ? "" : `${w.waitingPhone} ${w.expires(s.remaining)}`;
    drawAsk(s);
  };

  // Opens the window for `address` (none: the best one). Picking another
  // address opens a new window — a new token and code — and redraws.
  const load = (address: string | null, again: boolean) =>
    commands.localServerPairOpen(address).then((r) => {
      if (!alive) {
        void commands.localServerPairClose();
        return;
      }
      if (r.status !== "ok") {
        live.textContent = errorSentence(r.error) || w.failed;
        return;
      }
      shown = true;
      drawPairing(body, r.data, (a) => {
        void load(a, true);
      });
      if (again) {
        live.textContent = w.addressNew(r.data.chosen);
        body.querySelector<HTMLElement>("#ls-address")?.focus();
      } else {
        window.clearInterval(timer);
        timer = window.setInterval(() => void poll(), 1000);
        void poll();
      }
    });
  void load(null, false);
}

/** "192.168.3.122 — en7 (rede local)": what a choice says, for the list. */
export function choiceLabel(c: LocalAddressChoice): string {
  const w = localStrings();
  const what = c.kind === "virtual" ? w.addressVirtual(c.hint) : w.addressLan;
  return `${c.address} — ${c.interface} (${what})`;
}

function drawPairing(body: HTMLElement, p: LocalPairing, pick: (address: string) => void): void {
  const w = localStrings();
  body.replaceChildren(h("p", "ls-help", w.pairSteps), drawQr(p.qr, w.qrLabel));
  const facts = h("dl", "ls-facts");
  const addr = h("dd", "ls-big");
  addr.append(h("code", "", `https://${p.address}/pair`));
  // Which address, on which interface; the list lets the person pick
  // another (a native list: keyboard and screen reader for free).
  if (p.choices.length > 0) {
    const row = h("p", "ls-pick");
    const label = h("label", "ls-help", w.addressPick);
    label.htmlFor = "ls-address";
    row.append(label);
    if (p.choices.length > 1) {
      const sel = h("select");
      sel.id = "ls-address";
      sel.setAttribute("aria-describedby", "ls-address-help");
      for (const c of p.choices) {
        const o = h("option", "", choiceLabel(c));
        o.value = c.address;
        o.selected = c.address === p.chosen;
        sel.append(o);
      }
      sel.addEventListener("change", () => pick(sel.value));
      row.append(sel);
    } else {
      const only = h("span", "ls-only", p.choices.map(choiceLabel).join(""));
      only.id = "ls-address";
      only.tabIndex = -1;
      row.append(only);
    }
    const help = h("span", "ls-help", w.addressHelp);
    help.id = "ls-address-help";
    body.append(row, help);
  }
  const code = h("dd", "ls-big");
  code.append(h("code", "ls-code", p.code));
  facts.append(h("dt", "", w.address), addr, h("dt", "", w.code), code);
  body.append(facts);
  // The same link the QR encodes, for a phone that cannot scan or a
  // message to oneself: it carries the same one-time token, in the part
  // after `#` that no server (nor a messenger's preview) receives.
  const copy = h("button", "btn", w.copyLink);
  copy.type = "button";
  const copied = h("p", "ls-help");
  copied.setAttribute("role", "status");
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(p.url).then(
      () => { copied.textContent = w.linkCopied; },
      () => { copied.textContent = w.linkNotCopied; },
    );
  });
  body.append(copy, copied);
  if (p.certificate === "own") {
    body.append(h("p", "ls-help", w.trustOwn));
    const fp = h("p", "ls-fp");
    fp.append(h("strong", "", `${w.fingerprint}: `), h("code", "", p.fingerprint));
    body.append(fp);
  }
}
