// The server's own pages (`src/web/pages.ts`), driven in node over
// happy-dom with the API answered by the test: what a page shows, and
// what it sends, for the cases a browser run would take minutes to reach.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({
  url: "https://verso.test/",
  settings: { navigation: { disableMainFrameNavigation: true } },
});
for (const name of ["window", "document", "location", "history", "HTMLElement", "Node", "Element", "localStorage", "addEventListener", "dispatchEvent", "CustomEvent"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });

/** What the API answers, by "METHOD path"; what was sent, in order. */
let answers = {};
let sent = [];
globalThis.fetch = async (path, init = {}) => {
  const key = `${init.method ?? "GET"} ${path}`;
  sent.push({ key, body: init.body ? JSON.parse(init.body) : undefined });
  const queue = answers[key];
  const a = Array.isArray(queue) ? (queue.length > 1 ? queue.shift() : queue[0]) : queue;
  if (!a) return new Response(JSON.stringify({ error: "not_found", message: key }), { status: 404 });
  return new Response(JSON.stringify(a.body ?? null), { status: a.status ?? 200 });
};

await esbuild.build({
  entryPoints: ["src/web/pages.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/webPages.test-bundle.mjs",
  logLevel: "error",
});
const pages = await import("./.bundles/webPages.test-bundle.mjs");

const account = { id: "a1", email: "bia@casa.example", name: "Bia", lang: "pt", admin: false, mayCreate: false };

/** Let the page's promises and timers run. */
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Wait until `check` holds, or fail saying `what`. */
async function until(check, what, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) assert.fail(`${what}: ${document.body.textContent}`);
    await settle(5);
  }
}

/** The person enters `code` in the device page's field, as typed or
 *  pasted from the app's screen, and sends it. */
async function enter(code) {
  await until(() => document.querySelector("main form input"), "the code's field is shown");
  const input = document.querySelector("main form input");
  input.value = code;
  document.querySelector("main form button[type=submit]").click();
}

beforeEach(() => {
  answers = {};
  sent = [];
  document.body.innerHTML = "";
});

describe("The device page", () => {
  // A link carries no code the page takes (decided 2026-10-14, ADR 0083
  // As built): a link sent by someone else names their device, and a
  // click must not stand for having looked at one's own app.
  test("with a code in its address, shows the field empty and sends nothing until a code is entered", async () => {
    win.happyDOM.setURL("https://verso.test/device?code=TVWX-ZBCD");
    answers["POST /api/device/describe"] = { body: { code: "CDFG-HJKL", device: "Verso · MacBook", address: "127.0.0.1", asked: "2026-10-13T12:00:00Z" } };
    await pages.devicePage(account);
    await until(() => document.querySelector("main form input"), "the code's field is shown");
    await settle(20);
    const input = document.querySelector("main form input");
    assert.equal(input.value, "", "the field is not filled from the address");
    assert.ok(input.labels?.length || document.querySelector(`label[for="${input.id}"]`), "the field has a label");
    assert.ok(!document.querySelector("main").textContent.includes("TVWX-ZBCD"), "the address's code is not shown");
    assert.deepEqual(sent, [], "nothing is sent before a code is entered");
    await enter("cdfg hjkl");
    await until(() => sent.length === 1, "the entered code is sent");
    assert.deepEqual(sent, [{ key: "POST /api/device/describe", body: { code: "CDFG-HJKL" } }], "only the entered code");
  });

  // A name in a right-to-left script, inside a left-to-right sentence:
  // unisolated, its direction would carry into the words around it.
  const name = "Verso · מחשב 2";
  const asked = { code: "BCDF-GHJK", device: name, address: "203.0.113.5", asked: "2026-10-13T12:00:00Z" };

  test("puts the device's name, wherever it says it, in a <bdi> of its own", async () => {
    win.happyDOM.setURL("https://verso.test/device");
    answers["POST /api/device/describe"] = { body: asked };
    await pages.devicePage(account);
    await enter("BCDF-GHJK");
    await until(() => document.querySelector("#device-ask"), "the question is shown");
    const main = document.querySelector("main");
    const isolated = [...main.querySelectorAll("bdi")].filter((b) => b.textContent === name);
    // The lead, the facts, the approve button.
    assert.equal(isolated.length, 3, main.innerHTML);
    const outside = main.cloneNode(true);
    for (const b of outside.querySelectorAll("bdi")) b.remove();
    assert.ok(!outside.textContent.includes("מחשב"), `the name outside a <bdi>: ${outside.innerHTML}`);
    const approve = [...main.querySelectorAll("button")].find((b) => b.type === "submit");
    assert.equal(approve.textContent, `Aprovar este aparelho: ${name}`);
  });
});

describe("The device page told to wait", () => {
  const asked = { code: "BCDF-GHJK", device: "Verso · MacBook", address: "127.0.0.1", asked: "2026-10-13T12:00:00Z" };
  const wait = { status: 429, body: { error: "too_many", message: "wait", retry: 1 } };
  const status = () => [...document.querySelectorAll("[role=status]")].map((n) => n.textContent).join(" ");

  test("says it is waiting, and asks again by itself", async () => {
    win.happyDOM.setURL("https://verso.test/device");
    answers["POST /api/device/describe"] = [wait, { body: asked }];
    answers["POST /api/device/approve"] = [wait, { body: null }];
    await pages.devicePage(account);
    await enter("BCDF-GHJK");
    await until(() => status().includes("1 s"), "the wait is said");
    assert.ok(!document.body.textContent.includes("Tente de novo"), "not a dead end");
    await until(() => document.querySelector("#device-ask"), "the question, once the wait is past", 3000);
    document.querySelector("button[type=submit]").click();
    await until(() => status().includes("1 s"), "the approval's wait is said");
    await until(() => document.body.textContent.includes("Pronto."), "approved after the wait", 3000);
    assert.deepEqual(
      sent.map((x) => x.key),
      ["POST /api/device/describe", "POST /api/device/describe", "POST /api/device/approve", "POST /api/device/approve"],
    );
  });
});

describe("The sign-in link page", () => {
  const token = "um-token-de-teste";
  const path = `/api/signin/link/${token}`;

  test("names the account and waits for a click before it signs in", async () => {
    win.happyDOM.setURL(`https://verso.test/signin-link/${token}`);
    answers[`GET ${path}`] = { body: { email: "bia@casa.example" } };
    answers[`POST ${path}`] = { body: { csrf: "c" } };
    await pages.signInLinkPage(token);
    await until(() => document.querySelector("main button"), "the question is shown");
    await settle(20);
    assert.deepEqual(
      sent.map((s) => s.key),
      [`GET ${path}`],
      "nothing is used before the click",
    );
    const main = document.querySelector("main");
    assert.ok(main.textContent.includes("Entrar como bia@casa.example?"), main.innerHTML);
    const go = main.querySelector("button");
    assert.equal(document.activeElement, go, "the button has the focus");
    assert.equal(go.textContent, "Entrar");
    // The button is named by its words, and described by the question.
    const described = go
      .getAttribute("aria-describedby")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    assert.ok(described.includes("Entrar como bia@casa.example?"), main.innerHTML);
    go.click();
    await until(() => sent.length === 2, "the click uses the link");
    assert.equal(sent[1].key, `POST ${path}`);
  });

  test("says a used or expired link in the person's words, and sends nothing more", async () => {
    win.happyDOM.setURL(`https://verso.test/signin-link/${token}`);
    answers[`GET ${path}`] = { status: 404, body: { error: "link_gone", message: "gone" } };
    await pages.signInLinkPage(token);
    await until(() => document.querySelector("main")?.textContent.includes("link"), "the link is said gone");
    assert.equal(document.querySelector("main button"), null);
    assert.deepEqual(sent.map((s) => s.key), [`GET ${path}`]);
  });
});

describe("The pairing page", () => {
  // The owner's phone pairs through the internet link too (ADR 0117 D5,
  // R3): there the page says it is the link, and nothing of the network's
  // own certificate, whose warning a link never shows.
  const tofu = /certificado que o próprio app fez|certificate the app itself made/;

  test("through the link: the link's words, no certificate warning, and the typed code sent", async () => {
    win.happyDOM.setURL("https://mesa.trycloudflare.com/pair");
    answers["POST /api/pair"] = { status: 404, body: { error: "not_found", message: "closed" } };
    pages.pairPage(true);
    const main = document.querySelector("main");
    assert.match(main.textContent, /link na internet|internet link/);
    assert.doesNotMatch(main.textContent, tofu);
    await enter("bcdf ghjk");
    await until(() => sent.length === 1, "the typed code is sent");
    assert.deepEqual(sent, [{ key: "POST /api/pair", body: { token: "bcdf ghjk" } }]);
    // No window open in the app: said in words, not as a code.
    await until(() => document.querySelector("[role=alert]"), "the refusal is said");
    assert.match(document.querySelector("[role=alert]").textContent, /Parear um celular|Pair a phone/);
  });

  test("on the network: the certificate warning, as before", () => {
    win.happyDOM.setURL("https://192.168.1.20:51234/pair");
    pages.pairPage(false);
    assert.match(document.querySelector("main").textContent, tofu);
  });
});
