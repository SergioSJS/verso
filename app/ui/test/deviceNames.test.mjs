// A device's name is the app's own words — whatever the person, or
// whoever asked, called it — and it sits inside a line of the server's
// words: in the account's list of sessions, in the console's list of an
// account's sessions and of a folder's changes. Each says it in a <bdi>
// of its own, so that a name in another direction does not carry into the
// words after it (the approval page already does, ae82caed).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "location", "HTMLElement", "Node", "Element", "localStorage", "addEventListener", "dispatchEvent"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });

// A name in a right-to-left script.
const name = "Verso · מחשב 2";
const session = { id: "s1", kind: "device", device: name, last_used: 1_792_000_000, address: "203.0.113.5" };
globalThis.fetch = async (path) => {
  if (path === "/api/me/sessions") return new Response(JSON.stringify([{ session, current: false }]), { status: 200 });
  return new Response("null", { status: 404 });
};

for (const m of ["console", "account"]) {
  await esbuild.build({
    entryPoints: [`src/web/${m}.ts`],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: `test/.bundles/deviceNames-${m}.test-bundle.mjs`,
    logLevel: "error",
  });
}
const consoleView = await import("./.bundles/deviceNames-console.test-bundle.mjs");
const account = await import("./.bundles/deviceNames-account.test-bundle.mjs");

/** That `node` says the name once, in a <bdi> of its own, and nowhere else. */
function isolated(node) {
  const bdis = [...node.querySelectorAll("bdi")].filter((b) => b.textContent === name);
  assert.equal(bdis.length, 1, node.outerHTML);
  const outside = node.cloneNode(true);
  for (const b of outside.querySelectorAll("bdi")) b.remove();
  assert.ok(!outside.textContent.includes("מחשב"), `the name outside a <bdi>: ${outside.outerHTML}`);
}

describe("A device's name in a list", () => {
  test("of an account's sessions in the console", () => {
    isolated(consoleView.sessionLine(session));
  });

  test("of a folder's changes in the console", () => {
    isolated(consoleView.changeLine({ seq: 1, at: 1_792_000_000, path: "Nota.md", deleted: false, renamedFrom: null, who: "Bia", device: name }));
  });

  test("of the person's own sessions in Settings › Account", async () => {
    const item = (title, desc, control) => {
      const row = document.createElement("div");
      row.className = "setting";
      const t = document.createElement("div");
      t.className = "setting-title";
      t.append(title);
      const d = document.createElement("div");
      d.className = "setting-desc";
      d.append(desc);
      row.append(t, d);
      if (control) row.append(control);
      return row;
    };
    const me = { id: "a1", email: "bia@casa.example", name: "Bia", lang: "pt", admin: false, mayCreate: false };
    const entry = account.accountEntries(me, item).find((e) => e.group === "Sessões" || e.group === "Sessions");
    assert.ok(entry, "the sessions' entry");
    const box = entry.node();
    document.body.append(box);
    const end = Date.now() + 2000;
    while (!box.querySelector(".setting .setting-title") || !box.textContent.includes("203.0.113.5")) {
      if (Date.now() > end) assert.fail(box.outerHTML);
      await new Promise((r) => setTimeout(r, 5));
    }
    const row = [...box.querySelectorAll(".setting")].find((r) => r.textContent.includes("203.0.113.5"));
    isolated(row.querySelector(".setting-title"));
    // The end button's name still says the whole line.
    assert.ok(row.querySelector("button")?.getAttribute("aria-label")?.includes(name), row.outerHTML);
  });
});
