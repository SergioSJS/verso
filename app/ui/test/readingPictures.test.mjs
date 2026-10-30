// The reading view drawn again (a save, someone else's typing) puts the
// pictures it drew before back at once — before the core answers — so no
// picture goes blank and no height collapses at every redraw (the flicker a
// reader saw in a note with pictures while others typed, night 2026-10-30).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

let answer = () => "assets/a.png";
const held = [];
let hold = false;
globalThis.window = globalThis;
globalThis.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    if (cmd !== "resolve_attachment") throw new Error(cmd);
    if (hold) await new Promise((r) => held.push(r));
    return answer(args);
  },
  convertFileSrc: (path, protocol) => `${protocol}://localhost/${path}`,
  transformCallback: () => 0,
};
await esbuild.build({ entryPoints: ["src/images.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/readingPictures.test-bundle.mjs", logLevel: "error" });
const { noteImages, forgetDrawn, drawnBefore, drawnNow } = await import("./.bundles/readingPictures.test-bundle.mjs");

const picture = (src) => {
  const img = { dataset: { src }, src: "", removeAttribute: () => (img.src = "") };
  return img;
};
const root = (...imgs) => ({ querySelectorAll: () => imgs });

test("the first drawing waits for the core; the next shows the picture before it answers", async () => {
  forgetDrawn();
  const first = picture("a.png");
  await noteImages(root(first), "n.md");
  assert.equal(first.src, "verso://localhost/assets/a.png");
  hold = true;
  const again = picture("a.png");
  const running = noteImages(root(again), "n.md");
  assert.equal(again.src, "verso://localhost/assets/a.png", "shown in the same task, with the core's answer still pending");
  hold = false;
  held.splice(0).forEach((r) => r());
  await running;
  assert.equal(again.src, "verso://localhost/assets/a.png");
});

test("the core's answer wins when it differs, and a picture that no longer resolves is emptied", async () => {
  forgetDrawn();
  await noteImages(root(picture("a.png")), "n.md");
  answer = () => "assets/b.png";
  const moved = picture("a.png");
  await noteImages(root(moved), "n.md");
  assert.equal(moved.src, "verso://localhost/assets/b.png");
  answer = () => null;
  const gone = picture("a.png");
  await noteImages(root(gone), "n.md");
  assert.equal(gone.src, "");
  assert.equal(drawnBefore("picture", "n.md", "a.png"), null);
  answer = () => "assets/a.png";
});

test("what is not trusted after the folder's files changed, and embeds and pictures do not share a cache", async () => {
  forgetDrawn();
  await noteImages(root(picture("a.png")), "n.md");
  forgetDrawn();
  hold = true;
  const blank = picture("a.png");
  const running = noteImages(root(blank), "n.md");
  assert.equal(blank.src, "", "nothing known: it waits for the core");
  hold = false;
  held.splice(0).forEach((r) => r());
  await running;
  drawnNow("embed", "n.md", "x.png", "x.png");
  assert.equal(drawnBefore("picture", "n.md", "x.png"), undefined);
  assert.equal(drawnBefore("embed", "n.md", "x.png"), "x.png");
});
