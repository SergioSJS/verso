// Tests for label parsing, emoji hex conversions, color resolutions and
// frontmatter modifications (ADR 0060, S1).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { decodeHexEmoji, encodeEmojiToHex, resolveColor, resolveLucideName } = await import("../src/labels.js").catch(async () => {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/labels.ts"],
    bundle: true,
    format: "esm",
    outfile: "test/.bundles/labels.test-bundle.mjs",
  });
  return import("./.bundles/labels.test-bundle.mjs");
});

describe("Labels and Stickers (ADR 0060 S1)", () => {
  test("emoji hex decoding and encoding", () => {
    assert.equal(decodeHexEmoji("1f3b2"), "🎲");
    assert.equal(decodeHexEmoji("1f600"), "😀");
    assert.equal(encodeEmojiToHex("🎲"), "emoji//1f3b2");
    assert.equal(encodeEmojiToHex("😀"), "emoji//1f600");
  });

  test("Lucide and UI icon resolution", () => {
    assert.equal(resolveLucideName("lucide//home"), "house");
    assert.equal(resolveLucideName("ui//home"), "house");
    assert.equal(resolveLucideName("lucide//trash"), "trash-2");
    assert.equal(resolveLucideName("lucide//bookmark"), "bookmark");
    assert.equal(resolveLucideName("pencil"), "pencil");
  });

  test("color resolution", () => {
    assert.equal(resolveColor("red"), "#e05252");
    assert.equal(resolveColor("Vermelho"), "#e05252");
    assert.equal(resolveColor("Red"), "#e05252");
    assert.equal(resolveColor("blue"), "#4361ee");
    assert.equal(resolveColor("#abcdef"), "#abcdef");
    assert.equal(resolveColor(""), null);
    assert.equal(resolveColor(null), null);
  });
});
