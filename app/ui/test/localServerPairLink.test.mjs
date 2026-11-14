// The owner pairs through the internet link (ADR 0117 D5, R3;
// src/dialogs/localServerPairLink.ts), in node over happy-dom: *Pair a
// phone* opens on the network and by the link once it has its address;
// the dialog switches between the network's QR and the link's (the same
// window, the same code); *Was it you?* says when the question came
// through the link; the address a person types never carries the token.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "HTMLElement", "Node", "Element"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
document.documentElement.lang = "pt-BR";

await esbuild.build({
  entryPoints: ["src/dialogs/localServerPairLink.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/localServerPairLink.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const P = await import("./.bundles/localServerPairLink.test-bundle.mjs");

const off = { state: "off", origin: null };
const up = { state: "on", origin: "https://mesa.trycloudflare.com" };

test("Pair a phone opens on the network, and by the link only once it has its address", () => {
  assert.equal(P.pairOffered({ serving: false, port: null, link: off }), false);
  assert.equal(P.pairOffered({ serving: true, port: 51234, link: off }), true);
  assert.equal(P.pairOffered({ serving: true, port: null, link: off }), false);
  assert.equal(P.pairOffered({ serving: true, port: null, link: { state: "starting", origin: null } }), false);
  assert.equal(P.pairOffered({ serving: true, port: null, link: up }), true);
});

test("the address typed never carries the token", () => {
  assert.equal(P.typedAddress("https://192.168.3.122:51234/pair#t=secret&fp=ab&c=01"), "https://192.168.3.122:51234/pair");
  assert.equal(P.typedAddress("https://mesa.trycloudflare.com/pair#t=secret"), "https://mesa.trycloudflare.com/pair");
});

const network = { url: "https://192.168.3.122:51234/pair#t=tok&fp=ab&c=01", certificate: "own", link: { url: "https://mesa.trycloudflare.com/pair#t=tok", qr: ["1"] } };
const alone = { url: "https://mesa.trycloudflare.com/pair#t=tok", certificate: "link", link: { url: "https://mesa.trycloudflare.com/pair#t=tok", qr: ["1"] } };

test("with the network and the link, the dialog switches between their QRs; with the link alone, there is one", () => {
  const first = P.firstShown(network);
  assert.deepEqual(first, { url: network.url, link: false });
  assert.deepEqual(P.otherShown(network, first), { url: network.link.url, link: true });
  assert.deepEqual(P.otherShown(network, { url: network.link.url, link: true }), { url: network.url, link: false });
  assert.equal(P.otherShown({ ...network, link: null }, first), null, "no link, no switch");
  assert.deepEqual(P.firstShown(alone), { url: alone.url, link: true });
  assert.equal(P.otherShown(alone, P.firstShown(alone)), null);
});

test("the switch says which way the QR goes, and a click asks for the other", () => {
  let drawn = null;
  const box = P.linkSwitch(network, P.firstShown(network), (next) => (drawn = next));
  assert.match(box.textContent, /mesmo Wi-Fi/);
  const swap = box.querySelector("button");
  assert.equal(swap.textContent, "Mostrar o QR do link na internet");
  assert.equal(swap.type, "button");
  swap.click();
  assert.deepEqual(drawn, { url: network.link.url, link: true });
  const back = P.linkSwitch(network, drawn, () => {});
  assert.match(back.textContent, /qualquer lugar/);
  assert.equal(back.querySelector("button").textContent, "Mostrar o QR da rede");
  // The link alone: the words, no button.
  const only = P.linkSwitch(alone, P.firstShown(alone), () => {});
  assert.match(only.textContent, /link na internet/);
  assert.equal(only.querySelector("button"), null);
  // No link at all: nothing added.
  assert.equal(P.linkSwitch({ ...network, link: null }, P.firstShown(network), () => {}), null);
});

test("Was it you? warns when the question came through the link, and only then", () => {
  assert.equal(P.askedByLink(false), null);
  const said = P.askedByLink(true);
  assert.match(said.textContent, /veio pelo link na internet/);
  assert.equal(said.getAttribute("role"), "note");
});
