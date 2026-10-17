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
const { cameraName, extensionOf, fitName, freeAttachment, MAX_IMAGE_BYTES } = await import("./.bundles/attachName.test-bundle.mjs");

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
