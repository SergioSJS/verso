// The servers found on the network (ADR 0097): the list shows the address
// a click will use, a click hands the server over and does nothing else,
// and the browse ends when the list leaves the screen.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.HTMLElement = win.HTMLElement;

await esbuild.build({
  entryPoints: ["src/dialogs/serversFound.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/serversFound.test-bundle.mjs",
  logLevel: "error",
});
const { foundList, foundRow } = await import("./.bundles/serversFound.test-bundle.mjs");

const ZIMA = { name: "UniVerso-ab12cd", host: "universo-ab12cd.local", url: "http://192.168.1.9:7340", https: false, version: "0.8.4", needs_public_url: false };
const SAFE = { name: "UniVerso-ef34ab", host: "universo-ef34ab.local", url: "https://192.168.1.20", https: true, version: "", needs_public_url: false };

const later = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** A finder that holds `found`, and counts what was asked of it. */
function finder(found = [], startsWith = { status: "ok", data: null }) {
  const f = {
    found,
    started: 0,
    stopped: 0,
    start: async () => (f.started++, startsWith),
    listed: 0,
    list: async () => (f.listed++, { status: "ok", data: f.found }),
    stop: async () => void f.stopped++,
  };
  return f;
}

beforeEach(() => {
  document.documentElement.lang = "pt-BR";
  document.body.replaceChildren();
});

describe("a row", () => {
  test("shows the name, the address it will use and whether it is encrypted", () => {
    const li = foundRow(ZIMA, () => {});
    assert.equal(li.querySelector("code").textContent, "http://192.168.1.9:7340");
    assert.match(li.textContent, /UniVerso-ab12cd/);
    assert.match(li.textContent, /sem HTTPS/);
    assert.match(li.textContent, /versão 0\.8\.4/);
    const safe = foundRow(SAFE, () => {});
    assert.match(safe.textContent, /HTTPS/);
    assert.doesNotMatch(safe.textContent, /sem HTTPS|versão/);
  });

  test("the button names the server and the address, and hands the server over", () => {
    let picked = null;
    const li = foundRow(ZIMA, (f) => (picked = f));
    const button = li.querySelector("button");
    assert.equal(button.getAttribute("aria-label"), "Conectar a UniVerso-ab12cd em http://192.168.1.9:7340");
    assert.equal(picked, null);
    button.click();
    assert.deepEqual(picked, ZIMA);
  });

  test("is said in English when the window is", () => {
    document.documentElement.lang = "en";
    const li = foundRow(ZIMA, () => {});
    assert.equal(li.querySelector("button").getAttribute("aria-label"), "Connect to UniVerso-ab12cd at http://192.168.1.9:7340");
    assert.match(li.textContent, /no HTTPS/);
  });
});

describe("a TLS server announced with no public address", () => {
  test("is listed with what to do, and has no button to click", () => {
    const li = foundRow({ name: "UniVerso-9a", host: "h.local", url: "", https: true, version: "", needs_public_url: true }, () => assert.fail("nothing to pick"));
    assert.match(li.textContent, /VERSO_PUBLIC_URL/);
    assert.equal(li.querySelector("button"), null);
    assert.equal(li.querySelector("code"), null);
  });
});

describe("the list", () => {
  test("browses while on the screen and lists what is found", async () => {
    const f = finder([ZIMA, SAFE]);
    const box = foundList(f, () => {}, 20);
    document.body.append(box);
    await later();
    assert.equal(f.started, 1);
    assert.equal(box.querySelectorAll(".srv-found-row").length, 2);
    assert.match(box.querySelector(".srv-found-state").textContent, /2 servidores encontrados/);
    assert.match(box.textContent, /Qualquer aparelho da rede pode se anunciar/);
    assert.equal(f.stopped, 0);
    // A server leaves the network: the list follows.
    f.found = [SAFE];
    await later();
    assert.equal(box.querySelectorAll(".srv-found-row").length, 1);
    box.querySelector("button").click();
    box.remove();
    await later();
    assert.equal(f.stopped, 1);
  });

  test("with none found it says what to do, and it is not an error", async () => {
    const box = foundList(finder([]), () => {}, 20);
    document.body.append(box);
    await later();
    assert.match(box.querySelector(".srv-found-state").textContent, /Nenhum UniVerso respondeu ainda/);
    assert.match(box.querySelector(".srv-found-state").textContent, /host/);
    assert.equal(box.querySelectorAll(".srv-found-row").length, 0);
    box.remove();
    await later();
  });

  test("stops when it is inside something that was hidden", async () => {
    const f = finder([ZIMA]);
    const dialog = document.createElement("div");
    document.body.append(dialog);
    const box = foundList(f, () => {}, 20);
    dialog.append(box);
    await later();
    assert.equal(f.stopped, 0);
    dialog.hidden = true;
    await later();
    assert.equal(f.stopped, 1);
    await later();
    assert.equal(f.stopped, 1, "stopped once");
  });

  test("a section that is never shown asks the host for nothing", async () => {
    const f = finder([ZIMA]);
    const hidden = document.createElement("div");
    hidden.hidden = true;
    document.body.append(hidden);
    const box = foundList(f, () => {}, 5);
    hidden.append(box);
    await later(250); // more than the 20 ticks it waits for being shown
    assert.equal(f.started, 0, "no browse for a section nobody sees");
    assert.equal(f.listed, 0);
    assert.equal(f.stopped, 0, "and nothing to stop");
    // Shown at last, it is another list's business: this one has given up,
    // so showing it now starts nothing.
    hidden.hidden = false;
    await later(60);
    assert.equal(f.started, 0);
  });

  test("a section shown a moment late still browses", async () => {
    const f = finder([ZIMA]);
    const holder = document.createElement("div");
    holder.hidden = true;
    document.body.append(holder);
    const box = foundList(f, () => {}, 20);
    holder.append(box);
    await later(50);
    assert.equal(f.started, 0);
    holder.hidden = false;
    await later(80);
    assert.equal(f.started, 1);
    assert.equal(box.querySelectorAll(".srv-found-row").length, 1);
    box.remove();
    await later();
  });

  test("a list closing after another opened does not end the new one's browse", async () => {
    const first = finder([ZIMA]);
    const a = foundList(first, () => {}, 20);
    document.body.append(a);
    await later();
    const second = finder([ZIMA]);
    const b = foundList(second, () => {}, 20);
    document.body.append(b);
    a.remove();
    await later();
    assert.equal(first.stopped, 0, "the old list leaves the new browse alone");
    assert.equal(second.stopped, 0);
    b.remove();
    await later();
    assert.equal(second.stopped, 1);
  });

  test("a network that cannot be browsed says so and leaves typing possible", async () => {
    const f = finder([], { status: "error", error: { kind: "failed", message: "no multicast" } });
    const box = foundList(f, () => {}, 20);
    document.body.append(box);
    await later();
    assert.match(box.querySelector(".srv-found-state").textContent, /Não foi possível procurar nesta rede/);
    box.remove();
  });
});
