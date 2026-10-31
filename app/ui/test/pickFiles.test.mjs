// The browser's "Import files…" (A11Y.10): the chosen files read as names
// and base64 bytes, as the desktop host gives them; one past the bound is
// named, not sent.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/web/pickFiles.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/pickFiles.test-bundle.mjs",
  logLevel: "error",
});
const { readChosen } = await import("./.bundles/pickFiles.test-bundle.mjs");

describe("Reading the files a browser's picker gave", () => {
  test("a file is its name and its bytes in base64", async () => {
    const got = await readChosen([new File(["oi"], "a.txt"), new File([new Uint8Array([0, 255, 128])], "b.bin")]);
    assert.deepEqual(got.skipped, []);
    assert.deepEqual(got.files, [
      { name: "a.txt", base64: Buffer.from("oi").toString("base64"), token: null },
      { name: "b.bin", base64: Buffer.from([0, 255, 128]).toString("base64"), token: null },
    ]);
  });

  test("a file past the bound is named as too large and the rest still come", async () => {
    const big = new File([new Uint8Array(32 * 1024 * 1024 + 1)], "grande.bin");
    const got = await readChosen([big, new File(["x"], "pequeno.txt")]);
    assert.deepEqual(got.skipped, [{ name: "grande.bin", reason: "too_large" }]);
    assert.deepEqual(got.files.map((f) => f.name), ["pequeno.txt"]);
  });

  test("the limit asked is kept, but never past what a message to the server carries", async () => {
    const two = new File([new Uint8Array(2 * 1024 * 1024)], "dois.bin");
    const small = await readChosen([two], 1);
    assert.deepEqual(small.skipped, [{ name: "dois.bin", reason: "too_large" }]);
    const wide = new File([new Uint8Array(33 * 1024 * 1024)], "trinta-e-tres.bin");
    const got = await readChosen([wide], 200);
    assert.deepEqual(got.skipped, [{ name: "trinta-e-tres.bin", reason: "too_large" }]);
  });

  test("nothing chosen is nothing", async () => {
    assert.deepEqual(await readChosen([]), { files: [], skipped: [] });
  });
});
