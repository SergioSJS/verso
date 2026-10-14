// The window's settings on a server follow the account (ADR 0073 item 5),
// and only the account: in a browser two people share, what one approved
// — the embed origins above all, a page let into the notes — never
// reaches the other. The settings this browser keeps say whose they are,
// and are dropped when another account signs in, or on sign-out.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "location", "localStorage", "addEventListener", "dispatchEvent"]) {
  globalThis[name] = name === "window" ? win : win[name];
}

/** What `GET /api/me/settings` answers. */
let kept = null;
globalThis.fetch = async (path, init = {}) => {
  const key = `${init.method ?? "GET"} ${path}`;
  if (key === "GET /api/me/settings") return new Response(JSON.stringify({ settings: kept }), { status: 200 });
  return new Response("null", { status: 200 });
};

await esbuild.build({
  entryPoints: ["src/web/settingsSync.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/settingsSync.test-bundle.mjs",
  logLevel: "error",
});
const { pullSettings, forgetSettings } = await import("./.bundles/settingsSync.test-bundle.mjs");

const ana = { id: "ana" };
const bia = { id: "bia" };
const anas = JSON.stringify({ theme: "dark", embedOrigins: ["http://192.168.1.20:8123"] });
const bias = JSON.stringify({ theme: "light", embedOrigins: [] });
const stored = () => localStorage.getItem("verso.settings");

beforeEach(() => {
  localStorage.clear();
  kept = null;
});

describe("The settings this browser keeps", () => {
  test("are not another account's, even when the new one has none on the server", async () => {
    kept = anas;
    await pullSettings(ana);
    assert.equal(stored(), anas);
    kept = null;
    await pullSettings(bia);
    assert.equal(stored(), null, "Ana's approved embed origins reached Bia");
  });

  test("are the new account's own when it has some", async () => {
    kept = anas;
    await pullSettings(ana);
    kept = bias;
    await pullSettings(bia);
    assert.equal(stored(), bias);
  });

  test("stay the same account's between its visits", async () => {
    kept = anas;
    await pullSettings(ana);
    kept = null;
    await pullSettings(ana);
    assert.equal(stored(), anas);
  });

  test("of no known account — from before this was kept — are dropped", async () => {
    localStorage.setItem("verso.settings", anas);
    await pullSettings(bia);
    assert.equal(stored(), null);
  });

  test("are forgotten on sign-out", async () => {
    kept = anas;
    await pullSettings(ana);
    forgetSettings();
    assert.equal(stored(), null);
    kept = null;
    await pullSettings(ana);
    assert.equal(stored(), null, "nothing of before comes back");
  });
});
