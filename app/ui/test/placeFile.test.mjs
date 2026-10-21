// A file put in the folder by an import or a drop: never overwritten, never
// refused — a name taken moves on to (2), (3)… (I.1a, decided 2026-10-21).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/placeFile.ts", "src/importStrings.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outdir: "test/.bundles/placeFile",
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
});
const { placeFile } = await import("./.bundles/placeFile/placeFile.mjs");
const { imp } = await import("./.bundles/placeFile/importStrings.mjs");

const ok = (data) => ({ status: "ok", data });
const exists = { status: "error", error: { kind: "exists", message: "exists" } };

describe("Placing a file in the folder", () => {
  test("a free name is kept", async () => {
    const taken = new Set();
    const r = await placeFile("Mapas", "a.png", taken, async (p) => ok(p));
    assert.deepEqual(r, { made: "Mapas/a.png", given: "a.png", renamed: false });
  });

  test("a name the folder holds becomes name (2).ext, and is said to be renamed", async () => {
    const taken = new Set(["mapas/a.png"]);
    const r = await placeFile("Mapas", "a.png", taken, async (p) => ok(p));
    assert.deepEqual(r, { made: "Mapas/a (2).png", given: "a (2).png", renamed: true });
    assert.ok(taken.has("mapas/a (2).png"));
  });

  test("a name taken a moment before, which the folder's list did not know, moves on too", async () => {
    const seen = [];
    const r = await placeFile("", "b.pdf", new Set(), async (p) => {
      seen.push(p);
      return seen.length < 3 ? exists : ok(p);
    });
    assert.deepEqual(seen, ["b.pdf", "b (2).pdf", "b (3).pdf"]);
    assert.equal(r.given, "b (3).pdf");
  });

  test("another refusal is the failure, and it is not tried again", async () => {
    let n = 0;
    const r = await placeFile("", "c.txt", new Set(), async () => {
      n++;
      return { status: "error", error: { kind: "refused", message: "no" } };
    });
    assert.equal(n, 1);
    assert.equal(r.failed.kind, "refused");
  });

  test("it gives up after eight names taken", async () => {
    let n = 0;
    const r = await placeFile("", "d.txt", new Set(), async () => (n++, exists));
    assert.equal(n, 8);
    assert.equal(r.failed.kind, "exists");
  });
});

describe("What the status line says after an import or a drop", () => {
  test("how many came, which were renamed, which were left out and why — the size with its limit", () => {
    const said = imp.summary({
      made: 2,
      renamed: ["a.png → a (2).png"],
      skipped: [
        { name: "grande.pdf", reason: "too_large" },
        { name: "pasta", reason: "not_a_file" },
      ],
      failed: ["x.bin"],
      limitMb: 200,
    });
    assert.match(said, /2 (files|arquivos)/);
    assert.match(said, /a \(2\)\.png/);
    assert.match(said, /grande\.pdf \([^)]*200 MB/);
    assert.match(said, /pasta/);
    assert.match(said, /x\.bin/);
  });

  test("nothing to say is an empty string", () => {
    assert.equal(imp.summary({ made: 0, renamed: [], skipped: [], failed: [], limitMb: 32 }), "");
  });
});
