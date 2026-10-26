// A window served over plain HTTP from another machine (ADR 0073 item 6,
// amended 2026-10-16): the browser gives it no secure context, so the
// window says what is off instead of failing — a line where the feature
// lives, one notice a session, a way to read how to turn HTTPS on — and the
// two things it can still do without one keep working: copying, hashing.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "http://192.168.1.20:7340/", settings: { navigation: { disableMainFrameNavigation: true } } });
for (const name of ["window", "document", "location", "HTMLElement", "HTMLDialogElement", "Node", "Element", "sessionStorage", "localStorage", "DOMException"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
const secure = (on) => Object.defineProperty(win, "isSecureContext", { value: on, configurable: true });

await esbuild.build({
  stdin: {
    contents: `
      export { plainHttp, plainHttpLine, plainHttpMark, plainHttpNotice } from "./src/web/plainHttp";
      export { ensureClipboard } from "./src/web/clipboard";
      export { sha256Hex } from "./src/demoImport";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/plainHttp.test-bundle.mjs",
  logLevel: "error",
});
const { plainHttp, plainHttpLine, plainHttpMark, plainHttpNotice, ensureClipboard, sha256Hex } = await import("./.bundles/plainHttp.test-bundle.mjs");

beforeEach(() => {
  // The window's notices row, where the bar goes (never the page's body).
  document.body.innerHTML = '<main class="work"><div class="work-notices"></div></main>';
  localStorage.clear();
  secure(false);
});

test("over http that the browser does not call secure, the line carries the way to HTTPS", () => {
  assert.equal(plainHttp(), true);
  const line = plainHttpLine("Sem HTTPS.");
  assert.ok(line);
  assert.match(line.textContent, /Sem HTTPS\./);
  assert.ok(line.querySelector("button.plain-http-how"), "the way back is a button in the line");
  secure(true);
  assert.equal(plainHttp(), false);
  assert.equal(plainHttpLine("Sem HTTPS."), null, "a secure context says nothing");
});

test("the notice shows until closed, then stays closed for this server (it survives a reload)", () => {
  plainHttpNotice();
  const bar = document.querySelector(".plain-http-bar");
  assert.ok(bar, "shown");
  assert.equal(bar.getAttribute("role"), "status");
  bar.querySelector(".plain-http-close").click();
  assert.equal(document.querySelector(".plain-http-bar"), null);
  plainHttpNotice();
  assert.equal(document.querySelector(".plain-http-bar"), null, "not again for this server");
  secure(true);
  localStorage.clear();
  plainHttpNotice();
  assert.equal(document.querySelector(".plain-http-bar"), null, "never on a secure page");
});

test("with no notices row the bar is never put in the page's body", () => {
  document.body.replaceChildren();
  plainHttpNotice();
  assert.equal(document.querySelector(".plain-http-bar"), null);
});

test("the way to HTTPS opens a dialog that can be closed", () => {
  plainHttpNotice();
  const how = document.querySelector(".plain-http-bar .plain-http-how");
  // happy-dom has no modal dialogs: the dialog's own methods are stubbed.
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  how.click();
  const dialog = document.querySelector("dialog.plain-http-dialog");
  assert.ok(dialog?.open);
  assert.match(dialog.textContent, /VERSO_PUBLIC_URL/);
  dialog.querySelector("button").click();
  assert.equal(document.querySelector("dialog.plain-http-dialog"), null);
});

test("copying works with no navigator.clipboard, by the selection command", async () => {
  Object.defineProperty(win.navigator, "clipboard", { value: undefined, configurable: true });
  const copied = [];
  document.execCommand = (cmd) => {
    copied.push([cmd, document.querySelector("textarea")?.value]);
    return true;
  };
  ensureClipboard();
  await win.navigator.clipboard.writeText("[[Nota]]");
  assert.deepEqual(copied, [["copy", "[[Nota]]"]]);
  assert.equal(document.querySelector("textarea"), null, "the field is gone");
  await assert.rejects(win.navigator.clipboard.readText());
  // A picture needs the real clipboard: refused, so the caller can say why.
  await assert.rejects(win.navigator.clipboard.write([]), { name: "NotAllowedError" });
});

test("a hash needs no crypto.subtle", async () => {
  const saved = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  try {
    assert.equal(await sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: saved, configurable: true });
  }
});

test("the status bar keeps a mark that lists what is off, and says nothing when secure", () => {
  document.body.innerHTML = '<footer class="status-bar"><span class="status-keys"></span></footer>';
  plainHttpMark();
  plainHttpMark();
  const marks = document.querySelectorAll(".status-plain-http");
  assert.equal(marks.length, 1, "one mark, however often asked");
  assert.equal(marks[0].nextElementSibling?.className, "status-keys", "before the keys");
  marks[0].click();
  const dialog = document.querySelector("dialog.plain-http-dialog");
  assert.ok(dialog, "a click opens the list");
  const items = [...dialog.querySelectorAll(".plain-http-off li")].map((li) => li.textContent);
  // The network first, then each feature (offline, notifications, passkeys,
  // installing, the board's picture), in the window's language.
  assert.equal(items.length, 6, items.join(" | "));
  assert.match(items[0], /network|rede/i);
  assert.match(items.join(" "), /offline/i);
  assert.match(items.join(" "), /passkeys/i);
  document.body.innerHTML = '<footer class="status-bar"><span class="status-keys"></span></footer>';
  secure(true);
  plainHttpMark();
  assert.equal(document.querySelector(".status-plain-http"), null, "nothing on a secure page");
});
