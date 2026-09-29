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
  /** Which button is focused by default (defaults to "no" for safety on destructive actions). */
  defaultButton?: "yes" | "no";
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

function show(message: string, opts: AskOptions): Promise<boolean> {
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
    const no = document.createElement("button");
    no.type = "button";
    no.className = "ghost";
    no.textContent = opts.no;
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "save";
    yes.textContent = opts.yes;
    const actions = document.createElement("div");
    actions.className = "confirm-actions";
    actions.append(no, yes);
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
        finish(document.activeElement === yes || (opts.defaultButton === "yes" && document.activeElement !== no));
      } else if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === yes ? no : yes).focus();
      }
    };
    // Focus stays inside.
    const onFocus = (e: FocusEvent) => {
      if (!box.contains(e.target as Node)) (opts.defaultButton === "yes" ? yes : no).focus();
    };
    yes.addEventListener("click", () => finish(true));
    no.addEventListener("click", () => finish(false));
    shade.addEventListener("mousedown", (e) => {
      if (e.target === shade) {
        e.preventDefault();
        finish(false);
      }
    });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus, true);
    document.body.append(shade);
    if (opts.defaultButton === "yes") {
      yes.focus();
    } else {
      no.focus();
    }
  });
}
