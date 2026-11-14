// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Starting the desktop app's sign-in to a server (ADR 0074 item 8), the
// way `gh auth login` does it (decided 2026-10-14, ADR 0083 As built): the
// app copies the code to the clipboard, then opens the server's page,
// where the person pastes it — the page never takes a code from its link,
// so a link someone else sent approves nothing. The copy comes before the
// page: once the browser is in front, a WebView no longer has the focus a
// clipboard write asks for. No DOM here.

import type { ContractError, ServerSignIn } from "./bindings";

type Answer<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

/** The host's commands — ask the server for a code; open its page in the
 *  browser — and the clipboard. */
export type SignInSteps = {
  signIn: (url: string) => Promise<Answer<ServerSignIn>>;
  open: () => Promise<Answer<null>>;
  copy: (code: Promise<string>) => Promise<boolean>;
};

/** The code copied to the clipboard once the server gives it: whether it
 *  was. Called inside the click, before anything is awaited — WebKit lets a
 *  page write the clipboard only there, and takes a `ClipboardItem` whose
 *  text comes later; `writeText` once the code is known where there is no
 *  `ClipboardItem`, or it was refused. */
export function copyWhenKnown(code: Promise<string>): Promise<boolean> {
  const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clip) return Promise.resolve(false);
  const plain = () => code.then((c) => clip.writeText(c)).then(() => true, () => false);
  if (typeof ClipboardItem === "undefined" || typeof clip.write !== "function") return plain();
  try {
    const item = new ClipboardItem({ "text/plain": code.then((c) => new Blob([c], { type: "text/plain" })) });
    return clip.write([item]).then(() => true, plain);
  } catch {
    return plain();
  }
}

/** Sign in to `url`: the code asked of the server, copied, then the
 *  server's page opened. The code comes back to be shown, and whether it
 *  was copied; a server that refuses or does not answer opens nothing. */
export async function startSignIn(
  url: string,
  steps: SignInSteps,
): Promise<{ status: "ok"; code: string; copied: boolean } | { status: "error"; error: ContractError }> {
  let give: (code: string) => void = () => {};
  let none: () => void = () => {};
  const code = new Promise<string>((resolve, reject) => {
    give = resolve;
    none = () => reject(new Error("no code"));
  });
  code.catch(() => {});
  // Before the first await: still the click's turn.
  const copied = steps.copy(code).catch(() => false);
  const r = await steps.signIn(url);
  if (r.status !== "ok") {
    none();
    await copied;
    return r;
  }
  give(r.data.code);
  const done = await copied;
  const opened = await steps.open();
  // The page did not open: said as a failure, in the host's words — not as
  // a refused path, the sentence `refused` means everywhere else.
  if (opened.status !== "ok") return { status: "error", error: { kind: "failed", message: opened.error.message } };
  return { status: "ok", code: r.data.code, copied: done };
}
