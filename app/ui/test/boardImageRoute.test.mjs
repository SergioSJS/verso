// Where a new image put on a board is written: a player's goes through the
// server, never a write of the folder (ADR 0113 item 5, D); a new image needs only Edits on the board (K.6).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/board/imageRoute.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/boardImageRoute.test-bundle.mjs", logLevel: "error" });
const { imageRoute, imageFileName, attachSub, usedFolder } = await import("./.bundles/boardImageRoute.test-bundle.mjs");

test("a player who edits the board: the server writes the new image", () => {
  assert.equal(imageRoute("player", true, true, true), "server");
});
test("a player who may not attach (a path the server did not describe) is refused, visibly", () => {
  assert.equal(imageRoute("player", true, true, false), "no-send");
});
test("a player who cannot edit the board is refused", () => {
  assert.equal(imageRoute("player", true, false, true), "no-edit");
});
test("the game master, an own folder and a visitor-less folder write as before", () => {
  assert.equal(imageRoute("master", true, true, true), "folder");
  assert.equal(imageRoute("own", false, true, false), "folder");
  assert.equal(imageRoute("player", false, true, false), "folder");
});
test("a GIF without a name stays a GIF", () => {
  assert.equal(imageFileName("", "image/gif"), "image.gif");
  assert.equal(imageFileName("anim", "image/gif"), "anim.gif");
  assert.equal(imageFileName("foto.gif", "image/png"), "foto.gif");
  assert.equal(imageFileName("x", "image/jpeg"), "x.jpg");
  assert.equal(imageFileName("x", ""), "x.png");
});
test("a generic browser name takes the extension of the bytes' type", () => {
  assert.equal(imageFileName("image.png", "image/gif"), "image.gif");
  assert.equal(imageFileName("image", "image/webp"), "image.webp");
  assert.equal(imageFileName("blob", "image/jpeg"), "image.jpg");
  assert.equal(imageFileName("image.png", "image/png"), "image.png");
});
test("a real name with a known extension stays; an unknown 'extension' is not one", () => {
  assert.equal(imageFileName("foto.jpeg", "image/jpeg"), "foto.jpeg");
  assert.equal(imageFileName("mapa.PNG", "image/png"), "mapa.PNG");
  assert.equal(imageFileName("photo.v2", "image/gif"), "photo.v2.gif");
});
test("the subfolder sent with a player's new file is the setting, as the paste of anyone uses it", () => {
  assert.equal(attachSub("assets"), "assets");
  assert.equal(attachSub("  /fotos/mesa/ "), "fotos/mesa");
  assert.equal(attachSub(""), "");
});
test("the status names the folder the server really used", () => {
  assert.equal(usedFolder("Cofre/Mapa.canvas", "Cofre/fotos/mesa/x.png"), "fotos/mesa");
  assert.equal(usedFolder("Cofre/Mapa.canvas", "attachments/x.png"), "attachments");
  assert.equal(usedFolder("Livre.md", "assets/x.png"), "assets");
});
