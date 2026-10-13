// A planned change made again over a text that changed since the plan
// (the notice after a rename whose link rewrite skipped a note, 2026-10-10).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const esbuild = await import("esbuild");
await esbuild.build({ entryPoints: ["src/replay.ts"], bundle: true, format: "esm", outfile: "test/.bundles/replay.test-bundle.mjs" });
const { replay } = await import("./.bundles/replay.test-bundle.mjs");

describe("A planned change, made again", () => {
  const before = "# Índice\n\nVer [[Lista]].\n\nFim.\n";
  const after = "# Índice\n\nVer [[Lista nova]].\n\nFim.\n";

  test("over the same text: the plan as it was", () => {
    assert.equal(replay(before, after, before), after);
  });

  test("over a text changed elsewhere: the link changed, the other change kept", () => {
    const now = "# Índice\n\nUma linha nova.\n\nVer [[Lista]].\n\nFim.\n";
    assert.equal(replay(before, after, now), "# Índice\n\nUma linha nova.\n\nVer [[Lista nova]].\n\nFim.\n");
  });

  test("a line the plan changed, changed too: null, for a person to look", () => {
    const now = "# Índice\n\nVer [[Lista]] e [[Outra]].\n\nFim.\n";
    assert.equal(replay(before, after, now), null);
  });

  test("already changed meanwhile: nothing left to change", () => {
    const now = "# Índice\n\nVer [[Lista nova]].\n\nFim, e mais.\n";
    assert.equal(replay(before, after, now), now);
  });

  test("a plan that adds or removes lines is not guessed", () => {
    assert.equal(replay("a\nb\n", "a\nb\nc\n", "a\nb\nx\n"), null);
  });

  test("CRLF lines are kept as they are", () => {
    assert.equal(replay("x\r\n[[A]]\r\n", "x\r\n[[B]]\r\n", "y\r\n[[A]]\r\n"), "y\r\n[[B]]\r\n");
  });
});
