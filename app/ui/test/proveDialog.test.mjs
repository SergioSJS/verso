// The question of a fresh proof (ADR 0083 item 6) as the desktop app asks
// it: the web's dialog, the password only — no passkey offered, and the
// line says so — sent by the way it is given (the host's `server_prove`),
// a wrong password said in place, true once taken, false on Cancel.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "tauri://localhost/" });
for (const name of ["window", "document", "location", "HTMLElement", "Node", "Element", "localStorage", "addEventListener", "dispatchEvent"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });

// One bundle, so that the dialog and the test share one ApiError.
await esbuild.build({
  stdin: { contents: 'export { proofDialog } from "./src/web/proveDialog"; export { ApiError } from "./src/web/api";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/proveDialog.test-bundle.mjs",
  logLevel: "error",
});
const { proofDialog, ApiError } = await import("./.bundles/proveDialog.test-bundle.mjs");

const settle = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("The proof dialog with the password only", () => {
  test("offers no passkey, sends the typed password, and is answered true", async () => {
    const sent = [];
    const answered = proofDialog({ password: async (typed) => void sent.push(typed), passkey: null });
    const dialog = document.querySelector("dialog");
    assert.ok(dialog, "the dialog is shown");
    const passkey = [...dialog.querySelectorAll("button")].find((b) => /passkey/i.test(b.textContent));
    assert.equal(passkey.hidden, true, "no passkey in a window that cannot offer one");
    assert.ok(!/passkey/i.test(dialog.querySelector("#web-prove-lead").textContent), "the line asks for the password alone");
    const field = dialog.querySelector("input[type=password]");
    assert.equal(document.activeElement, field, "the focus is in the password");
    field.value = "a senha da conta";
    dialog.querySelector("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
    assert.equal(await answered, true);
    assert.deepEqual(sent, ["a senha da conta"]);
    assert.equal(document.querySelector("dialog"), null, "closed once taken");
  });

  test("says a wrong password in place and stays open; Cancel answers false", async () => {
    const answered = proofDialog({
      password: async () => {
        throw new ApiError(403, "signin_failed", "wrong", null);
      },
      passkey: null,
    });
    const dialog = document.querySelector("dialog");
    dialog.querySelector("input[type=password]").value = "errada";
    dialog.querySelector("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
    await settle();
    await settle();
    assert.match(dialog.querySelector("[role=alert]").textContent, /Senha errada|Wrong password/);
    const cancel = [...dialog.querySelectorAll("button")].find((b) => /Cancelar|Cancel/.test(b.textContent));
    cancel.click();
    assert.equal(await answered, false);
  });
});
