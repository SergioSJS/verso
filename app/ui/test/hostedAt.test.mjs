// Where a table is hosted, said before its link is made (the maintainer,
// 2026-11-05): this computer's address is the one an invitation carries —
// the internet link while it is on, else the network's (Policy::links_base).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/linksBase.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: "test/.bundles/hostedAt.test-bundle.mjs",
  logLevel: "error",
});
const { linksBase } = await import("./.bundles/hostedAt.test-bundle.mjs");

const base = { serving: true, network: true, addresses: ["192.168.1.20"], port: 51234, link: { state: "off", origin: null } };

test("the link's origin while it is on, else the network's address", () => {
  assert.equal(linksBase({ ...base, link: { state: "on", origin: "https://mesa.versomd.com" } }), "https://mesa.versomd.com");
  assert.equal(linksBase(base), "https://192.168.1.20:51234");
  assert.equal(linksBase({ ...base, addresses: ["fe80::1"] }), "https://[fe80::1]:51234");
});

test("no address: the link starting, the network off, nothing served", () => {
  assert.equal(linksBase({ ...base, network: false, link: { state: "starting", origin: null } }), null);
  assert.equal(linksBase({ ...base, serving: false }), null);
  assert.equal(linksBase({ ...base, port: null }), null);
});
