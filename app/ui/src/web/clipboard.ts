// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// `navigator.clipboard` exists only in a secure context: on a page served
// over plain HTTP from another machine it is `undefined`, and every
// "copy link" of the window would throw. There, writing falls back to the
// old copy command on a field made for the moment; reading the clipboard
// stays refused, as the browser refuses it without a gesture anyway
// (ADR 0073 item 6, amended 2026-10-16).

/** Copy `text` with the selection command; rejects when the browser says no. */
export function copyBySelection(text: string): Promise<void> {
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
  document.body.append(field);
  // `select()` does nothing on a read-only field in iOS Safari.
  field.setSelectionRange(0, text.length);
  field.select();
  let done = false;
  try {
    done = document.execCommand("copy");
  } catch {
    done = false;
  }
  field.remove();
  before?.focus();
  return done ? Promise.resolve() : Promise.reject(new DOMException("the browser refused to copy", "NotAllowedError"));
}

/** Give the page a `navigator.clipboard` where the browser gives none. */
export function ensureClipboard(): void {
  if (navigator.clipboard) return;
  const fallback = {
    writeText: copyBySelection,
    readText: () => Promise.reject(new DOMException("reading the clipboard needs HTTPS", "NotAllowedError")),
    // Pictures and other types need the real clipboard, which needs HTTPS:
    // refused, and the callers say so (the board's export dialog).
    write: () => Promise.reject(new DOMException("copying a picture needs HTTPS", "NotAllowedError")),
  };
  Object.defineProperty(navigator, "clipboard", { value: fallback, configurable: true });
}
