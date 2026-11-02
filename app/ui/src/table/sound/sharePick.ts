// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio, the dialogs and the way through them (ADR 0116 section B,
// items 16, 21, 26): the source picker (apps by their display name, never a
// window title, with a quality choice folded under it), the first-share
// notice (shown once per person), the question before one share replaces
// another, and `shareAudio()`, the button's whole flow. The page's own
// dialog look (`confirm`, `confirm-box`): focus inside, Tab kept in, Escape
// and a click outside cancel.

import type { AudioSource } from "../../bindings";
import { h } from "../../dom";
import { icon } from "../../icons";
import { said } from "./controls";
import { liveShare } from "./share";
import { mine, sources, startOwn } from "./mine";
import { PAGES_ID, ss } from "./shareWords";
import { st } from "./strings";

const BITRATES = [64, 96, 128] as const;
const DEFAULT_KBPS = 96;
const SEEN = "verso.share-audio-notice-seen";

const KIND_ICON: Record<AudioSource["kind"], string> = { app: "music", page: "globe", system: "volume" };

/** A dialog: `build` fills the box and gives back the focus target; `finish(v)` closes it with `v`. */
function dialog<T>(cancel: T, build: (box: HTMLElement, finish: (v: T) => void) => HTMLElement | null, cls = ""): Promise<T> {
  return new Promise<T>((resolve) => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shade = h("div", "confirm");
    const box = h("div", `confirm-box share-pick ${cls}`.trim());
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    let done = false;
    const finish = (v: T): void => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      shade.remove();
      if (back?.isConnected) back.focus();
      resolve(v);
    };
    const first = build(box, finish);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(cancel);
      } else if (e.key === "Tab") {
        const items = [...box.querySelectorAll<HTMLElement>("button, input, select, summary")].filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
        e.preventDefault();
        items[next]?.focus();
      }
    };
    shade.addEventListener("mousedown", (e) => {
      if (e.target === shade) {
        e.preventDefault();
        finish(cancel);
      }
    });
    document.addEventListener("keydown", onKey, true);
    shade.append(box);
    document.body.append(shade);
    first?.focus();
  });
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", cls, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

let titleSeq = 0;
function heading(box: HTMLElement, text: string): HTMLElement {
  const t = h("h2", "share-pick-title", text);
  t.id = `share-pick-title-${++titleSeq}`;
  box.setAttribute("aria-labelledby", t.id);
  box.append(t);
  return t;
}

/** The source picker: what to capture and at which quality, or null. */
export async function chooseSource(): Promise<{ source: AudioSource; kbps: number } | null> {
  const { list, why } = await sources();
  return dialog<{ source: AudioSource; kbps: number } | null>(null, (box, finish) => {
    heading(box, ss.pickTitle);
    box.append(h("p", "share-pick-help", ss.pickHelp));
    let chosen: AudioSource | null = list[0] ?? null;
    const start = button(ss.start, "save share-pick-start", () => chosen && finish({ source: chosen, kbps: Number(quality.value) }));
    const quality = h("select", "share-pick-quality");
    quality.id = "share-pick-quality";
    quality.setAttribute("aria-label", ss.quality);
    for (const n of BITRATES) {
      const o = h("option", "", ss.kbps(n));
      o.value = String(n);
      o.selected = n === DEFAULT_KBPS;
      quality.append(o);
    }
    let focus: HTMLElement | null = null;
    if (list.length === 0) {
      const none = h("p", "share-pick-none", why ?? ss.noSources);
      none.setAttribute("role", "status");
      box.append(none);
      start.disabled = true;
    } else {
      const set = h("fieldset", "share-pick-sources");
      set.append(h("legend", "share-pick-legend", ss.sources));
      for (const [i, src] of list.entries()) {
        const row = h("label", "share-pick-source");
        const radio = h("input", "");
        radio.type = "radio";
        radio.name = "share-pick-source";
        radio.value = src.id;
        radio.checked = i === 0;
        radio.addEventListener("change", () => (chosen = src));
        row.append(radio, icon(KIND_ICON[src.kind], ""), h("span", "share-pick-name", src.name), h("span", "share-pick-kind", ss.kind[src.kind]));
        set.append(row);
        if (src.id === PAGES_ID) {
          const hint = h("p", "share-pick-hint share-pick-pages", ss.pagesHint);
          hint.id = "share-pick-pages-hint";
          radio.setAttribute("aria-describedby", hint.id);
          set.append(hint);
        }
        if (i === 0) focus = radio;
      }
      box.append(set);
    }
    // The quality, folded: most people never change it.
    const more = h("details", "share-pick-more");
    more.append(h("summary", "", ss.quality));
    const q = h("label", "share-pick-quality-row");
    q.append(h("span", "", ss.quality), quality);
    more.append(q, h("p", "share-pick-hint", ss.qualityHint));
    box.append(more);
    const actions = h("div", "confirm-actions");
    const cancel = button(st.cancel, "ghost share-pick-cancel", () => finish(null));
    actions.append(cancel, start);
    box.append(actions);
    return focus ?? cancel;
  });
}

/** The first-share notice (item 21): once per person, then it is not asked again. */
async function noticeAccepted(): Promise<boolean> {
  try {
    if (localStorage.getItem(SEEN)) return true;
  } catch {
    // Storage may be blocked: the notice shows each time, which is only more careful.
  }
  const ok = await dialog<boolean>(false, (box, finish) => {
    heading(box, ss.pickTitle);
    const text = h("p", "share-pick-notice", ss.notice);
    box.append(text);
    const actions = h("div", "confirm-actions");
    const cancel = button(st.cancel, "ghost", () => finish(false));
    actions.append(cancel, button(ss.noticeOk, "save share-pick-ok", () => finish(true)));
    box.append(actions);
    return cancel;
  });
  if (ok) {
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      // Nothing to keep it in: asked again next time.
    }
  }
  return ok;
}

/** One share replaces another only on a yes. */
function replaceAccepted(): Promise<boolean> {
  const live = liveShare();
  return dialog<boolean>(false, (box, finish) => {
    heading(box, ss.pickTitle);
    box.append(h("p", "share-pick-notice", ss.replaceAsk(live?.by ?? null, live?.name ?? null)));
    const actions = h("div", "confirm-actions");
    const cancel = button(st.cancel, "ghost", () => finish(false));
    actions.append(cancel, button(ss.replace, "save share-pick-replace", () => finish(true)));
    box.append(actions);
    return cancel;
  });
}

/** *Share audio…*: pick, the notice the first time, start; a refusal or a failure is said, never silent. */
export async function shareAudio(): Promise<void> {
  if (mine()) return;
  const pick = await chooseSource();
  if (!pick) return;
  if (!(await noticeAccepted())) return;
  let r = await startOwn(pick.source, pick.kbps, false);
  if (r.kind === "exists") {
    if (!(await replaceAccepted())) return;
    r = await startOwn(pick.source, pick.kbps, true);
  }
  if (r.kind === "failed") said(ss.failed(r.why));
  else if (r.kind === "exists") said(ss.failed(ss.replaceAsk(null, null)));
}
