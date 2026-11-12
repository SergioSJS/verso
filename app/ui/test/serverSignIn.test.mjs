// The desktop app connecting to a server (ADR 0074 item 8; decided
// 2026-10-14, ADR 0083 As built): the app copies the code to the
// clipboard when it starts the flow, then opens the server's page, where
// the person pastes it — `gh auth login`'s way. The page never takes the
// code from its link, so a link sent by someone else approves nothing.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/serverSignIn.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/serverSignIn.test-bundle.mjs",
  logLevel: "error",
});
const { startSignIn, copyWhenKnown } = await import("./.bundles/serverSignIn.test-bundle.mjs");

const started = { status: "ok", data: { code: "BCDF-GHJK", page: "https://notas.exemplo/device" } };
const unreachable = { status: "error", error: { kind: "failed", message: "the server did not answer" } };

/** What happened, in order. */
let log = [];

/** The system's clipboard, stubbed: `writeText` only, as a WebView may
 *  have it, or `write` with a `ClipboardItem` as well. */
function clipboard({ items = false, refuses = false } = {}) {
  const c = {
    async writeText(text) {
      if (refuses) throw new Error("NotAllowedError");
      log.push(`clipboard ${text}`);
    },
  };
  if (items) {
    c.write = async (list) => {
      if (refuses) throw new Error("NotAllowedError");
      const blob = await list[0].items["text/plain"];
      log.push(`clipboard ${typeof blob === "string" ? blob : await blob.text()}`);
    };
  }
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: c }, configurable: true });
}

/** The host's two commands, stubbed. */
function host(answer = started) {
  return {
    signIn: async (url) => {
      log.push(`sign in ${url}`);
      return answer;
    },
    open: async () => {
      log.push("open the page");
      return { status: "ok", data: null };
    },
  };
}

beforeEach(() => {
  log = [];
  delete globalThis.ClipboardItem;
});

describe("Connecting the desktop app to a server", () => {
  test("copies the code to the clipboard, then opens the page", async () => {
    clipboard();
    const r = await startSignIn("https://notas.exemplo", { ...host(), copy: copyWhenKnown });
    assert.deepEqual(r, { status: "ok", code: "BCDF-GHJK", copied: true });
    assert.deepEqual(log, ["sign in https://notas.exemplo", "clipboard BCDF-GHJK", "open the page"]);
  });

  test("asks the clipboard before the first await, so the click still counts", async () => {
    clipboard();
    let asked = false;
    const copy = (code) => {
      asked = true;
      return copyWhenKnown(code);
    };
    const going = startSignIn("https://notas.exemplo", { ...host(), copy });
    assert.equal(asked, true, "the copy was asked for inside the click's turn");
    await going;
    assert.ok(log.includes("clipboard BCDF-GHJK"), log.join(", "));
  });

  test("writes a ClipboardItem whose text comes when the server answers", async () => {
    clipboard({ items: true });
    globalThis.ClipboardItem = class {
      constructor(items) {
        this.items = items;
      }
    };
    const r = await startSignIn("https://notas.exemplo", { ...host(), copy: copyWhenKnown });
    assert.equal(r.copied, true);
    assert.deepEqual(log, ["sign in https://notas.exemplo", "clipboard BCDF-GHJK", "open the page"]);
  });

  test("still opens the page when the clipboard refuses, and says it was not copied", async () => {
    clipboard({ refuses: true });
    const r = await startSignIn("https://notas.exemplo", { ...host(), copy: copyWhenKnown });
    assert.deepEqual(r, { status: "ok", code: "BCDF-GHJK", copied: false });
    assert.deepEqual(log, ["sign in https://notas.exemplo", "open the page"]);
  });

  test("a server that does not answer: nothing copied, no page opened", async () => {
    clipboard();
    const r = await startSignIn("https://notas.exemplo", { ...host(unreachable), copy: copyWhenKnown });
    assert.deepEqual(r, unreachable);
    assert.deepEqual(log, ["sign in https://notas.exemplo"]);
  });

  test("a page the host does not open is a failure in its words, not a refused path", async () => {
    clipboard();
    const refusing = {
      ...host(),
      open: async () => ({ status: "error", error: { kind: "refused", message: "no server's page waits to be opened" } }),
    };
    const r = await startSignIn("https://notas.exemplo", { ...refusing, copy: copyWhenKnown });
    assert.deepEqual(r, { status: "error", error: { kind: "failed", message: "no server's page waits to be opened" } });
  });
});
