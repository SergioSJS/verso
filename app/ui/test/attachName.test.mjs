// The name an attached image gets: its own, never one that is taken, and a
// camera's by the minute it was taken; and the bound on its size.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/attachName.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/attachName.test-bundle.mjs",
  logLevel: "error",
});
const { cameraName, extensionOf, fitName, freeAttachment, MAX_IMAGE_BYTES, importSetting, importLimitMb, dropLimitMb } = await import("./.bundles/attachName.test-bundle.mjs");

describe("The name of an attached image", () => {
  test("is kept as it came when nothing holds it", () => {
    assert.equal(freeAttachment("Notas/assets", "capa.png", new Set()), "Notas/assets/capa.png");
    assert.equal(freeAttachment("", "capa.png", new Set()), "capa.png");
  });

  test("never overwrites: (2), (3)… on a collision, the extension kept", () => {
    const taken = new Set(["assets/capa.png", "assets/capa (2).png"]);
    assert.equal(freeAttachment("assets", "capa.png", taken), "assets/capa (3).png");
  });

  test("collides without regard to case, as a Mac or a Windows folder does", () => {
    assert.equal(freeAttachment("assets", "Capa.PNG", new Set(["assets/capa.png"])), "assets/Capa (2).PNG");
  });

  test("loses what a link cannot reach and a system cannot keep", () => {
    assert.equal(fitName("a[b]|c#d^e.png"), "a b c d e.png");
    assert.equal(fitName("x/y\\z:w?.png"), "x y z w .png");
    assert.equal(freeAttachment("assets", "../..//etc.png", new Set()), "assets/etc.png");
    assert.equal(freeAttachment("assets", "???", new Set()), "assets/Imagem");
  });

  test("a name with no extension keeps none; a dot-leading one loses its dots", () => {
    assert.equal(freeAttachment("a", "foto", new Set(["a/foto"])), "a/foto (2)");
    assert.equal(freeAttachment("a", ".hidden.png", new Set()), "a/hidden.png");
  });
});

describe("A camera's photo", () => {
  test("is named by the local time it was taken", () => {
    assert.equal(cameraName(new Date(2026, 9, 15, 14, 25, 30), "jpg"), "Foto 2026-10-15 142530.jpg");
    assert.equal(cameraName(new Date(2026, 0, 2, 3, 4, 5), "heic"), "Foto 2026-01-02 030405.heic");
    assert.equal(cameraName(new Date(2026, 0, 2, 3, 4, 5), "jpg", "Photo"), "Photo 2026-01-02 030405.jpg");
  });

  test("takes its extension from its name, else from its type", () => {
    assert.equal(extensionOf("image/jpeg", "IMG_1.JPEG"), "jpeg");
    assert.equal(extensionOf("image/jpeg", "blob"), "jpg");
    assert.equal(extensionOf("image/svg+xml", ""), "svg");
    assert.equal(extensionOf("", ""), "jpg");
  });
});

describe("The bound on an image sent to a server", () => {
  test("as base64 it fits a message of 48 MiB with room to spare", () => {
    assert.ok(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) < 48 * 1024 * 1024 - 1024 * 1024);
  });
});

describe("review M13: names Windows would refuse or rewrite", () => {
  test("a trailing dot or space is dropped", () => {
    assert.equal(fitName("capa.png."), "capa.png");
    assert.equal(fitName("capa. . "), "capa");
    assert.equal(freeAttachment("a", "capa.png. ", new Set()), "a/capa.png");
  });
  test("a reserved device name gets an underscore, with any extension and in any case", () => {
    for (const [name, want] of [["con.txt", "con_.txt"], ["CON", "CON_"], ["Nul.PNG", "Nul_.PNG"], ["com1.png", "com1_.png"], ["LPT9.tar.gz", "LPT9_.tar.gz"], ["aux", "aux_"], ["prn.md", "prn_.md"]]) {
      assert.equal(freeAttachment("", name, new Set()), want, name);
    }
  });
  test("names that only resemble a reserved one stay", () => {
    for (const name of ["console.png", "com10.png", "com0.png", "lpt.png", "nulo.png", "aux x.png"]) assert.equal(freeAttachment("", name, new Set()), name);
  });
  test("the underscore name still collides on its own terms", () => {
    assert.equal(freeAttachment("", "con.txt", new Set(["con_.txt"])), "con_ (2).txt");
  });
});

describe("The size limit of an imported file (I.1b)", () => {
  test("the setting is a whole number of megabytes between 1 and 1024; 32 for what is not a number", () => {
    assert.equal(importSetting(200), 200);
    assert.equal(importSetting(0), 1);
    assert.equal(importSetting(5000), 1024);
    assert.equal(importSetting(12.6), 13);
    assert.equal(importSetting(undefined), 32);
    assert.equal(importSetting(Number.NaN), 32);
  });

  test("Import files takes the setting on this computer's folder and at most 32 MB on a server's", () => {
    assert.equal(importLimitMb(200, false), 200);
    assert.equal(importLimitMb(200, true), 32);
    assert.equal(importLimitMb(8, true), 8);
  });

  test("a drop never goes past what a message carries, since its bytes cross as base64", () => {
    assert.equal(dropLimitMb(200, false), 32);
    assert.equal(dropLimitMb(8, false), 8);
    assert.equal(dropLimitMb(200, true), 32);
  });
});
