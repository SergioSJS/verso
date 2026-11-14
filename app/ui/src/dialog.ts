// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A question the page asks in its own words. Not `window.confirm`: the
// dialog plugin replaces it with an async function that calls a command
// this app does not grant, so it never asked, and its answer — a
// promise — read as yes. Here only the yes button means yes: Escape,
// the other button, a click outside or Enter anywhere else mean no.

import { focusOnOpen } from "./screen/openFocus";

export type AskOptions = {
  /** The button that means yes: what will happen. */
  yes: string;
  /** The button that means no. */
  no: string;
};

let queue: Promise<unknown> = Promise.resolve();
let asked = 0;

/** Ask, and wait: true only for an explicit yes. A question asked while
 *  another is on screen waits its turn. */
export function ask(message: string, opts: AskOptions): Promise<boolean> {
  const answer = queue.then(() => show(message, opts));
  queue = answer.catch(() => false);
  return answer;
}

/** Say something that needs no answer, and wait until it is read: one
 *  button, and every way out of `ask` closes it. */
export function tell(message: string, ok: string): Promise<void> {
  const read = queue.then(() => show(message, { yes: ok, no: null })).then(() => undefined);
  queue = read.catch(() => undefined);
  return read;
}

function show(message: string, opts: { yes: string; no: string | null }): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shade = document.createElement("div");
    shade.className = "confirm";
    const box = document.createElement("div");
    box.className = "confirm-box";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    const text = document.createElement("p");
    text.id = `verso-ask-${++asked}`;
    text.textContent = message;
    box.setAttribute("aria-labelledby", text.id);
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "save";
    yes.textContent = opts.yes;
    // The safe button, focused first. With nothing to refuse (`tell`), the
    // one button is safe.
    let no = yes;
    const actions = document.createElement("div");
    actions.className = "confirm-actions";
    if (opts.no !== null) {
      no = document.createElement("button");
      no.type = "button";
      no.className = "ghost";
      no.textContent = opts.no;
      actions.append(no);
    }
    actions.append(yes);
    box.append(text, actions);
    shade.append(box);

    let done = false;
    const finish = (answer: boolean) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus, true);
      shade.remove();
      if (back?.isConnected) back.focus();
      resolve(answer);
    };
    // While the question is open no key reaches the app behind it.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        finish(document.activeElement === yes && no !== yes);
      } else if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === yes ? no : yes).focus();
      }
    };
    // Focus stays inside.
    const onFocus = (e: FocusEvent) => {
      if (!box.contains(e.target as Node)) no.focus();
    };
    yes.addEventListener("click", () => finish(no !== yes));
    if (no !== yes) no.addEventListener("click", () => finish(false));
    shade.addEventListener("mousedown", (e) => {
      if (e.target === shade) {
        e.preventDefault();
        finish(false);
      }
    });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus, true);
    document.body.append(shade);
    no.focus();
  });
}

/** Ask for a text, and wait: the text on the yes button (or Enter; ⌘Enter
 *  in a multi-line box), null for every way out. Queued like `ask`. */
export function promptText(label: string, initial: string, multiline: boolean, opts: AskOptions): Promise<string | null> {
  const answer = queue.then(() => showPrompt(label, initial, multiline, opts));
  queue = answer.catch(() => null);
  return answer;
}

function showPrompt(label: string, initial: string, multiline: boolean, opts: AskOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shade = document.createElement("div");
    shade.className = "confirm";
    const box = document.createElement("div");
    box.className = "confirm-box prompt-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const title = document.createElement("label");
    title.id = `verso-ask-${++asked}`;
    title.textContent = label;
    const field: HTMLInputElement | HTMLTextAreaElement = multiline ? document.createElement("textarea") : document.createElement("input");
    field.id = `${title.id}-field`;
    field.className = "prompt-field";
    field.value = initial;
    if (field instanceof HTMLTextAreaElement) field.rows = 6;
    else field.type = "text";
    title.htmlFor = field.id;
    box.setAttribute("aria-labelledby", title.id);
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "save";
    yes.textContent = opts.yes;
    const no = document.createElement("button");
    no.type = "button";
    no.className = "ghost";
    no.textContent = opts.no;
    const actions = document.createElement("div");
    actions.className = "confirm-actions";
    actions.append(no, yes);
    box.append(title, field, actions);
    shade.append(box);

    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus, true);
      shade.remove();
      if (back?.isConnected) back.focus();
      resolve(value);
    };
    const order = [field, no, yes];
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      } else if (e.key === "Enter" && document.activeElement === field && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        finish(field.value);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const at = order.indexOf(document.activeElement as HTMLInputElement);
        const next = order[(at + (e.shiftKey ? order.length - 1 : 1)) % order.length];
        next?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (!box.contains(e.target as Node)) focusOnOpen(field);
    };
    yes.addEventListener("click", () => finish(field.value));
    no.addEventListener("click", () => finish(null));
    shade.addEventListener("mousedown", (e) => {
      if (e.target === shade) {
        e.preventDefault();
        finish(null);
      }
    });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus, true);
    document.body.append(shade);
    focusOnOpen(field, { select: true });
  });
}
