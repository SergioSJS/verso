// Where a person lands in a server's window (src/web/landing.ts, ADR 0074
// item 6 as amended 2026-11-06): a player with one folder is taken into it,
// the start page offers the example vault only to someone who may create,
// and a link's note is asked for only as a path inside the folder.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/landing.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/landing.test-bundle.mjs",
  logLevel: "error",
});
const { soleFolder, mayOfferExample, linkNotePath } = await import("./.bundles/landing.test-bundle.mjs");

const reader = (id) => ({ id, role: "reader" });

describe("a player with one folder is taken into it", () => {
  test("one folder and no right to make another: that folder", () => {
    assert.equal(soleFolder({ folders: [reader("a")], mayCreate: false }), "a");
    assert.equal(soleFolder({ folders: [reader("a")], may_create: false }), "a");
    assert.equal(soleFolder({ folders: [{ id: "a", role: "editor" }] }), "a");
  });
  test("none, several, or an account that makes folders: the start page", () => {
    assert.equal(soleFolder({ folders: [], mayCreate: false }), null);
    assert.equal(soleFolder({ folders: [reader("a"), reader("b")], mayCreate: false }), null);
    assert.equal(soleFolder({ folders: [{ id: "a", role: "owner" }], mayCreate: true }), null);
    assert.equal(soleFolder({ folders: [reader("a")], may_create: true }), null);
  });
});

describe("the example vault is offered only to someone who may create", () => {
  test("a reader of every folder, who may not make one: not offered", () => {
    assert.equal(mayOfferExample({ folders: [], mayCreate: false }), false);
    assert.equal(mayOfferExample({ folders: [reader("a"), reader("b")], may_create: false }), false);
    assert.equal(mayOfferExample({ folders: [reader("a")] }), false);
  });
  test("one who may make a folder, or writes in one: offered", () => {
    assert.equal(mayOfferExample({ folders: [], mayCreate: true }), true);
    assert.equal(mayOfferExample({ folders: [], may_create: true }), true);
    assert.equal(mayOfferExample({ folders: [reader("a"), { id: "b", role: "editor" }], may_create: false }), true);
    assert.equal(mayOfferExample({ folders: [{ id: "b", role: "owner" }] }), true);
  });
  test("the start page asks before it offers: the button is not put up front", () => {
    // chrome.ts's lesson on a server: the import button joins the actions
    // only once mayOfferExample says so.
    const src = readFileSync("src/chrome.ts", "utf8");
    const start = src.indexOf('dataset["host"] === "server"');
    const server = src.slice(start, src.indexOf("ui.panes.replaceChildren(box);", start));
    assert.match(server, /actions\.append\(choose\);/);
    assert.match(server, /mayOfferExample\(r\.data\)[^\n]*actions\.append\(importBtn\)/);
    assert.doesNotMatch(server, /actions\.append\(choose, importBtn\)/);
  });
});

describe("a link's note is a path inside the folder, or nothing", () => {
  test("a relative path is kept", () => {
    assert.equal(linkNotePath("Diário.md"), "Diário.md");
    assert.equal(linkNotePath("Mesa/Segredos/Covil.md"), "Mesa/Segredos/Covil.md");
  });
  test("outside the folder, odd or empty: not asked for", () => {
    for (const bad of [null, "", "/etc/passwd", "../fora.md", "a/../../b.md", "a/./b.md", "a//b.md", "a\\b.md", "x\0.md", "a/", "x".repeat(1025)]) {
      assert.equal(linkNotePath(bad), null, JSON.stringify(bad));
    }
  });
});
