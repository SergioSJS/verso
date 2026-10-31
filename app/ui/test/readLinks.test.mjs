// Read links (ADR 0105), the window's part that needs no browser: what the
// page makes of the server's answer about a link, and the owner's four
// commands in a browser — asked of the server's pages with the session,
// answered as the contract does, the address made whole once.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

for (const [entry, name] of [
  ["src/web/readLink.ts", "readLink"],
  ["src/web/readLinkOwner.ts", "readLinkOwner"],
  ["src/web/api.ts", "readLinkApi"],
]) {
  await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: `test/.bundles/${name}.test-bundle.mjs`, logLevel: "error" });
}
const { verdict } = await import("./.bundles/readLink.test-bundle.mjs");
const { readLinkCall, linkOf } = await import("./.bundles/readLinkOwner.test-bundle.mjs");

describe("What the page makes of a link's answer", () => {
  test("an address that does not open is one page, whatever the reason", () => {
    for (const status of [404, 403, 410, 500, 401]) assert.equal(verdict(status, null), "gone", String(status));
  });
  test("a passphrase is asked when the server says the page is locked", () => {
    assert.equal(verdict(200, { locked: true }), "locked");
    assert.equal(verdict(200, { locked: false }), "open");
    assert.equal(verdict(200, null), "open");
  });
  test("a pace passed is told apart from a link that is gone", () => {
    assert.equal(verdict(429, null), "busy");
  });
});

const wire = { id: "l1", kind: "note", path: "Mesa/Notas.md", madeBy: "Ana", madeAt: 1000, expires: null, hasPassword: true, lastOpened: 2000, open: 2 };

describe("The owner's read links in a browser", () => {
  let asked;
  beforeEach(() => {
    asked = [];
    globalThis.location = { origin: "https://notas.casa" };
    globalThis.fetch = async (path, init) => {
      asked.push({ path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
      const answer = {
        "/api/folders/f1/readlinks": { enabled: true, links: [wire], path: "/r/TOKEN", link: wire },
        "/api/folders/f1/readlinks/secrets?kind=folder&path=Mesa": { notes: 3 },
        "/api/folders/f1/readlinks/l1": { revoked: "l1", closed: 0 },
      }[path];
      return answer
        ? { ok: true, status: 200, json: async () => answer }
        : { ok: false, status: 404, statusText: "Not Found", json: async () => ({ error: "not_found", message: "not found" }) };
    };
  });

  test("a link crosses as the contract says it", () => {
    assert.deepEqual(linkOf(wire), { id: "l1", kind: "note", path: "Mesa/Notas.md", made_by: "Ana", made_at: 1000, expires: null, has_password: true, last_opened: 2000, open: 2 });
  });
  test("the list says whether the server has them on", async () => {
    const r = await readLinkCall("f1", "read_link_list", {});
    assert.equal(r.enabled, true);
    assert.equal(r.links[0].made_by, "Ana");
  });
  test("how many notes hold secrets is one number", async () => {
    assert.equal(await readLinkCall("f1", "read_link_secrets", { kind: "folder", path: "Mesa" }), 3);
  });
  test("a link made is the whole address, once", async () => {
    const made = await readLinkCall("f1", "read_link_create", { kind: "note", path: "Mesa/Notas.md", expiresDays: 7, expiresAt: null, password: "abra cadabra" });
    assert.equal(made.url, "https://notas.casa/r/TOKEN");
    assert.equal(made.link.has_password, true);
    const sent = asked.at(-1);
    assert.equal(sent.method, "POST");
    assert.deepEqual(sent.body, { kind: "note", path: "Mesa/Notas.md", expiresDays: 7, password: "abra cadabra" });
  });
  test("a revocation is a DELETE of the link", async () => {
    assert.equal(await readLinkCall("f1", "read_link_revoke", { id: "l1" }), null);
    assert.deepEqual(asked.at(-1), { path: "/api/folders/f1/readlinks/l1", method: "DELETE", body: null });
  });
  test("what the server refuses is refused as the contract refuses", async () => {
    await assert.rejects(readLinkCall("f1", "read_link_revoke", { id: "nope" }), { kind: "not_found" });
    await assert.rejects(readLinkCall(null, "read_link_list", {}), { kind: "refused" });
  });
});
