// The table's link copied from its card (ADR 0117 D6, R4): the opaque id's
// route at the internet link's origin while it is on, else at the network's
// address — said to open only on this network — and none without either.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const out = await esbuild.build({
  entryPoints: ["src/linksBase.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const L = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

const off = { state: "off", origin: null };
const base = { serving: true, network: true, addresses: ["192.168.0.10"], port: 7340, link: off };

test("the internet link's route while the link is on", () => {
  const s = { ...base, link: { state: "on", origin: "https://mesa.example.org" } };
  assert.deepEqual(L.tableRoute(s, "f/1"), { link: "https://mesa.example.org/?folder=f%2F1", lan: false });
});

test("the network's address otherwise, said to open only here", () => {
  assert.deepEqual(L.tableRoute(base, "abc"), { link: "https://192.168.0.10:7340/?folder=abc", lan: true });
});

test("no address, no link", () => {
  assert.equal(L.tableRoute({ ...base, serving: false }, "abc"), null);
  assert.equal(L.tableRoute(base, ""), null);
});
