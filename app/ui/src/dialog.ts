// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A question the page asks in its own words. Not `window.confirm`: the
// dialog plugin replaces it with an async function that calls a command
// this app does not grant, so it never asked, and its answer — a
// promise — read as yes. Here only the yes button means yes: Escape,
// the other button, a click outside or Enter anywhere else mean no.

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
